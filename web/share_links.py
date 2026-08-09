# -*- coding: utf-8 -*-
"""安全な共有リンクの発行・失効・アクセス管理。

トークン付きの期限リンクを発行し、有効期限・利用回数・失効（revoke）を
サーバー側で追跡する。トークン本体は itsdangerous で署名され、改ざんを検知する。
永続化は既存の subscribers ストアと同様に SQLite / PostgreSQL を切り替える。
"""

from __future__ import annotations

import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

SHARE_SALT = "kachisuji-share"
# 署名トークンに許容する最大寿命（DB 側の期限とは別の安全上限）。
SHARE_TOKEN_HARD_MAX_AGE_SECONDS = 60 * 60 * 24 * 365
DEFAULT_SHARE_TTL_SECONDS = 60 * 60 * 24 * 7
MAX_SHARE_TTL_SECONDS = 60 * 60 * 24 * 90


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class ShareLink:
    """発行済み共有リンク1件のメタ情報。"""

    jti: str
    target: str
    label: str
    expires_at: int
    max_uses: int | None
    used_count: int
    revoked: bool
    created_at: str

    def is_expired(self, *, now: int | None = None) -> bool:
        current = now if now is not None else int(_now_utc().timestamp())
        return self.expires_at <= current

    def uses_exhausted(self) -> bool:
        return self.max_uses is not None and self.used_count >= self.max_uses

    def is_active(self, *, now: int | None = None) -> bool:
        return not self.revoked and not self.is_expired(now=now) and not self.uses_exhausted()

    def to_public_dict(self) -> dict[str, Any]:
        now = int(_now_utc().timestamp())
        return {
            "id": self.jti,
            "target": self.target,
            "label": self.label,
            "expires_at": self.expires_at,
            "expires_in": max(0, self.expires_at - now),
            "max_uses": self.max_uses,
            "used_count": self.used_count,
            "revoked": self.revoked,
            "active": self.is_active(now=now),
            "created_at": self.created_at,
        }


class ShareLinkStore:
    """共有リンクの永続化インターフェース。"""

    def ensure_schema(self) -> None:
        raise NotImplementedError

    def create(self, link: ShareLink) -> None:
        raise NotImplementedError

    def get(self, jti: str) -> ShareLink | None:
        raise NotImplementedError

    def list(self, *, include_inactive: bool = True) -> list[ShareLink]:
        raise NotImplementedError

    def increment_use(self, jti: str) -> ShareLink | None:
        """利用回数をアトミックに +1 する。上限超過や失効なら None を返す。"""
        raise NotImplementedError

    def revoke(self, jti: str) -> bool:
        raise NotImplementedError


def _row_to_link(row: Any, columns: list[str] | None = None) -> ShareLink:
    if columns is not None:
        data = dict(zip(columns, row, strict=False))
    else:
        data = dict(row)
    return ShareLink(
        jti=str(data["jti"]),
        target=str(data["target"]),
        label=str(data["label"] or ""),
        expires_at=int(data["expires_at"]),
        max_uses=(int(data["max_uses"]) if data["max_uses"] is not None else None),
        used_count=int(data["used_count"]),
        revoked=bool(data["revoked"]),
        created_at=str(data["created_at"]),
    )


class SQLiteShareLinkStore(ShareLinkStore):
    def __init__(self, path: Path):
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def ensure_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS share_links (
                    jti TEXT PRIMARY KEY,
                    target TEXT NOT NULL,
                    label TEXT,
                    expires_at INTEGER NOT NULL,
                    max_uses INTEGER,
                    used_count INTEGER NOT NULL DEFAULT 0,
                    revoked INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                )
                """
            )

    def create(self, link: ShareLink) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO share_links (
                    jti, target, label, expires_at, max_uses, used_count, revoked, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    link.jti,
                    link.target,
                    link.label,
                    link.expires_at,
                    link.max_uses,
                    link.used_count,
                    1 if link.revoked else 0,
                    link.created_at,
                ),
            )

    def get(self, jti: str) -> ShareLink | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM share_links WHERE jti = ?", (jti,)
            ).fetchone()
        return _row_to_link(row) if row else None

    def list(self, *, include_inactive: bool = True) -> list[ShareLink]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM share_links ORDER BY created_at DESC"
            ).fetchall()
        links = [_row_to_link(r) for r in rows]
        if include_inactive:
            return links
        return [link for link in links if link.is_active()]

    def increment_use(self, jti: str) -> ShareLink | None:
        with self._connect() as conn:
            now = int(_now_utc().timestamp())
            cur = conn.execute(
                """
                UPDATE share_links
                SET used_count = used_count + 1
                WHERE jti = ?
                  AND revoked = 0
                  AND expires_at > ?
                  AND (max_uses IS NULL OR used_count < max_uses)
                """,
                (jti, now),
            )
            if cur.rowcount == 0:
                return None
            row = conn.execute(
                "SELECT * FROM share_links WHERE jti = ?", (jti,)
            ).fetchone()
        return _row_to_link(row) if row else None

    def revoke(self, jti: str) -> bool:
        with self._connect() as conn:
            cur = conn.execute(
                "UPDATE share_links SET revoked = 1 WHERE jti = ?", (jti,)
            )
            return cur.rowcount > 0


class PostgresShareLinkStore(ShareLinkStore):
    def __init__(self, dsn: str):
        self.dsn = dsn
        self._psycopg = None

    def _connect(self):
        if self._psycopg is None:
            import psycopg  # type: ignore[import-not-found]

            self._psycopg = psycopg
        return self._psycopg.connect(self.dsn)

    def ensure_schema(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS share_links (
                        jti TEXT PRIMARY KEY,
                        target TEXT NOT NULL,
                        label TEXT,
                        expires_at BIGINT NOT NULL,
                        max_uses INTEGER,
                        used_count INTEGER NOT NULL DEFAULT 0,
                        revoked BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
            conn.commit()

    def create(self, link: ShareLink) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO share_links (
                        jti, target, label, expires_at, max_uses, used_count, revoked, created_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        link.jti,
                        link.target,
                        link.label,
                        link.expires_at,
                        link.max_uses,
                        link.used_count,
                        link.revoked,
                        link.created_at,
                    ),
                )
            conn.commit()

    def _fetch(self, jti: str) -> ShareLink | None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM share_links WHERE jti = %s", (jti,))
                row = cur.fetchone()
                if row is None:
                    return None
                columns = [c.name for c in cur.description]
        return _row_to_link(row, columns)

    def get(self, jti: str) -> ShareLink | None:
        return self._fetch(jti)

    def list(self, *, include_inactive: bool = True) -> list[ShareLink]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM share_links ORDER BY created_at DESC")
                rows = cur.fetchall()
                columns = [c.name for c in cur.description]
        links = [_row_to_link(r, columns) for r in rows]
        if include_inactive:
            return links
        return [link for link in links if link.is_active()]

    def increment_use(self, jti: str) -> ShareLink | None:
        now = int(_now_utc().timestamp())
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE share_links
                    SET used_count = used_count + 1
                    WHERE jti = %s
                      AND revoked = FALSE
                      AND expires_at > %s
                      AND (max_uses IS NULL OR used_count < max_uses)
                    RETURNING *
                    """,
                    (jti, now),
                )
                row = cur.fetchone()
                if row is None:
                    conn.commit()
                    return None
                columns = [c.name for c in cur.description]
            conn.commit()
        return _row_to_link(row, columns)

    def revoke(self, jti: str) -> bool:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE share_links SET revoked = TRUE WHERE jti = %s", (jti,)
                )
                changed = cur.rowcount > 0
            conn.commit()
        return changed


def build_store(sqlite_path: Path) -> ShareLinkStore:
    dsn = os.getenv("DATABASE_URL")
    if dsn:
        return PostgresShareLinkStore(dsn)
    return SQLiteShareLinkStore(sqlite_path)


class ShareLinkService:
    """署名トークンの発行・検証とストアをまとめた高レベル API。"""

    def __init__(self, *, store: ShareLinkStore, secret_key: str):
        if not secret_key:
            raise ValueError("secret_key is required for share links")
        self.store = store
        self.serializer = URLSafeTimedSerializer(secret_key, salt=SHARE_SALT)
        self.store.ensure_schema()

    def create(
        self,
        *,
        target: str,
        ttl_seconds: int = DEFAULT_SHARE_TTL_SECONDS,
        max_uses: int | None = None,
        label: str = "",
    ) -> tuple[str, ShareLink]:
        ttl = max(1, min(int(ttl_seconds), MAX_SHARE_TTL_SECONDS))
        if max_uses is not None:
            max_uses = max(1, int(max_uses))
        jti = uuid.uuid4().hex
        now = _now_utc()
        link = ShareLink(
            jti=jti,
            target=target,
            label=label,
            expires_at=int(now.timestamp()) + ttl,
            max_uses=max_uses,
            used_count=0,
            revoked=False,
            created_at=now.isoformat(),
        )
        self.store.create(link)
        token = self.serializer.dumps({"jti": jti})
        return token, link

    def _decode(self, token: str) -> str | None:
        try:
            data = self.serializer.loads(
                token, max_age=SHARE_TOKEN_HARD_MAX_AGE_SECONDS
            )
        except (BadSignature, SignatureExpired):
            return None
        if not isinstance(data, dict):
            return None
        jti = data.get("jti")
        return jti if isinstance(jti, str) else None

    def redeem(self, token: str) -> ShareLink | None:
        """トークンを検証し、利用回数を消費して有効な ShareLink を返す。

        署名不正・失効・期限切れ・利用上限超過の場合は None。
        """
        jti = self._decode(token)
        if jti is None:
            return None
        return self.store.increment_use(jti)

    def inspect(self, token: str) -> ShareLink | None:
        """利用回数を消費せずにトークンに対応する ShareLink を返す。"""
        jti = self._decode(token)
        if jti is None:
            return None
        return self.store.get(jti)

    def revoke(self, jti: str) -> bool:
        return self.store.revoke(jti)

    def list(self, *, include_inactive: bool = True) -> list[ShareLink]:
        return self.store.list(include_inactive=include_inactive)

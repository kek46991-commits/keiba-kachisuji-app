# -*- coding: utf-8 -*-
"""共有リンク（トークン付き期限リンク）の発行・失効・アクセス管理テスト。"""
from __future__ import annotations

import os
import sys
import tempfile
import time
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
sys.path.insert(0, str(WEB_DIR))

# server を import する前に、管理者トークン用の APP_SECRET_KEY と隔離 DB を設定する。
ADMIN_KEY = "test-admin-secret-key"
os.environ["APP_SECRET_KEY"] = ADMIN_KEY
os.environ["STRIPE_SECRET_KEY"] = "sk_test_dummy"
os.environ["STRIPE_WEBHOOK_SECRET"] = "whsec_dummy"
os.environ["SUBSCRIBERS_DB_PATH"] = str(
    Path(tempfile.gettempdir()) / f"share_test_{os.getpid()}.db"
)


@pytest.fixture(scope="module")
def client():
    with patch("stripe.Webhook.construct_event"), \
         patch("stripe.checkout.Session.create"), \
         patch("stripe.billing_portal.Session.create"):
        from server import app  # noqa: PLC0415
        return TestClient(app, raise_server_exceptions=False)


AUTH = {"Authorization": f"Bearer {ADMIN_KEY}"}


def _create(client: TestClient, **payload) -> dict:
    res = client.post("/api/share", json=payload, headers=AUTH)
    assert res.status_code == 200, res.text
    return res.json()


class TestShareAdminAuth:
    def test_create_requires_auth(self, client: TestClient) -> None:
        res = client.post("/api/share", json={"target": "/app"})
        assert res.status_code == 401

    def test_list_requires_auth(self, client: TestClient) -> None:
        assert client.get("/api/share").status_code == 401

    def test_revoke_requires_auth(self, client: TestClient) -> None:
        assert client.post("/api/share/whatever/revoke").status_code == 401


class TestShareCreate:
    def test_create_returns_url_and_metadata(self, client: TestClient) -> None:
        data = _create(client, target="/app", ttl_seconds=3600, label="友人用")
        assert "/s/" in data["url"]
        assert data["link"]["target"] == "/app"
        assert data["link"]["label"] == "友人用"
        assert data["link"]["active"] is True
        assert data["link"]["expires_in"] > 0

    def test_create_rejects_unknown_target(self, client: TestClient) -> None:
        res = client.post("/api/share", json={"target": "/etc/passwd"}, headers=AUTH)
        assert res.status_code == 400

    def test_create_rejects_bad_int(self, client: TestClient) -> None:
        res = client.post(
            "/api/share", json={"target": "/app", "ttl_seconds": "abc"}, headers=AUTH
        )
        assert res.status_code == 400


class TestShareRedeem:
    def test_redeem_grants_access_to_app(self, client: TestClient) -> None:
        data = _create(client, target="/app", ttl_seconds=3600)
        token_path = data["url"].split("/s/")[1]

        # 認証なしでは /app はリダイレクト
        res = client.get("/app", follow_redirects=False)
        assert res.status_code == 303

        # 共有リンクを踏むと Cookie が付与され /app へ 303
        redeem = client.get(f"/s/{token_path}", follow_redirects=False)
        assert redeem.status_code == 303
        assert redeem.headers["location"] == "/app"

        # Cookie 付きで /app が 200
        res = client.get("/app")
        assert res.status_code == 200
        client.cookies.clear()

    def test_invalid_token_returns_410(self, client: TestClient) -> None:
        res = client.get("/s/not-a-real-token", follow_redirects=False)
        assert res.status_code == 410


class TestShareRevoke:
    def test_revoke_blocks_further_redemption(self, client: TestClient) -> None:
        data = _create(client, target="/app", ttl_seconds=3600)
        token_path = data["url"].split("/s/")[1]
        jti = data["link"]["id"]

        rev = client.post(f"/api/share/{jti}/revoke", headers=AUTH)
        assert rev.status_code == 200
        assert rev.json()["revoked"] is True

        # 失効後は redeem 不可
        res = client.get(f"/s/{token_path}", follow_redirects=False)
        assert res.status_code == 410

    def test_revoke_unknown_returns_404(self, client: TestClient) -> None:
        assert client.post("/api/share/deadbeef/revoke", headers=AUTH).status_code == 404


class TestShareMaxUses:
    def test_max_uses_exhausts(self, client: TestClient) -> None:
        data = _create(client, target="/app", ttl_seconds=3600, max_uses=1)
        token_path = data["url"].split("/s/")[1]

        first = client.get(f"/s/{token_path}", follow_redirects=False)
        assert first.status_code == 303
        client.cookies.clear()

        second = client.get(f"/s/{token_path}", follow_redirects=False)
        assert second.status_code == 410


class TestShareList:
    def test_list_returns_created_links(self, client: TestClient) -> None:
        _create(client, target="/yoso1", ttl_seconds=3600, label="一覧テスト")
        res = client.get("/api/share", headers=AUTH)
        assert res.status_code == 200
        labels = [link["label"] for link in res.json()["links"]]
        assert "一覧テスト" in labels

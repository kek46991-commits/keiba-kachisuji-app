# -*- coding: utf-8 -*-
"""FastAPI backend for the paid web product."""

from __future__ import annotations

import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import stripe
from fastapi import FastAPI, Form, Header, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

WEB_DIR = Path(__file__).resolve().parent
ROOT_DIR = WEB_DIR.parent
SITE_DIR = ROOT_DIR / "site"
TEMPLATES_DIR = WEB_DIR / "templates"
STATIC_DIR = WEB_DIR / "static"
DEFAULT_SQLITE_DB_PATH = WEB_DIR / "subscribers.db"


def _sqlite_db_path() -> Path:
    configured = os.getenv("SUBSCRIBERS_DB_PATH")
    if configured:
        return Path(configured)
    if os.getenv("VERCEL") or os.getenv("NETLIFY"):
        return Path("/tmp/subscribers.db")
    return DEFAULT_SQLITE_DB_PATH


SUBSCRIBERS_DB_PATH = _sqlite_db_path()

COOKIE_NAME = "kachisuji_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

APP_SECRET_KEY = os.getenv("APP_SECRET_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
DEMO_MODE = os.getenv("DEMO_MODE", "").strip().lower() in {"1", "true", "yes", "on"}
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
serializer = URLSafeTimedSerializer(APP_SECRET_KEY or "demo-secret", salt="kachisuji-session")

app = FastAPI(title="勝ち筋解析システム Web", version="0.1.0")


app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="public-static")


def _public_url(path: str) -> str:
    return f"{PUBLIC_BASE_URL}{path}"


def _seo_context(
    *,
    title: str,
    description: str,
    path: str,
    noindex: bool = False,
    json_ld: dict[str, Any] | list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    canonical_url = _public_url(path)
    og_image_url = _public_url("/static/og.png")
    favicon_url = _public_url("/static/favicon.png")
    return {
        "title": title,
        "description": description,
        "base_url": PUBLIC_BASE_URL,
        "canonical_url": canonical_url,
        "canonical_path": path,
        "page_url": canonical_url,
        "og_image_url": og_image_url,
        "favicon_url": favicon_url,
        "og_site_name": "勝ち筋解析システム",
        "locale": "ja_JP",
        "twitter_card": "summary_large_image",
        "robots_content": "noindex,nofollow" if noindex else "index,follow",
        "json_ld": json_ld,
    }


def _seo_for_landing() -> dict[str, Any]:
    price_label = os.getenv("APP_PRICE_LABEL", "月額 1,980円")
    description = "中央競馬G1の期待値(EV)を実データ×ML予測とバックテストで検証し、比較・妙味を見極めるサブスク型SaaS。"
    json_ld = [
        {
            "@context": "https://schema.org",
            "@type": "Organization",
            "name": "勝ち筋解析システム",
            "url": PUBLIC_BASE_URL,
            "logo": _public_url("/static/favicon.png"),
        },
        {
            "@context": "https://schema.org",
            "@type": "Service",
            "name": "勝ち筋解析システム",
            "serviceType": "競馬G1の期待値(EV)分析",
            "description": description,
            "provider": {"@type": "Organization", "name": "勝ち筋解析システム", "url": PUBLIC_BASE_URL},
            "offers": {
                "@type": "Offer",
                "price": price_label,
                "priceCurrency": "JPY",
                "availability": "https://schema.org/InStock",
                "url": PUBLIC_BASE_URL,
            },
        },
    ]
    return _seo_context(
        title="勝ち筋解析システム | 競馬G1の期待値(EV)をML+バックテストで検証するSaaS",
        description=description,
        path="/",
        json_ld=json_ld,
    ) | {"pricing_label": price_label}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _value(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


class SubscriberStore:
    def ensure_schema(self) -> None:
        raise NotImplementedError

    def upsert(
        self,
        *,
        stripe_customer_id: str,
        email: str,
        stripe_subscription_id: str | None,
        status: str,
        current_period_end: int | None,
    ) -> None:
        raise NotImplementedError

    def get(
        self,
        *,
        customer_id: str | None = None,
        email: str | None = None,
    ) -> sqlite3.Row | dict[str, Any] | None:
        raise NotImplementedError


class SQLiteSubscriberStore(SubscriberStore):
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
                CREATE TABLE IF NOT EXISTS subscribers (
                    stripe_customer_id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    stripe_subscription_id TEXT,
                    status TEXT NOT NULL,
                    current_period_end INTEGER,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"
            )

    def upsert(
        self,
        *,
        stripe_customer_id: str,
        email: str,
        stripe_subscription_id: str | None,
        status: str,
        current_period_end: int | None,
    ) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO subscribers (
                    stripe_customer_id,
                    email,
                    stripe_subscription_id,
                    status,
                    current_period_end,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(stripe_customer_id) DO UPDATE SET
                    email = excluded.email,
                    stripe_subscription_id = excluded.stripe_subscription_id,
                    status = excluded.status,
                    current_period_end = excluded.current_period_end,
                    updated_at = excluded.updated_at
                """,
                (
                    stripe_customer_id,
                    email,
                    stripe_subscription_id,
                    status,
                    current_period_end,
                    _now_utc().isoformat(),
                ),
            )

    def get(
        self,
        *,
        customer_id: str | None = None,
        email: str | None = None,
    ) -> sqlite3.Row | None:
        with self._connect() as conn:
            if customer_id:
                row = conn.execute(
                    "SELECT * FROM subscribers WHERE stripe_customer_id = ?",
                    (customer_id,),
                ).fetchone()
                if row:
                    return row
            if email:
                return conn.execute(
                    "SELECT * FROM subscribers WHERE email = ?",
                    (email,),
                ).fetchone()
        return None


class PostgresSubscriberStore(SubscriberStore):
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
                    CREATE TABLE IF NOT EXISTS subscribers (
                        stripe_customer_id TEXT PRIMARY KEY,
                        email TEXT NOT NULL UNIQUE,
                        stripe_subscription_id TEXT,
                        status TEXT NOT NULL,
                        current_period_end BIGINT,
                        updated_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                cur.execute(
                    "CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email)"
                )

    def upsert(
        self,
        *,
        stripe_customer_id: str,
        email: str,
        stripe_subscription_id: str | None,
        status: str,
        current_period_end: int | None,
    ) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO subscribers (
                        stripe_customer_id,
                        email,
                        stripe_subscription_id,
                        status,
                        current_period_end,
                        updated_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (stripe_customer_id) DO UPDATE SET
                        email = EXCLUDED.email,
                        stripe_subscription_id = EXCLUDED.stripe_subscription_id,
                        status = EXCLUDED.status,
                        current_period_end = EXCLUDED.current_period_end,
                        updated_at = EXCLUDED.updated_at
                    """,
                    (
                        stripe_customer_id,
                        email,
                        stripe_subscription_id,
                        status,
                        current_period_end,
                        _now_utc(),
                    ),
                )
            conn.commit()

    def get(
        self,
        *,
        customer_id: str | None = None,
        email: str | None = None,
    ) -> dict[str, Any] | None:
        query = "SELECT * FROM subscribers WHERE stripe_customer_id = %s"
        params: tuple[Any, ...] = ()
        if customer_id:
            params = (customer_id,)
        elif email:
            query = "SELECT * FROM subscribers WHERE email = %s"
            params = (email,)
        else:
            return None
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
                row = cur.fetchone()
                if row is None:
                    return None
                columns = [column.name for column in cur.description]
        return dict(zip(columns, row, strict=False))


def _subscriber_store() -> SubscriberStore:
    if os.getenv("DATABASE_URL"):
        return PostgresSubscriberStore(os.environ["DATABASE_URL"])
    return SQLiteSubscriberStore(SUBSCRIBERS_DB_PATH)


SUBSCRIBER_STORE = _subscriber_store()
SUBSCRIBER_STORE.ensure_schema()


def _upsert_subscriber(
    *,
    stripe_customer_id: str,
    email: str,
    stripe_subscription_id: str | None,
    status: str,
    current_period_end: int | None,
) -> None:
    SUBSCRIBER_STORE.upsert(
        stripe_customer_id=stripe_customer_id,
        email=email,
        stripe_subscription_id=stripe_subscription_id,
        status=status,
        current_period_end=current_period_end,
    )


def _get_subscriber(*, customer_id: str | None = None, email: str | None = None):
    return SUBSCRIBER_STORE.get(customer_id=customer_id, email=email)


def _serializer() -> URLSafeTimedSerializer:
    if not APP_SECRET_KEY:
        raise HTTPException(status_code=503, detail="APP_SECRET_KEY が未設定です。")
    return serializer


def _sign_session(*, customer_id: str, email: str) -> str:
    return _serializer().dumps({"customer_id": customer_id, "email": email})


def _unsign_session(token: str) -> dict[str, Any]:
    data = _serializer().loads(token, max_age=SESSION_MAX_AGE_SECONDS)
    if not isinstance(data, dict):
        raise BadSignature("invalid session payload")
    return data


def _set_auth_cookie(response: Response, *, customer_id: str, email: str) -> None:
    response.set_cookie(
        COOKIE_NAME,
        _sign_session(customer_id=customer_id, email=email),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        samesite="lax",
        secure=os.getenv("COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes", "on"},
        path="/",
    )


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def _session_from_cookie(request: Request) -> dict[str, Any] | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    try:
        return _unsign_session(token)
    except (BadSignature, SignatureExpired):
        return None


def _subscription_is_active(status: str | None, current_period_end: int | None) -> bool:
    if status in {"active", "trialing"}:
        if current_period_end is None:
            return True
        return current_period_end >= int(_now_utc().timestamp())
    return False


def _require_demo_or_auth(request: Request) -> dict[str, Any] | None:
    if DEMO_MODE:
        return {"customer_id": "demo", "email": "demo@example.com"}
    session = _session_from_cookie(request)
    if not session:
        return None
    row = _get_subscriber(customer_id=session.get("customer_id"), email=session.get("email"))
    if row and _subscription_is_active(row["status"], row["current_period_end"]):
        return session
    return None


def _render_paid_app() -> str:
    html = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    html = html.replace('href="styles.css"', 'href="/app/static/styles.css"')
    html = html.replace('src="js/app.js"', 'src="/app/static/js/app.js"')
    noindex = '<meta name="robots" content="noindex,nofollow" />'
    if '<meta name="robots" content="noindex,nofollow"' not in html:
        html = html.replace('<meta name="viewport" content="width=device-width, initial-scale=1.0" />', '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  ' + noindex, 1)
    return html


def _legal_response(
    request: Request,
    template_name: str,
    title: str,
    *,
    description: str,
    path: str,
    lang: str = "ja",
) -> HTMLResponse:
    context = _seo_context(title=title, description=description, path=path)
    context["lang"] = lang
    return templates.TemplateResponse(request, template_name, context)


@app.get("/terms", response_class=HTMLResponse)
def terms_ja(request: Request) -> HTMLResponse:
    return _legal_response(
        request,
        "legal/terms_ja.html",
        "利用規約",
        description="中央競馬G1の予測・期待値(EV)分析ツールに関する利用条件。免責、解約、返金、禁止事項を定めます。",
        path="/terms",
    )


@app.get("/terms/en", response_class=HTMLResponse)
def terms_en(request: Request) -> HTMLResponse:
    return _legal_response(
        request,
        "legal/terms_en.html",
        "Terms of Service",
        description="Terms for the G1 prediction and EV analytics subscription service. Japanese version prevails.",
        path="/terms/en",
        lang="en",
    )


@app.get("/tokushoho", response_class=HTMLResponse)
def tokushoho(request: Request) -> HTMLResponse:
    context = _seo_context(
        title="特定商取引法に基づく表記",
        description="Japanese Specified Commercial Transactions Act disclosure for the subscription horse-racing analytics service.",
        path="/tokushoho",
    )
    context["lang"] = "ja"
    context["pricing_label"] = os.getenv("APP_PRICE_LABEL", "月額 1,980円")
    return templates.TemplateResponse(request, "legal/tokushoho.html", context)


@app.get("/privacy", response_class=HTMLResponse)
def privacy(request: Request) -> HTMLResponse:
    return _legal_response(
        request,
        "legal/privacy_ja.html",
        "プライバシーポリシー",
        description="取得情報、利用目的、第三者提供、Cookie、開示請求先を定める簡易プライバシーポリシー。",
        path="/privacy",
    )


@app.get("/robots.txt")
def robots_txt() -> PlainTextResponse:
    body = "\n".join([
        "User-agent: *",
        "Allow: /",
        "Disallow: /app",
        "Disallow: /api/",
        f"Sitemap: {_public_url('/sitemap.xml')}",
    ]) + "\n"
    return PlainTextResponse(body, media_type="text/plain; charset=utf-8")


@app.get("/sitemap.xml")
def sitemap_xml() -> Response:
    urls = ["/", "/terms", "/terms/en", "/tokushoho", "/privacy"]
    items = "".join(f"<url><loc>{_public_url(path)}</loc></url>" for path in urls)
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{items}"
        '</urlset>'
    )
    return Response(content=body, media_type="application/xml; charset=utf-8")


def _stripe_ready() -> bool:
    return bool(STRIPE_SECRET_KEY and STRIPE_PRICE_ID)


def _stripe_client() -> None:
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="Stripe未設定: STRIPE_SECRET_KEY が未設定です。")
    stripe.api_key = STRIPE_SECRET_KEY


def _customer_email(customer_id: str | None, fallback: str | None = None) -> str:
    if fallback:
        return fallback
    if not customer_id:
        return ""
    customer = stripe.Customer.retrieve(customer_id)
    email = _value(customer, "email")
    return email or ""


def _sync_subscription(subscription: Any, *, email: str | None = None) -> None:
    customer_id = _value(subscription, "customer")
    subscription_id = _value(subscription, "id")
    status = _value(subscription, "status")
    current_period_end = (
        _value(subscription, "current_period_end")
    )
    if not email:
        email = _customer_email(customer_id)
    if not email:
        return
    mapped_status = "active" if _subscription_is_active(status, current_period_end) else "canceled"
    _upsert_subscriber(
        stripe_customer_id=str(customer_id),
        email=str(email),
        stripe_subscription_id=str(subscription_id),
        status=mapped_status,
        current_period_end=int(current_period_end) if current_period_end else None,
    )


@app.get("/", response_class=HTMLResponse)
def landing(request: Request) -> HTMLResponse:
    context = _seo_for_landing()
    context.update({"demo_mode": DEMO_MODE, "stripe_ready": _stripe_ready()})
    return templates.TemplateResponse(request, "landing.html", context)


@app.head("/")
def landing_head() -> Response:
    return Response(status_code=200, media_type="text/html")


@app.post("/api/checkout")
def create_checkout_session(request: Request) -> JSONResponse:
    if not _stripe_ready():
        return JSONResponse(
            status_code=503,
            content={"detail": "Stripe未設定: STRIPE_SECRET_KEY または STRIPE_PRICE_ID が未設定です。"},
        )
    _stripe_client()
    base_url = str(request.base_url).rstrip("/")
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
        success_url=f"{base_url}/access?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{base_url}/",
    )
    return JSONResponse({"url": session.url})


@app.post("/api/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> JSONResponse:
    if not STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="STRIPE_WEBHOOK_SECRET が未設定です。")
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=503, detail="STRIPE_SECRET_KEY が未設定です。")
    _stripe_client()
    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, STRIPE_WEBHOOK_SECRET)
    except Exception as exc:  # pragma: no cover - Stripe 署名失敗の経路
        raise HTTPException(status_code=400, detail=f"Webhook verification failed: {exc}") from exc

    event_type = event["type"]
    data_object = event["data"]["object"]

    if event_type == "checkout.session.completed":
        customer_id = data_object.get("customer")
        subscription_id = data_object.get("subscription")
        customer_email = data_object.get("customer_details", {}).get("email") or data_object.get("customer_email")
        if customer_id and subscription_id:
            subscription = stripe.Subscription.retrieve(subscription_id)
            _sync_subscription(subscription, email=customer_email)
    elif event_type in {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
    }:
        customer_email = None
        customer_id = data_object.get("customer")
        if customer_id:
            customer_email = _customer_email(customer_id, data_object.get("customer_email"))
        _sync_subscription(data_object, email=customer_email)

    return JSONResponse({"received": True})


@app.get("/api/portal")
def billing_portal(request: Request) -> Response:
    session = _require_demo_or_auth(request)
    if not session:
        return RedirectResponse("/", status_code=303)
    if not _stripe_ready():
        raise HTTPException(status_code=503, detail="Stripe未設定: STRIPE_SECRET_KEY または STRIPE_PRICE_ID が未設定です。")
    _stripe_client()
    base_url = str(request.base_url).rstrip("/")
    portal = stripe.billing_portal.Session.create(
        customer=session["customer_id"],
        return_url=f"{base_url}/app",
    )
    return RedirectResponse(portal.url, status_code=303)


@app.get("/access")
def access(request: Request, session_id: str | None = None) -> Response:
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id が必要です。")
    if not _stripe_ready():
        raise HTTPException(status_code=503, detail="Stripe未設定: STRIPE_SECRET_KEY または STRIPE_PRICE_ID が未設定です。")
    _stripe_client()
    session = stripe.checkout.Session.retrieve(
        session_id,
        expand=["subscription", "customer"],
    )
    subscription = session.subscription
    if isinstance(subscription, str):
        subscription = stripe.Subscription.retrieve(subscription)
    customer = session.customer
    if isinstance(customer, str):
        customer = stripe.Customer.retrieve(customer)
    email = _value(_value(session, "customer_details"), "email") or _value(customer, "email")
    customer_id = _value(customer, "id")
    if not customer_id or not email:
        raise HTTPException(status_code=403, detail="購読情報を確認できませんでした。")
    if not _subscription_is_active(subscription.status, subscription.current_period_end):
        raise HTTPException(status_code=403, detail="サブスクリプションが有効ではありません。")
    _upsert_subscriber(
        stripe_customer_id=str(customer_id),
        email=str(email),
        stripe_subscription_id=str(subscription.id),
        status="active",
        current_period_end=int(subscription.current_period_end) if subscription.current_period_end else None,
    )
    response = RedirectResponse("/app", status_code=303)
    _set_auth_cookie(response, customer_id=str(customer_id), email=str(email))
    return response


@app.get("/app")
def paid_app(request: Request) -> Response:
    if not _require_demo_or_auth(request):
        return RedirectResponse("/", status_code=303)
    return HTMLResponse(_render_paid_app())


@app.head("/app")
def paid_app_head() -> Response:
    return Response(status_code=200, media_type="text/html")


@app.get("/app/")
def paid_app_slash(request: Request) -> Response:
    return paid_app(request)


@app.head("/app/")
def paid_app_slash_head() -> Response:
    return paid_app_head()


@app.get("/app/static/{file_path:path}")
def paid_app_static(request: Request, file_path: str) -> Response:
    if not _require_demo_or_auth(request):
        return RedirectResponse("/", status_code=303)
    resolved = (SITE_DIR / file_path).resolve()
    if SITE_DIR not in resolved.parents and resolved != SITE_DIR:
        raise HTTPException(status_code=404, detail="Not found")
    if not resolved.exists() or not resolved.is_file():
        raise HTTPException(status_code=404, detail="Not found")
    return FileResponse(resolved)


@app.head("/app/static/{file_path:path}")
def paid_app_static_head(request: Request, file_path: str) -> Response:
    return paid_app_static(request, file_path)


@app.post("/api/restore")
def restore_access(request: Request, email: str = Form(...)) -> JSONResponse:
    # メールアドレスの所有者確認 (magic-link / OTP) が未実装のため、本人確認なしで
    # Cookie を発行するのは認証バイパスになる。所有権確認を実装するまで無効化する。
    # 購読者は checkout 完了時の /access?session_id=... フローでアクセスを得られる。
    raise HTTPException(
        status_code=503,
        detail="アクセス復元は現在無効です。購読後のリンク (/access) からアクセスしてください。",
    )


@app.get("/logout")
def logout() -> Response:
    response = RedirectResponse("/", status_code=303)
    _clear_auth_cookie(response)
    return response

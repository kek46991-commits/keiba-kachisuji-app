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
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, FileResponse
from fastapi.templating import Jinja2Templates
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

WEB_DIR = Path(__file__).resolve().parent
ROOT_DIR = WEB_DIR.parent
SITE_DIR = ROOT_DIR / "site"
TEMPLATES_DIR = WEB_DIR / "templates"
DB_PATH = WEB_DIR / "subscribers.db"

COOKIE_NAME = "kachisuji_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

APP_SECRET_KEY = os.getenv("APP_SECRET_KEY", "")
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PRICE_ID = os.getenv("STRIPE_PRICE_ID", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
DEMO_MODE = os.getenv("DEMO_MODE", "").strip().lower() in {"1", "true", "yes", "on"}

templates = Jinja2Templates(directory=str(TEMPLATES_DIR))
serializer = URLSafeTimedSerializer(APP_SECRET_KEY or "demo-secret", salt="kachisuji-session")

app = FastAPI(title="勝ち筋解析システム Web", version="0.1.0")


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _value(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
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
    return conn


def _upsert_subscriber(
    *,
    stripe_customer_id: str,
    email: str,
    stripe_subscription_id: str | None,
    status: str,
    current_period_end: int | None,
) -> None:
    with _db() as conn:
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


def _get_subscriber(*, customer_id: str | None = None, email: str | None = None) -> sqlite3.Row | None:
    with _db() as conn:
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
    return html


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
    return templates.TemplateResponse(
        request,
        "landing.html",
        {
            "pricing_label": os.getenv("APP_PRICE_LABEL", "月額 1,980円"),
            "demo_mode": DEMO_MODE,
            "stripe_ready": _stripe_ready(),
        },
    )


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
    email = email.strip()
    if not email:
        raise HTTPException(status_code=400, detail="email が必要です。")
    if not _stripe_ready():
        return JSONResponse(
            status_code=503,
            content={"detail": "Stripe未設定: STRIPE_SECRET_KEY または STRIPE_PRICE_ID が未設定です。"},
        )
    _stripe_client()
    customers = stripe.Customer.list(email=email, limit=10)
    for customer in customers.auto_paging_iter():
        subscriptions = stripe.Subscription.list(customer=customer.id, status="all", limit=10)
        for subscription in subscriptions.auto_paging_iter():
            if _subscription_is_active(subscription.status, subscription.current_period_end):
                _sync_subscription(subscription, email=email)
                response = JSONResponse({"ok": True, "message": "アクセスを復元しました。"})
                _set_auth_cookie(response, customer_id=customer.id, email=email)
                return response
    raise HTTPException(status_code=404, detail="有効な購読が見つかりませんでした。")


@app.get("/logout")
def logout() -> Response:
    response = RedirectResponse("/", status_code=303)
    _clear_auth_cookie(response)
    return response

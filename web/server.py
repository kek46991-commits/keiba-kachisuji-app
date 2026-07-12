# -*- coding: utf-8 -*-
"""FastAPI backend for the paid web product."""

from __future__ import annotations

import csv
import io
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

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
YOSO_DATA_PATH = WEB_DIR / "data" / "yoso.json"
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
TELECOM_CREDIT_CHECKOUT_URL = os.getenv("TELECOM_CREDIT_CHECKOUT_URL", "").strip()
TELECOM_CREDIT_URL_CARD = os.getenv("TELECOM_CREDIT_URL_CARD", "").strip()
TELECOM_CREDIT_URL_CARRIER = os.getenv("TELECOM_CREDIT_URL_CARRIER", "").strip()
TELECOM_CREDIT_URL_BANK = os.getenv("TELECOM_CREDIT_URL_BANK", "").strip()
TELECOM_CREDIT_URL_PAYPAY = os.getenv("TELECOM_CREDIT_URL_PAYPAY", "").strip()
TELECOM_CREDIT_CALLBACK_SECRET = os.getenv("TELECOM_CREDIT_CALLBACK_SECRET", "")
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
                # レース結果テーブル（学習データ蓄積用）
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS race_results (
                        id SERIAL PRIMARY KEY,
                        race_date DATE NOT NULL,
                        venue TEXT NOT NULL,
                        race_num INTEGER NOT NULL,
                        race_name TEXT NOT NULL,
                        race_class TEXT,
                        distance INTEGER,
                        track_type TEXT,
                        winner_horse TEXT NOT NULL,
                        winner_number INTEGER,
                        trifecta_payout_yen INTEGER,
                        note TEXT,
                        created_at TIMESTAMPTZ DEFAULT NOW(),
                        UNIQUE(race_date, venue, race_num)
                    )
                    """
                )
            conn.commit()

    def upsert(
        self,
        *,
        stripe_customer_id: str,
        email: str,
        stripe_subscription_id: str | None,
        status: str,
        current_period_end: int | None,
    ) -> None:
        now = _now_utc()
        with self._connect() as conn:
            with conn.cursor() as cur:
                # まずemailで既存レコードを確認し、あればstripe_customer_idを更新してupsert
                cur.execute(
                    "SELECT stripe_customer_id FROM subscribers WHERE email = %s",
                    (email,),
                )
                existing = cur.fetchone()
                if existing:
                    # emailが既存 → そのレコードをUPDATE
                    cur.execute(
                        """
                        UPDATE subscribers SET
                            stripe_customer_id = %s,
                            stripe_subscription_id = %s,
                            status = %s,
                            current_period_end = %s,
                            updated_at = %s
                        WHERE email = %s
                        """,
                        (
                            stripe_customer_id,
                            stripe_subscription_id,
                            status,
                            current_period_end,
                            now,
                            email,
                        ),
                    )
                else:
                    # 新規INSERT（stripe_customer_idが重複した場合もUPDATE）
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
                            now,
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


def _telecom_ready() -> bool:
    methods = _telecom_methods()
    return bool(methods["subscription"] or methods["one_time"])


def _telecom_methods() -> dict[str, list[dict[str, str]]]:
    """Return configured Telecom Credit methods.

    Card/carrier/bank are subscription-capable; PayPay is intentionally
    separate because its Telecom Credit integration is one-time only.
    """
    card_url = TELECOM_CREDIT_URL_CARD or TELECOM_CREDIT_CHECKOUT_URL
    subscription = [
        {"key": "card", "label": "クレジットカード", "url": card_url},
        {"key": "carrier", "label": "キャリア決済（ドコモ・au・ソフトバンク）", "url": TELECOM_CREDIT_URL_CARRIER},
        {"key": "bank", "label": "銀行振込", "url": TELECOM_CREDIT_URL_BANK},
    ]
    one_time = [{"key": "paypay", "label": "PayPay（都度購入）", "url": TELECOM_CREDIT_URL_PAYPAY}]
    return {
        "subscription": [method for method in subscription if method["url"]],
        "one_time": [method for method in one_time if method["url"]],
    }


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
    telecom_methods = _telecom_methods()
    telecom_ready = bool(telecom_methods["subscription"] or telecom_methods["one_time"])
    stripe_ready = _stripe_ready()
    context.update(
        {
            "demo_mode": DEMO_MODE,
            "stripe_ready": stripe_ready,
            "telecom_ready": telecom_ready,
            "payment_ready": telecom_ready or stripe_ready,
            "payment_provider": "テレコムクレジット" if telecom_ready else "Stripe" if stripe_ready else "",
            "checkout_url": telecom_methods["subscription"][0]["url"] if telecom_methods["subscription"] else "",
            "telecom_subscription_methods": telecom_methods["subscription"],
            "telecom_one_time_methods": telecom_methods["one_time"],
        }
    )
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
    # 1ヶ月無料トライアル設定
    trial_days = int(os.getenv("STRIPE_TRIAL_DAYS", "30"))
    subscription_data: dict = {}
    if trial_days > 0:
        subscription_data["trial_period_days"] = trial_days
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": STRIPE_PRICE_ID, "quantity": 1}],
        subscription_data=subscription_data if subscription_data else None,
        success_url=f"{base_url}/access?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{base_url}/",
        allow_promotion_codes=True,
        payment_method_collection="if_required",
    )
    return JSONResponse({"url": session.url})


@app.post("/api/telecom/callback")
async def telecom_callback(request: Request) -> Response:
    """テレコムクレジット結果通知の暫定アダプター。

    正式な項目名は審査・契約後に発行される仕様書で確定するため、
    現在は一般的な email/result/order_id の別名を受け付ける。
    """
    if not TELECOM_CREDIT_CALLBACK_SECRET:
        raise HTTPException(status_code=503, detail="TELECOM_CREDIT_CALLBACK_SECRET が未設定です。")

    body = await request.body()
    content_type = request.headers.get("content-type", "")
    payload: dict[str, Any]
    if "json" in content_type:
        try:
            parsed = json.loads(body.decode("utf-8-sig"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HTTPException(status_code=400, detail="JSONを読み取れません。") from exc
        payload = parsed if isinstance(parsed, dict) else {}
    else:
        parsed_form = parse_qs(body.decode("utf-8-sig"), keep_blank_values=True)
        payload = {key: values[-1] if values else "" for key, values in parsed_form.items()}

    provided_secret = (
        request.headers.get("X-Telecom-Credit-Secret")
        or request.headers.get("X-Callback-Secret")
        or payload.get("callback_secret")
        or payload.get("secret")
        or payload.get("token")
    )
    if provided_secret != TELECOM_CREDIT_CALLBACK_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    email = str(payload.get("email") or payload.get("customer_email") or payload.get("mail") or "").strip()
    result = str(payload.get("result") or payload.get("status") or payload.get("success") or "").strip().lower()
    success_values = {"1", "ok", "paid", "success", "succeeded", "completed", "settled", "true"}
    if not email or result not in success_values:
        raise HTTPException(status_code=400, detail="成功結果とメールアドレスが必要です。")

    order_id = str(
        payload.get("subscription_id")
        or payload.get("order_id")
        or payload.get("transaction_id")
        or payload.get("customer_id")
        or email
    ).strip()
    customer_id = f"telecom:{order_id}"
    subscription_id = str(payload.get("subscription_id") or payload.get("order_id") or order_id)
    _upsert_subscriber(
        stripe_customer_id=customer_id,
        email=email,
        stripe_subscription_id=subscription_id,
        status="active",
        current_period_end=None,
    )
    response = JSONResponse({"status": "ok", "email": email})
    _set_auth_cookie(response, customer_id=customer_id, email=email)
    return response


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
    sub_status = _value(subscription, "status")
    sub_period_end = _value(subscription, "current_period_end")
    # Stripe新APIではcurrent_period_endがitems.data[0].current_period_endにある場合がある
    if sub_period_end is None:
        try:
            items = _value(subscription, "items")
            if items:
                item_list = _value(items, "data") or []
                if item_list:
                    sub_period_end = _value(item_list[0], "current_period_end")
        except Exception:
            pass
    # activeまたはtrialingなら有効とみなす（period_endが取れない場合も許容）
    if sub_status not in ("active", "trialing"):
        if not _subscription_is_active(sub_status, sub_period_end):
            raise HTTPException(status_code=403, detail="サブスクリプションが有効ではありません。")
    sub_id = _value(subscription, "id")
    _upsert_subscriber(
        stripe_customer_id=str(customer_id),
        email=str(email),
        stripe_subscription_id=str(sub_id) if sub_id else "",
        status="active",
        current_period_end=int(sub_period_end) if sub_period_end else None,
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


# ===== 馬データ図鑑 =====
@app.get("/horses", response_class=HTMLResponse)
def horses_page(request: Request) -> HTMLResponse:
    session = _require_demo_or_auth(request)
    context = _seo_context(
        title="馬データ図鑑 | 勝ち筋解析",
        description="中央競馬の主要競走馬データ図鑑。各馬の成績・得意条件・馬場適性を詳細分析。",
        path="/horses",
    )
    context["is_subscriber"] = session is not None
    return templates.TemplateResponse(request, "horses.html", context)


# ===== 騎手統計 =====
@app.get("/jockeys", response_class=HTMLResponse)
def jockeys_page(request: Request) -> HTMLResponse:
    session = _require_demo_or_auth(request)
    context = _seo_context(
        title="騎手統計 | 勝ち筋解析",
        description="中央競馬の騎手別統計データ。勝率・回収率・天候別成績を詳細分析。",
        path="/jockeys",
    )
    context["is_subscriber"] = session is not None
    return templates.TemplateResponse(request, "jockeys.html", context)


# ===== ブログ一覧 =====
@app.get("/blog", response_class=HTMLResponse)
def blog_list(request: Request) -> HTMLResponse:
    from web.blog_generator import _get_blog_posts, BLOG_DB_PATH
    context = _seo_context(
        title="AIブログ | 勝ち筋解析",
        description="競馬AIが毎日自動生成するブログ。G1分析・騎手情報・馬場レポートをお届け。",
        path="/blog",
    )
    context["posts"] = _get_blog_posts(BLOG_DB_PATH)
    return templates.TemplateResponse(request, "blog_list.html", context)


# ===== ブログ記事詳細 =====
@app.get("/blog/{slug}", response_class=HTMLResponse)
def blog_post_page(request: Request, slug: str) -> HTMLResponse:
    from web.blog_generator import _get_blog_post, BLOG_DB_PATH
    # DBから取得を試みる
    db_post = _get_blog_post(BLOG_DB_PATH, slug)
    if db_post:
        context = _seo_context(
            title=f"{db_post['title']} | 勝ち筋解析",
            description=db_post["excerpt"],
            path=f"/blog/{slug}",
        )
        context["post"] = {
            "title": db_post["title"],
            "category": db_post["category"],
            "date": db_post["published_at"][:10],
            "excerpt": db_post["excerpt"],
            "read_time": db_post.get("read_time", 5),
            "content": db_post["content"],
        }
        return templates.TemplateResponse(request, "blog_post.html", context)
    # フォールバック: ハードコード記事
    posts_data = {
        "takara-2026": {
            "title": "【宝塚記念2026】AIが選ぶ本命馬と穴馬予想・全頭分析",
            "category": "G1分析",
            "date": "2026年7月8日",
            "excerpt": "機械学習モデルが宝塚記念の全出走馬を分析。期待値・馬場適性・騎手相性を総合評価。",
            "read_time": 8,
            "content": """
<p>2026年の宝塚記念は、阪神競馬場の芝2200mで行われます。今年は梅雨の影響で稍重〜重馬場が予想されており、<strong>雨巧者の馬が有利</strong>になると分析しています。</p>
<h2>AIモデルの予測結果</h2>
<p>機械学習モデルによる各馬の予測勝率と期待値(EV)を算出しました。</p>
<h3>本命馬：イクイノックス</h3>
<p>AIモデルが最も高い期待値を算出したのはイクイノックスです。<strong>予測勝率28.4%、EV+1.42</strong>と圧倒的な数値を示しています。</p>
<h2>天候・馬場状態の影響</h2>
<p>今年の宝塚記念は梅雨の影響で稍重〜重馬場が予想されます。過去データの分析では、<strong>重馬場での回収率は良馬場より約15%高い</strong>傾向があります。</p>
<table class="data-table">
  <thead><tr><th>馬場状態</th><th>平均回収率</th><th>分析レース数</th></tr></thead>
  <tbody>
    <tr><td>良</td><td>108%</td><td>480件</td></tr>
    <tr><td>稍重</td><td>115%</td><td>180件</td></tr>
    <tr><td>重</td><td>122%</td><td>85件</td></tr>
  </tbody>
</table>
<blockquote>◎ イクイノックス（本命）<br>○ ドウデュース（対抗）<br>▲ ジャスティンパレス（雨天補正で浮上）</blockquote>
""",
        },
        "ame-tsuyoi-uma": {
            "title": "雨の日に強い馬ランキング TOP10【2026年最新版】",
            "category": "天候・馬場",
            "date": "2026年7月7日",
            "excerpt": "重馬場・不良馬場での成績データを徹底分析。雨巧者として知られる馬たちの特徴と成績。",
            "read_time": 6,
            "content": """
<p>競馬において、<strong>雨の日（重馬場・不良馬場）での成績</strong>は馬によって大きく異なります。今回は過去5年間のデータを分析し、雨天時に特に強い馬をランキング形式でご紹介します。</p>
<h2>雨天時に強い馬の特徴</h2>
<ul>
  <li>パワー型の体型・走法を持つ馬</li>
  <li>ダート経験がある馬（馬場の変化に対応しやすい）</li>
  <li>重心が低く、泥をかぶっても動じない気性の馬</li>
</ul>
<h2>雨天成績ランキング TOP5</h2>
<table class="data-table">
  <thead><tr><th>順位</th><th>馬名</th><th>重・不良勝率</th><th>良馬場勝率</th><th>差</th></tr></thead>
  <tbody>
    <tr><td>1位</td><td>ジャスティンパレス</td><td class="highlight">42.1%</td><td>28.3%</td><td class="highlight">+13.8%</td></tr>
    <tr><td>2位</td><td>ソールオリエンス</td><td class="highlight">38.5%</td><td>25.1%</td><td class="highlight">+13.4%</td></tr>
    <tr><td>3位</td><td>イクイノックス</td><td class="highlight">35.2%</td><td>28.4%</td><td class="highlight">+6.8%</td></tr>
  </tbody>
</table>
""",
        },
        "kawada-stats": {
            "title": "川田将雅2026年成績まとめ・得意条件と苦手条件を徹底分析",
            "category": "騎手分析",
            "date": "2026年7月6日",
            "excerpt": "2026年リーディング争いをリードする川田将雅騎手の成績を詳細分析。コース別・天候別の傾向。",
            "read_time": 5,
            "content": """
<p>2026年のリーディング争いをリードする川田将雅騎手。今年の成績をデータで振り返ります。</p>
<h2>2026年上半期成績</h2>
<p>勝率32.1%、連対率54.3%と圧倒的な成績を残しています。特に<strong>芝・良馬場での成績</strong>が際立っています。</p>
<h2>天候別成績</h2>
<table class="data-table">
  <thead><tr><th>天候</th><th>勝率</th><th>回収率</th></tr></thead>
  <tbody>
    <tr><td>晴れ・良</td><td class="highlight">33.2%</td><td>118%</td></tr>
    <tr><td>雨・稍重</td><td>31.8%</td><td>112%</td></tr>
    <tr><td>重・不良</td><td>28.4%</td><td>105%</td></tr>
  </tbody>
</table>
""",
        },
    }

    post_data = posts_data.get(slug)
    if not post_data:
        raise HTTPException(status_code=404, detail="記事が見つかりません")

    context = _seo_context(
        title=f"{post_data['title']} | 勝ち筋解析",
        description=post_data["excerpt"],
        path=f"/blog/{slug}",
    )
    context["post"] = post_data
    return templates.TemplateResponse(request, "blog_post.html", context)


# ===== 週次予想ページ =====
@app.get("/yoso1", response_class=HTMLResponse)
def yoso_page(request: Request) -> HTMLResponse:
    session = _require_demo_or_auth(request)
    yoso = _load_yoso_data()
    context = _seo_context(
        title=f"{yoso.get('page', {}).get('title', '今週の予想')} | 勝ち筋解析",
        description=yoso.get("page", {}).get("description", "AIによる競馬予想。"),
        path="/yoso1",
    )
    context["is_subscriber"] = session is not None
    context["yoso"] = yoso
    return templates.TemplateResponse(request, "yoso.html", context)


# ===== 週次予想データ管理 =====
def _bundled_yoso_data() -> dict[str, Any]:
    try:
        data = json.loads(YOSO_DATA_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"page": {}, "venues": [], "races": []}
    return data if isinstance(data, dict) else {"page": {}, "venues": [], "races": []}


def _ensure_yoso_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS yoso_races (
            race_date DATE PRIMARY KEY,
            payload JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """
    )


def _load_yoso_data() -> dict[str, Any]:
    fallback = _bundled_yoso_data()
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        return fallback
    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError:
        return fallback
    try:
        with psycopg.connect(dsn) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT payload FROM yoso_races WHERE race_date = %s",
                    (fallback.get("page", {}).get("date", "2026-07-19"),),
                )
                row = cur.fetchone()
        if row and isinstance(row[0], dict):
            return row[0]
    except Exception:
        return fallback
    return fallback


def _admin_auth_matches(request: Request, token: str | None = None) -> bool:
    if not APP_SECRET_KEY:
        return False
    authorization = request.headers.get("Authorization", "")
    return authorization == f"Bearer {APP_SECRET_KEY}" or token == APP_SECRET_KEY


def _normalise_import_payload(payload: dict[str, Any], base: dict[str, Any]) -> dict[str, Any]:
    if isinstance(payload.get("yoso"), dict):
        payload = payload["yoso"]
    if isinstance(payload.get("races"), list):
        result = payload
    else:
        race = payload.get("race") if isinstance(payload.get("race"), dict) else payload
        if not isinstance(race, dict):
            raise ValueError("race または races を含むJSONを指定してください")
        result = dict(base)
        current = [r for r in result.get("races", []) if isinstance(r, dict)]
        race_id = race.get("id", "imported")
        current = [r for r in current if r.get("id") != race_id]
        current.append(race)
        result["races"] = current
    if not result.get("page"):
        result["page"] = base.get("page", {})
    if not result.get("venues"):
        result["venues"] = base.get("venues", [])
    return result


def _csv_import_payload(text: str, base: dict[str, Any], race_date: str | None) -> dict[str, Any]:
    rows = list(csv.DictReader(io.StringIO(text)))
    if not rows:
        raise ValueError("CSVにデータ行がありません")
    horses = []
    for index, row in enumerate(rows, start=1):
        name = (row.get("馬名") or row.get("name") or "").strip()
        if not name:
            raise ValueError(f"{index}行目: 馬名がありません")
        horses.append(
            {
                "number": row.get("馬番") or row.get("number") or index,
                "name": name,
                "sex_age": (row.get("性齢") or row.get("sex_age") or "").strip(),
                "jockey": (row.get("騎手") or row.get("jockey") or "未定").strip(),
                "odds": (row.get("オッズ") or row.get("odds") or "").strip(),
                "paddock": {
                    "text": (row.get("パドック") or row.get("paddock") or "").strip(),
                    "rating": None,
                },
                "comment": (row.get("コメント") or row.get("comment") or "").strip(),
            }
        )
    race = {
        "id": "imported",
        "grade": "GⅢ",
        "grade_class": "grade-g3",
        "name": "最新レース",
        "detail": f"{len(horses)}頭",
        "meta": [],
        "horses": horses,
        "analysis_html": "",
        "stats": [],
    }
    payload = {"race": race}
    result = _normalise_import_payload(payload, base)
    result.setdefault("page", {})["date"] = race_date or result.get("page", {}).get("date", "")
    return result


def _store_yoso_data(payload: dict[str, Any]) -> str:
    dsn = os.getenv("DATABASE_URL")
    race_date = payload.get("page", {}).get("date", "2026-07-19")
    if dsn:
        try:
            import psycopg  # type: ignore[import-not-found]
            from psycopg.types.json import Json  # type: ignore[import-not-found]
            with psycopg.connect(dsn) as conn:
                with conn.cursor() as cur:
                    _ensure_yoso_table(cur)
                    cur.execute(
                        """
                        INSERT INTO yoso_races (race_date, payload)
                        VALUES (%s, %s)
                        ON CONFLICT (race_date) DO UPDATE SET
                            payload = EXCLUDED.payload,
                            updated_at = NOW()
                        """,
                        (race_date, Json(payload)),
                    )
                conn.commit()
            return "database"
        except Exception:
            pass
    try:
        YOSO_DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        YOSO_DATA_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return "file"
    except OSError:
        return "response"


@app.get("/yoso/admin", response_class=HTMLResponse)
def yoso_admin(request: Request, token: str | None = None) -> HTMLResponse:
    if not _admin_auth_matches(request, token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return templates.TemplateResponse(request, "yoso_admin.html", {"token": token or ""})


@app.post("/api/yoso/import")
async def import_yoso(request: Request, race_date: str | None = None) -> JSONResponse:
    if not _admin_auth_matches(request):
        raise HTTPException(status_code=401, detail="Unauthorized")
    body = await request.body()
    text = body.decode("utf-8-sig")
    base = _load_yoso_data()
    content_type = request.headers.get("content-type", "")
    try:
        if "json" in content_type or text.lstrip().startswith("{"):
            parsed = json.loads(text)
            payload = _normalise_import_payload(parsed, base)
            if race_date:
                payload.setdefault("page", {})["date"] = race_date
        else:
            payload = _csv_import_payload(text, base, race_date)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    destination = _store_yoso_data(payload)
    response: dict[str, Any] = {"status": "ok", "destination": destination, "race_count": len(payload.get("races", []))}
    if destination == "response":
        response["data"] = payload
        response["note"] = "ファイルシステムが読み取り専用のため、生成JSONを保存してコミットしてください。"
    return JSONResponse(response)


# ===== レース結果データ投入API（管理者用） =====
@app.post("/api/race-results/seed")
def seed_race_results(request: Request) -> JSONResponse:
    """レース結果データをDBに投入する（管理者専用エンドポイント）"""
    # 簡易認証: APP_SECRET_KEYをBearerトークンとして使用
    auth = request.headers.get("Authorization", "")
    if APP_SECRET_KEY and auth != f"Bearer {APP_SECRET_KEY}":
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not os.getenv("DATABASE_URL"):
        raise HTTPException(status_code=503, detail="DATABASE_URL が未設定です")

    try:
        import psycopg  # type: ignore[import-not-found]
        from web.seed_race_results import ensure_table, insert_results
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Import error: {e}")

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            ensure_table(cur)
            count = insert_results(cur)
        conn.commit()

    return JSONResponse({"status": "ok", "inserted": count})


# ===== レース結果一覧API（予想モデル学習用） =====
@app.get("/api/race-results")
def get_race_results(
    venue: str | None = None,
    race_class: str | None = None,
    limit: int = 100,
) -> JSONResponse:
    """蓄積したレース結果データを返す（AIモデル学習・統計用）"""
    if not os.getenv("DATABASE_URL"):
        return JSONResponse({"results": [], "note": "DATABASE_URL未設定"})

    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError:
        return JSONResponse({"results": [], "note": "psycopg未インストール"})

    query = "SELECT * FROM race_results WHERE 1=1"
    params: list = []
    if venue:
        query += " AND venue = %s"
        params.append(venue)
    if race_class:
        query += " AND race_class = %s"
        params.append(race_class)
    query += " ORDER BY race_date DESC, race_num ASC LIMIT %s"
    params.append(limit)

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            columns = [col.name for col in cur.description]

    results = [dict(zip(columns, row, strict=False)) for row in rows]
    # date型をstr変換
    for r in results:
        if hasattr(r.get("race_date"), "isoformat"):
            r["race_date"] = r["race_date"].isoformat()
        if hasattr(r.get("created_at"), "isoformat"):
            r["created_at"] = r["created_at"].isoformat()

    return JSONResponse({"results": results, "count": len(results)})


# ===== レース結果統計API（天候・馬場・騎手統計） =====
@app.get("/api/race-results/stats")
def get_race_stats() -> JSONResponse:
    """レース結果の統計サマリーを返す（予想精度向上用）"""
    if not os.getenv("DATABASE_URL"):
        return JSONResponse({"stats": {}, "note": "DATABASE_URL未設定"})

    try:
        import psycopg  # type: ignore[import-not-found]
    except ImportError:
        return JSONResponse({"stats": {}, "note": "psycopg未インストール"})

    with psycopg.connect(os.environ["DATABASE_URL"]) as conn:
        with conn.cursor() as cur:
            # 開催場別集計
            cur.execute(
                "SELECT venue, COUNT(*) as cnt, AVG(trifecta_payout_yen) as avg_payout "
                "FROM race_results GROUP BY venue ORDER BY cnt DESC"
            )
            venue_stats = [
                {"venue": r[0], "count": r[1], "avg_trifecta": round(r[2] or 0)}
                for r in cur.fetchall()
            ]
            # 馬場種別集計
            cur.execute(
                "SELECT track_type, COUNT(*) as cnt, AVG(trifecta_payout_yen) as avg_payout "
                "FROM race_results GROUP BY track_type ORDER BY cnt DESC"
            )
            track_stats = [
                {"track_type": r[0], "count": r[1], "avg_trifecta": round(r[2] or 0)}
                for r in cur.fetchall()
            ]
            # クラス別集計
            cur.execute(
                "SELECT race_class, COUNT(*) as cnt, AVG(trifecta_payout_yen) as avg_payout "
                "FROM race_results GROUP BY race_class ORDER BY avg_payout DESC"
            )
            class_stats = [
                {"race_class": r[0], "count": r[1], "avg_trifecta": round(r[2] or 0)}
                for r in cur.fetchall()
            ]
            # 総件数
            cur.execute("SELECT COUNT(*) FROM race_results")
            total = cur.fetchone()[0]

    return JSONResponse({
        "total_races": total,
        "venue_stats": venue_stats,
        "track_stats": track_stats,
        "class_stats": class_stats,
    })

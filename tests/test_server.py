# -*- coding: utf-8 -*-
"""FastAPI サーバーの HTTP エンドポイント単体テスト。

環境変数 DATABASE_URL / STRIPE_SECRET_KEY が未設定でも動作するよう、
外部依存をモックしてテストする。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# web/ ディレクトリを sys.path に追加
WEB_DIR = Path(__file__).resolve().parent.parent / "web"
sys.path.insert(0, str(WEB_DIR))

# Stripe / psycopg などの外部ライブラリをモックしてからインポート
os.environ.setdefault("STRIPE_SECRET_KEY", "sk_test_dummy")
os.environ.setdefault("STRIPE_WEBHOOK_SECRET", "whsec_dummy")
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-testing")
os.environ.setdefault("APP_PRICE_LABEL", "月額 1,980円")


@pytest.fixture(scope="module")
def client():
    """TestClient を一度だけ生成して全テストで共有する。"""
    with patch("stripe.Webhook.construct_event"), \
         patch("stripe.checkout.Session.create"), \
         patch("stripe.billing_portal.Session.create"):
        from server import app  # noqa: PLC0415
        return TestClient(app, raise_server_exceptions=False)


# ─────────────────────────────────────────────
# 公開ページ (認証不要)
# ─────────────────────────────────────────────

class TestPublicPages:
    """認証なしでアクセスできるページが 200 を返すことを確認する。"""

    def test_root_returns_200(self, client: TestClient) -> None:
        res = client.get("/")
        assert res.status_code == 200

    def test_root_head_returns_200(self, client: TestClient) -> None:
        res = client.head("/")
        assert res.status_code == 200

    def test_horses_returns_200(self, client: TestClient) -> None:
        res = client.get("/horses")
        assert res.status_code == 200

    def test_jockeys_returns_200(self, client: TestClient) -> None:
        res = client.get("/jockeys")
        assert res.status_code == 200

    def test_blog_returns_200(self, client: TestClient) -> None:
        res = client.get("/blog")
        assert res.status_code == 200

    def test_yoso1_returns_200(self, client: TestClient) -> None:
        res = client.get("/yoso1")
        assert res.status_code == 200


# ─────────────────────────────────────────────
# 法的ページ
# ─────────────────────────────────────────────

class TestLegalPages:
    """特商法・プライバシーポリシー・利用規約ページが正しく返ることを確認する。"""

    def test_terms_ja_returns_200(self, client: TestClient) -> None:
        res = client.get("/terms")
        assert res.status_code == 200
        assert "利用規約" in res.text

    def test_tokushoho_returns_200(self, client: TestClient) -> None:
        res = client.get("/tokushoho")
        assert res.status_code == 200
        assert "特定商取引法" in res.text

    def test_tokushoho_contains_pricing(self, client: TestClient) -> None:
        """APP_PRICE_LABEL が特商法ページに反映されていることを確認する。"""
        res = client.get("/tokushoho")
        assert res.status_code == 200
        assert "1,980円" in res.text

    def test_privacy_returns_200(self, client: TestClient) -> None:
        res = client.get("/privacy")
        assert res.status_code == 200
        assert "プライバシーポリシー" in res.text

    def test_privacy_contains_email(self, client: TestClient) -> None:
        """プライバシーポリシーに連絡先メールが記載されていることを確認する。"""
        res = client.get("/privacy")
        assert res.status_code == 200
        assert "kek46991@gmail.com" in res.text

    def test_terms_contains_jurisdiction(self, client: TestClient) -> None:
        """利用規約に管轄裁判所が記載されていることを確認する。"""
        res = client.get("/terms")
        assert res.status_code == 200
        assert "大阪地方裁判所" in res.text

    def test_legal_pages_have_footer_links(self, client: TestClient) -> None:
        """法的ページのナビに他の法的ページへのリンクが含まれることを確認する。"""
        for path in ("/terms", "/privacy", "/tokushoho"):
            res = client.get(path)
            assert res.status_code == 200
            assert 'href="/terms"' in res.text or 'href="/tokushoho"' in res.text


# ─────────────────────────────────────────────
# SEO / クローラー
# ─────────────────────────────────────────────

class TestSeoEndpoints:
    """robots.txt と sitemap.xml が正しく返ることを確認する。"""

    def test_robots_txt_returns_200(self, client: TestClient) -> None:
        res = client.get("/robots.txt")
        assert res.status_code == 200
        assert "User-agent" in res.text

    def test_sitemap_xml_returns_200(self, client: TestClient) -> None:
        res = client.get("/sitemap.xml")
        assert res.status_code == 200
        assert "urlset" in res.text

    def test_sitemap_contains_legal_urls(self, client: TestClient) -> None:
        """サイトマップに法的ページの URL が含まれることを確認する。"""
        res = client.get("/sitemap.xml")
        assert res.status_code == 200
        assert "/terms" in res.text
        assert "/privacy" in res.text
        assert "/tokushoho" in res.text


# ─────────────────────────────────────────────
# API エンドポイント
# ─────────────────────────────────────────────

class TestApiEndpoints:
    """API エンドポイントの基本動作を確認する。"""

    def test_race_results_api_no_db(self, client: TestClient) -> None:
        """DATABASE_URL 未設定時に /api/race-results が 200 を返すことを確認する。"""
        res = client.get("/api/race-results")
        assert res.status_code == 200

    def test_race_results_stats_no_db(self, client: TestClient) -> None:
        """DATABASE_URL 未設定時に /api/race-results/stats が 200 を返すことを確認する。"""
        res = client.get("/api/race-results/stats")
        assert res.status_code == 200

    def test_checkout_without_stripe_returns_503(self, client: TestClient) -> None:
        """Stripe 未設定時に /api/checkout が 503 を返すことを確認する。"""
        res = client.post("/api/checkout")
        # STRIPE_PRICE_ID 未設定の場合は 503 、設定済の場合は 422 または 302
        assert res.status_code in (422, 503)

    def test_access_without_session_id_returns_400(self, client: TestClient) -> None:
        """/access に session_id なしでアクセスすると 400 を返すことを確認する。"""
        res = client.get("/access", follow_redirects=False)
        assert res.status_code == 400

    def test_logout_redirects(self, client: TestClient) -> None:
        """/logout が / にリダイレクトすることを確認する。"""
        res = client.get("/logout", follow_redirects=False)
        assert res.status_code in (302, 303, 307)


# ─────────────────────────────────────────────
# 存在しないページ
# ─────────────────────────────────────────────

class TestNotFound:
    """存在しないパスが 404 を返すことを確認する。"""

    def test_unknown_path_returns_404(self, client: TestClient) -> None:
        res = client.get("/this-page-does-not-exist-xyz")
        assert res.status_code == 404

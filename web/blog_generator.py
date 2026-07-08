# -*- coding: utf-8 -*-
"""
Gemini AI による自動ブログ記事生成スクリプト。
環境変数 GEMINI_API_KEY が設定されている場合に動作します。
Vercel Cron または外部スケジューラから呼び出してください。
"""
from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BLOG_DB_PATH = Path(os.getenv("BLOG_DB_PATH", "/tmp/blog_posts.db"))

BLOG_TOPICS = [
    {
        "category": "G1分析",
        "cat_class": "g1",
        "thumb_class": "g1",
        "emoji": "🏆",
        "prompt_template": "今週の中央競馬G1レースについて、AIが分析した予想記事を日本語で書いてください。出走馬の特徴、天候・馬場状態の影響、期待値分析を含めてください。",
    },
    {
        "category": "天候・馬場",
        "cat_class": "weather",
        "thumb_class": "weather",
        "emoji": "🌧️",
        "prompt_template": "競馬における天候と馬場状態（良・稍重・重・不良）の影響について、データ分析の観点から記事を書いてください。雨の日に強い馬の特徴も含めてください。",
    },
    {
        "category": "騎手分析",
        "cat_class": "jockey",
        "thumb_class": "jockey",
        "emoji": "👤",
        "prompt_template": "中央競馬の主要騎手（川田将雅、C.ルメール、武豊など）の最近の成績と傾向について分析記事を書いてください。",
    },
    {
        "category": "馬分析",
        "cat_class": "horse",
        "thumb_class": "horse",
        "emoji": "🐎",
        "prompt_template": "中央競馬の注目競走馬について、成績・得意条件・馬場適性を分析した記事を書いてください。",
    },
    {
        "category": "データ分析",
        "cat_class": "analysis",
        "thumb_class": "analysis",
        "emoji": "📊",
        "prompt_template": "競馬の統計データ分析について、回収率・的中率・期待値の観点から記事を書いてください。",
    },
]


def _ensure_blog_schema(db_path: Path) -> None:
    """ブログDBのスキーマを初期化する。"""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS blog_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                category TEXT NOT NULL,
                cat_class TEXT NOT NULL,
                thumb_class TEXT NOT NULL,
                emoji TEXT NOT NULL,
                excerpt TEXT NOT NULL,
                content TEXT NOT NULL,
                read_time INTEGER DEFAULT 5,
                published_at TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(published_at DESC)")


def _get_blog_posts(db_path: Path, limit: int = 20) -> list[dict[str, Any]]:
    """ブログ記事一覧を取得する。"""
    try:
        _ensure_blog_schema(db_path)
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                "SELECT * FROM blog_posts ORDER BY published_at DESC LIMIT ?",
                (limit,)
            ).fetchall()
            return [dict(row) for row in rows]
    except Exception:
        return []


def _get_blog_post(db_path: Path, slug: str) -> dict[str, Any] | None:
    """スラッグでブログ記事を取得する。"""
    try:
        _ensure_blog_schema(db_path)
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                "SELECT * FROM blog_posts WHERE slug = ?",
                (slug,)
            ).fetchone()
            return dict(row) if row else None
    except Exception:
        return None


def _save_blog_post(db_path: Path, post: dict[str, Any]) -> None:
    """ブログ記事を保存する。"""
    _ensure_blog_schema(db_path)
    now = datetime.now(timezone.utc).isoformat()
    with sqlite3.connect(db_path) as conn:
        conn.execute("""
            INSERT OR REPLACE INTO blog_posts
            (slug, title, category, cat_class, thumb_class, emoji, excerpt, content, read_time, published_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            post["slug"],
            post["title"],
            post["category"],
            post["cat_class"],
            post["thumb_class"],
            post["emoji"],
            post["excerpt"],
            post["content"],
            post.get("read_time", 5),
            post.get("published_at", now),
            now,
        ))


def _generate_with_gemini(prompt: str) -> dict[str, Any] | None:
    """Gemini APIを使って記事を生成する。"""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    try:
        import urllib.request
        import urllib.error

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
        full_prompt = f"""
あなたは競馬分析の専門家です。以下のテーマについて、SEOに最適化された競馬ブログ記事を日本語で生成してください。

テーマ: {prompt}

以下のJSON形式で返してください（コードブロックなし、純粋なJSONのみ）:
{{
  "title": "記事タイトル（50文字以内）",
  "excerpt": "記事の要約（100文字以内）",
  "content": "記事本文（HTML形式、h2/h3/p/ul/table/blockquoteタグを使用、500文字以上）",
  "read_time": 読了時間（分、整数）
}}

注意事項:
- 的中保証はしない
- 統計データは参考値として提示
- 18歳以上対象と明記
- 免責事項を含める
"""

        data = json.dumps({
            "contents": [{"parts": [{"text": full_prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 2048,
            }
        }).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
            text = result["candidates"][0]["content"]["parts"][0]["text"]
            # JSONを抽出
            text = text.strip()
            if text.startswith("```"):
                lines = text.split("\n")
                text = "\n".join(lines[1:-1])
            return json.loads(text)

    except Exception as e:
        print(f"Gemini API error: {e}")
        return None


def generate_daily_posts(db_path: Path = BLOG_DB_PATH) -> list[str]:
    """毎日のブログ記事を生成する（1日1記事）。"""
    import random
    from datetime import date

    today = date.today().isoformat()
    generated_slugs = []

    # 今日の記事がすでにある場合はスキップ
    try:
        _ensure_blog_schema(db_path)
        with sqlite3.connect(db_path) as conn:
            count = conn.execute(
                "SELECT COUNT(*) FROM blog_posts WHERE published_at LIKE ?",
                (f"{today}%",)
            ).fetchone()[0]
            if count > 0:
                return []
    except Exception:
        pass

    # ランダムにトピックを選択
    topic = random.choice(BLOG_TOPICS)

    generated = _generate_with_gemini(topic["prompt_template"])
    if generated:
        import re
        slug = re.sub(r"[^\w-]", "", generated["title"].lower().replace(" ", "-"))[:50]
        slug = f"{today}-{slug}" if slug else f"{today}-post"

        post = {
            "slug": slug,
            "title": generated["title"],
            "category": topic["category"],
            "cat_class": topic["cat_class"],
            "thumb_class": topic["thumb_class"],
            "emoji": topic["emoji"],
            "excerpt": generated["excerpt"],
            "content": generated["content"],
            "read_time": generated.get("read_time", 5),
            "published_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_blog_post(db_path, post)
        generated_slugs.append(slug)

    return generated_slugs


if __name__ == "__main__":
    slugs = generate_daily_posts()
    print(f"Generated {len(slugs)} posts: {slugs}")

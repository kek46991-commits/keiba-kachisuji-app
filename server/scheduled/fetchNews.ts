/**
 * ニュース自動取得スケジュールハンドラー
 * netkeibaのニュースAPIからデータを取得してDBに保存する
 */
import { Request, Response } from "express";
import { getDb } from "../db";
import { newsItems } from "../../drizzle/schema";
import { eq, desc } from "drizzle-orm";

interface ScrapedNews {
  title: string;
  summary: string;
  linkUrl: string;
  thumbnailUrl: string | null;
  category: "breaking" | "result" | "column" | "prediction";
}

/** Unicodeエスケープ（\uXXXX）をデコード */
function decodeUnicodeEscapes(str: string): string {
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"');
}

async function scrapeNetkeibaNews(): Promise<ScrapedNews[]> {
  const results: ScrapedNews[] = [];
  try {
    // netkeibaのニュースAPI（JSONP形式）を使用
    // pid=api_get_news_rank&rank_type=4（新着順）&category_id=3（全カテゴリ）&limit=10
    const url = "https://news.netkeiba.com/?pid=api_get_news_rank&rank_type=4&category_id=3&limit=10&page=1&output=jsonp";
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ja,en-US;q=0.9",
      "Referer": "https://news.netkeiba.com/",
    };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      console.warn(`[fetchNews] HTTP ${res.status} from netkeiba`);
      return [];
    }
    const rawText = await res.text();
    console.log(`[fetchNews] API response length: ${rawText.length} chars`);
    if (rawText.length < 100) {
      console.log(`[fetchNews] Response too short`);
      return [];
    }
    // JSONPレスポンスはエスケープされたHTML文字列
    // Unicodeエスケープをデコードしてからパース
    const html = decodeUnicodeEscapes(rawText);

    // パターン1: ArticleLink title属性パターン
    const articlePattern = /<a[^>]*href="(https?:\/\/news\.netkeiba\.com\/\?pid=news_view&no=\d+)"[^>]*title="([^"]+)"[^>]*>/g;
    let match;
    while ((match = articlePattern.exec(html)) !== null && results.length < 10) {
      const linkUrl = match[1];
      let title = decodeUnicodeEscapes(match[2]).trim();
      if (!title || title.length < 5) continue;
      if (results.some(r => r.title === title)) continue;

      // 画像を探す
      const afterLink = html.substring(match.index, match.index + 2000);
      const imgMatch = afterLink.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
      const thumbnailUrl = imgMatch ? imgMatch[1] : null;

      // カテゴリ自動判定
      let category: ScrapedNews["category"] = "column";
      if (title.includes("速報") || title.includes("結果確定") || title.includes("レース結果")) category = "breaking";
      else if (title.includes("結果") || title.includes("着順") || title.includes("レース回顧") || title.includes("勝利") || title.match(/\d+着/)) category = "result";
      else if (title.includes("予想") || title.includes("注目馬") || title.includes("本命") || title.includes("追い切り")) category = "prediction";

      results.push({
        title: title.substring(0, 200),
        summary: title.length > 60 ? title.substring(0, 60) + "..." : title,
        linkUrl,
        thumbnailUrl,
        category,
      });
    }

    // フォールバック: title属性パターンが失敗した場合、h2.NewsTitleから抽出
    if (results.length === 0) {
      console.log("[fetchNews] ArticleLink pattern failed, trying NewsTitle h2 pattern...");
      const h2Pattern = /<a[^>]*href="(https?:\/\/news\.netkeiba\.com\/\?pid=news_view&no=\d+)"[^>]*>/g;
      let h2Match;
      while ((h2Match = h2Pattern.exec(html)) !== null && results.length < 10) {
        const linkUrl = h2Match[1];
        const afterLink = html.substring(h2Match.index, h2Match.index + 1000);
        const titleMatch = afterLink.match(/<h2[^>]*class="NewsTitle[^"]*"[^>]*>([^<]+)<\/h2>/);
        if (!titleMatch) continue;
        const title = titleMatch[1].trim();
        if (!title || title.length < 5) continue;
        if (results.some(r => r.title === title)) continue;

        const imgMatch = afterLink.match(/<img[^>]*src="([^"]*)"[^>]*>/i);
        const thumbnailUrl = imgMatch ? imgMatch[1] : null;

        let category: ScrapedNews["category"] = "column";
        if (title.includes("速報") || title.includes("確定")) category = "breaking";
        else if (title.includes("結果") || title.includes("着順") || title.includes("勝利") || title.match(/\d+着/)) category = "result";
        else if (title.includes("予想") || title.includes("注目") || title.includes("追い切り")) category = "prediction";

        results.push({
          title: title.substring(0, 200),
          summary: title.length > 60 ? title.substring(0, 60) + "..." : title,
          linkUrl,
          thumbnailUrl,
          category,
        });
      }
    }

    console.log(`[fetchNews] Scraped ${results.length} news items from netkeiba`);
  } catch (e) {
    console.error("[fetchNews] Error scraping netkeiba news:", e);
  }
  return results;
}

export async function fetchNewsHandler(req: Request, res: Response) {
  console.log("[fetchNews] Starting news fetch job...");
  try {
    const db = await getDb();
    if (!db) {
      console.error("[fetchNews] DB not available");
      return res.status(500).json({ error: "DB not available" });
    }

    const newsData = await scrapeNetkeibaNews();
    if (newsData.length === 0) {
      console.log("[fetchNews] No news scraped, skipping DB update");
      return res.json({ success: true, message: "No news found", count: 0 });
    }

    // 既存のニュースタイトルを取得して重複チェック
    const existing = await db
      .select({ title: newsItems.title })
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt))
      .limit(50);
    const existingTitles = new Set(existing.map(e => e.title));

    let insertedCount = 0;
    for (const news of newsData) {
      if (existingTitles.has(news.title)) continue;
      await db.insert(newsItems).values({
        title: news.title,
        summary: news.summary,
        linkUrl: news.linkUrl,
        thumbnailUrl: news.thumbnailUrl,
        category: news.category,
        isPickup: true,
        isActive: true,
        publishedAt: new Date(),
      });
      insertedCount++;
    }

    // ピックアップは最新6件のみ
    const activeNews = await db
      .select({ id: newsItems.id })
      .from(newsItems)
      .where(eq(newsItems.isActive, true))
      .orderBy(desc(newsItems.publishedAt));

    for (let i = 0; i < activeNews.length; i++) {
      await db.update(newsItems).set({ isPickup: i < 6 }).where(eq(newsItems.id, activeNews[i].id));
    }

    // 古いニュース（最新20件以外）を非アクティブにする
    if (activeNews.length > 20) {
      const idsToDeactivate = activeNews.slice(20).map(n => n.id);
      for (const id of idsToDeactivate) {
        await db.update(newsItems).set({ isActive: false }).where(eq(newsItems.id, id));
      }
    }

    console.log(`[fetchNews] Inserted ${insertedCount} new news items, total active: ${Math.min(activeNews.length, 20)}`);
    return res.json({ success: true, inserted: insertedCount, totalActive: Math.min(activeNews.length, 20) });
  } catch (e) {
    console.error("[fetchNews] Error:", e);
    return res.status(500).json({ error: String(e) });
  }
}

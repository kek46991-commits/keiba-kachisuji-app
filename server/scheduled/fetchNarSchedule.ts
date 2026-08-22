/**
 * NAR（地方競馬）スケジュール取得ハンドラー
 * nar.netkeiba.com の開催一覧ページからスクレイピングしてDBに保存する
 * （keiba.go.jpはIPブロックされるため代替ソースとして使用）
 */
import { Request, Response } from "express";
import { getDb } from "../db";
import { raceSchedules } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

interface NarScheduleEntry {
  venue: string;
  raceDate: string; // YYYY-MM-DD
}

/**
 * nar.netkeiba.com の開催一覧ページをスクレイピング
 * パターン: kaisai_date=YYYYMMDD...JyoName
 */
async function scrapeNarMonthlySchedule(year: number, month: number): Promise<NarScheduleEntry[]> {
  const results: NarScheduleEntry[] = [];
  const url = `https://nar.netkeiba.com/top/calendar.html?year=${year}&month=${month}`;
  
  console.log(`[fetchNarSchedule] Fetching: ${url}`);
  
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "ja,en-US;q=0.9",
  };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    if (!res.ok) {
      console.warn(`[fetchNarSchedule] HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();
    console.log(`[fetchNarSchedule] HTML length: ${html.length}`);

    // パターン: kaisai_date=YYYYMMDD...JyoName
    const pattern = /kaisai_date=(\d{8})[\s\S]*?<span class="JyoName">(.*?)<\/span>/g;
    let match;
    const seen = new Set<string>();

    while ((match = pattern.exec(html)) !== null) {
      const dateStr = match[1]; // YYYYMMDD
      const venue = match[2].trim();
      
      if (!venue) continue;
      
      const raceDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
      const key = `${raceDate}_${venue}`;
      
      if (seen.has(key)) continue;
      seen.add(key);
      
      results.push({ venue, raceDate });
    }

    console.log(`[fetchNarSchedule] Parsed ${results.length} NAR schedule entries for ${year}/${month}`);
  } catch (e) {
    console.error("[fetchNarSchedule] Scraping error:", e);
  }
  
  return results;
}

export async function fetchNarScheduleHandler(req: Request, res: Response) {
  console.log("[fetchNarSchedule] Starting NAR schedule fetch...");
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB not available" });
    }

    const now = new Date();
    // 今月と来月のスケジュールを取得
    const months: { year: number; month: number }[] = [];
    for (let offset = 0; offset <= 1; offset++) {
      let m = now.getMonth() + 1 + offset;
      let y = now.getFullYear();
      if (m > 12) { m -= 12; y += 1; }
      months.push({ year: y, month: m });
    }

    let totalInserted = 0;

    for (const { year, month } of months) {
      const entries = await scrapeNarMonthlySchedule(year, month);
      
      for (const entry of entries) {
        // 既存データチェック（同じ日付・競馬場・organizer=NARのデータがあればスキップ）
        const existing = await db
          .select({ id: raceSchedules.id })
          .from(raceSchedules)
          .where(
            and(
              eq(raceSchedules.raceDate, entry.raceDate),
              eq(raceSchedules.venue, entry.venue),
              eq(raceSchedules.organizer, "NAR")
            )
          )
          .limit(1);

        if (existing.length > 0) continue;

        // NARは個別レース情報がないので、開催日情報として1レコード登録
        await db.insert(raceSchedules).values({
          raceDate: entry.raceDate,
          venue: entry.venue,
          raceNumber: 0,
          raceName: `${entry.venue}競馬`,
          grade: null,
          distance: null,
          surface: "dirt",
          startTime: null,
          netkeibaRaceId: null,
          horseCount: null,
          weather: null,
          trackCondition: null,
          organizer: "NAR",
        });
        totalInserted++;
      }

      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[fetchNarSchedule] Done. Inserted ${totalInserted} new NAR schedule entries.`);
    return res.json({ success: true, inserted: totalInserted });
  } catch (e) {
    console.error("[fetchNarSchedule] Error:", e);
    return res.status(500).json({ error: String(e) });
  }
}

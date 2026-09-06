/**
 * JRA公式サイト（jra.go.jp）からレーススケジュールを取得してDBに保存する
 * JRAカレンダーJSON API: https://www.jra.go.jp/keiba/common/calendar/json/YYYYMM.json
 * + netkeibaから詳細レース情報（発走時刻・距離等）を取得
 */
import { Request, Response } from "express";
import { getDb } from "../db";
import { raceSchedules } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { describeScrapeError, fetchHtml } from "../scraping/netkeibaHttp";
import { parseRaceList } from "../scraping/netkeibaParsers";

// 競馬場名の正規化（"2回新潟" → "新潟"）
function normalizeVenueName(raw: string): string {
  return raw.replace(/\d+回/, "").trim();
}

interface JraCalendarEntry {
  date: string;
  day: string;
  info: Array<{
    race: Array<{ name: string }>;
    gradeRace?: Array<{ name: string; detail: string; pos: string; grade: string }>;
    option?: Array<any>;
  }>;
}

interface JraCalendarData {
  month: string;
  data: JraCalendarEntry[];
}

/**
 * JRA公式カレンダーJSONから月間スケジュールを取得
 */
async function fetchJraCalendarJson(year: number, month: number): Promise<JraCalendarData[]> {
  const monthStr = String(month).padStart(2, "0");
  const url = `https://www.jra.go.jp/keiba/common/calendar/json/${year}${monthStr}.json`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    Accept: "application/json",
  };
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
      console.warn(`[fetchJraSchedule] HTTP ${res.status} from JRA calendar`);
      return [];
    }
    const data = await res.json() as JraCalendarData[];
    return data;
  } catch (e) {
    console.error("[fetchJraSchedule] Error fetching JRA calendar:", e);
    return [];
  }
}

/**
 * netkeibaからレース詳細（発走時刻・距離・頭数）を取得する。
 * 取得できない場合はプレースホルダーを作らず ScrapeError を投げ、失敗理由（HTTPステータス / DOM解析）を呼び出し元へ伝える。
 */
async function scrapeNetkeibaRaceList(dateStr: string): Promise<Array<{
  venue: string;
  raceNumber: number;
  raceName: string;
  grade: string;
  distance: number;
  surface: "turf" | "dirt";
  startTime: string;
  horseCount: number;
  raceId: string;
}>> {
  const dateCompact = dateStr.replace(/-/g, "");
  const url = `https://race.netkeiba.com/top/race_list_sub.html?kaisai_date=${dateCompact}`;
  const html = await fetchHtml(url, { referer: `https://race.netkeiba.com/top/race_list.html?kaisai_date=${dateCompact}` });
  return parseRaceList(html, url).map((item) => ({
    venue: normalizeVenueName(item.venueName),
    raceNumber: item.raceNumber,
    raceName: item.raceName,
    grade: item.grade ?? "",
    distance: item.distance ?? 0,
    surface: item.surface === "turf" ? "turf" : "dirt",
    startTime: item.postTime ?? "",
    horseCount: item.headCount ?? 0,
    raceId: item.netkeibaRaceId,
  }));
}

export async function fetchJraScheduleHandler(req: Request, res: Response) {
  console.log("[fetchJraSchedule] Starting JRA schedule fetch...");
  try {
    const db = await getDb();
    if (!db) {
      return res.status(500).json({ error: "DB not available" });
    }

    // 今月と来月のJRAカレンダーを取得
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const year = jstNow.getFullYear();
    const month = jstNow.getMonth() + 1;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    const months = [
      { year, month },
      { year: nextYear, month: nextMonth },
    ];

    let totalInserted = 0;
    let totalUpdated = 0;
    const failures: Array<{ date: string; detail: string }> = [];
    const emptyDates: string[] = [];

    for (const { year: y, month: m } of months) {
      const calData = await fetchJraCalendarJson(y, m);
      if (!calData || calData.length === 0) continue;

      for (const monthData of calData) {
        for (const entry of monthData.data) {
          const day = parseInt(entry.date);
          if (isNaN(day)) continue;
          const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

          // JRA開催がある日のみ処理
          const venues = entry.info?.[0]?.race ?? [];
          if (venues.length === 0) continue;

          // netkeibaから詳細レース情報を取得（レート制限対策: 1秒待機）
          await new Promise(resolve => setTimeout(resolve, 1000));
          let detailRaces: Awaited<ReturnType<typeof scrapeNetkeibaRaceList>> = [];
          try {
            detailRaces = await scrapeNetkeibaRaceList(dateStr);
          } catch (error) {
            const detail = describeScrapeError(error);
            console.error(`[fetchJraSchedule] ${dateStr} のレース一覧取得に失敗: ${detail}`);
            failures.push({ date: dateStr, detail });
            continue;
          }

          if (detailRaces.length === 0) {
            // 取得は成功したが該当レースが無い日。プレースホルダーは作らない。
            console.warn(`[fetchJraSchedule] ${dateStr}: netkeibaにレース情報が存在しません（開催前で未公開の可能性）`);
            emptyDates.push(dateStr);
            continue;
          }

          for (const race of detailRaces) {
            const existing = await db
              .select({ id: raceSchedules.id })
              .from(raceSchedules)
              .where(
                and(
                  eq(raceSchedules.raceDate, dateStr),
                  eq(raceSchedules.venue, race.venue),
                  eq(raceSchedules.raceNumber, race.raceNumber)
                )
              )
              .limit(1);

            const values = {
              raceName: race.raceName,
              grade: race.grade || null,
              distance: race.distance || null,
              surface: race.surface,
              startTime: race.startTime || null,
              netkeibaRaceId: race.raceId,
              horseCount: race.horseCount || null,
              organizer: "JRA" as const,
            };

            if (existing.length > 0) {
              await db.update(raceSchedules).set(values).where(eq(raceSchedules.id, existing[0].id));
              totalUpdated++;
            } else {
              await db.insert(raceSchedules).values({
                raceDate: dateStr,
                venue: race.venue,
                raceNumber: race.raceNumber,
                ...values,
              });
              totalInserted++;
            }
          }
        }
      }
    }

    console.log(`[fetchJraSchedule] Done: inserted=${totalInserted}, updated=${totalUpdated}, failures=${failures.length}`);
    return res.status(failures.length > 0 ? 207 : 200).json({
      success: failures.length === 0,
      inserted: totalInserted,
      updated: totalUpdated,
      emptyDates,
      failures,
    });
  } catch (e) {
    console.error("[fetchJraSchedule] Error:", e);
    return res.status(500).json({ error: String(e) });
  }
}

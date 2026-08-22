/**
 * JRA公式サイト（jra.go.jp）からレーススケジュールを取得してDBに保存する
 * JRAカレンダーJSON API: https://www.jra.go.jp/keiba/common/calendar/json/YYYYMM.json
 * + netkeibaから詳細レース情報（発走時刻・距離等）を取得
 */
import { Request, Response } from "express";
import { getDb } from "../db";
import { raceSchedules } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

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
 * netkeibaからレース詳細（発走時刻・距離・頭数）を取得
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
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
    Referer: "https://race.netkeiba.com/top/race_list.html",
  };
  const results: Array<{
    venue: string;
    raceNumber: number;
    raceName: string;
    grade: string;
    distance: number;
    surface: "turf" | "dirt";
    startTime: string;
    horseCount: number;
    raceId: string;
  }> = [];

  try {
    // 日付リストを取得してcurrent_groupを確認
    const dateListUrl = `https://race.netkeiba.com/top/race_list_get_date_list.html?kaisai_date=${dateCompact}&encoding=UTF-8`;
    const dateListRes = await fetch(dateListUrl, { headers, signal: AbortSignal.timeout(8000) });
    if (!dateListRes.ok) return [];
    const dateListHtml = await dateListRes.text();
    const groupMatch = dateListHtml.match(/group="(\d+)"/);
    const currentGroup = groupMatch ? groupMatch[1] : "";

    // レース一覧を取得
    const subUrl = `https://race.netkeiba.com/top/race_list_sub.html?kaisai_date=${dateCompact}${currentGroup ? `&current_group=${currentGroup}` : ""}`;
    const subRes = await fetch(subUrl, { headers, signal: AbortSignal.timeout(10000) });
    if (!subRes.ok) return [];
    const html = await subRes.text();

    // 競馬場ブロックを分割して処理
    const venueBlocks = html.split(/<dl class="RaceList_DataList">/);
    for (const block of venueBlocks.slice(1)) {
      // 競馬場名を取得
      const venueTitleMatch = block.match(/<p class="RaceList_DataTitle">([\s\S]*?)<\/p>/);
      let venueName = "";
      if (venueTitleMatch) {
        venueName = venueTitleMatch[1].replace(/<[^>]+>/g, "").trim().replace(/\s+/g, " ");
        const venueNameMatch = venueName.match(/\s(\S+)\s/);
        if (venueNameMatch) venueName = venueNameMatch[1];
        else venueName = venueName.replace(/\d+回|\d+日目/g, "").trim();
      }

      // 各レースアイテムを処理
      const liBlocks = block.split(/<li class="RaceList_DataItem/);
      for (const li of liBlocks.slice(1)) {
        const raceIdMatch = li.match(/race_id=(\d{12})/);
        if (!raceIdMatch) continue;
        const raceId = raceIdMatch[1];

        const venue = venueName || "不明";
        const raceNumMatch = li.match(/(\d+)R\s*\n/);
        const raceNumber = raceNumMatch ? parseInt(raceNumMatch[1]) : 0;

        const raceNameMatch = li.match(/<span class="ItemTitle">([\s\S]*?)<\/span>/);
        const raceName = raceNameMatch
          ? raceNameMatch[1].replace(/<[^>]+>/g, "").trim()
          : `${raceNumber}R`;

        // グレード判定（netkeibaのIcon_GradeType番号）
        // Type1=G1, Type2=G2, Type3=G3, Type5=L(Listed)
        // Type13=3勝クラス, Type16=OP, Type17=2勝クラス/特別, Type18=1勝クラス
        // 注意: includes("Icon_GradeType1")はType13/16/17/18にもマッチするため正規表現を使用
        let grade = "";
        const gradeTypeMatch = li.match(/Icon_GradeType(\d+)/);
        if (gradeTypeMatch) {
          const typeNum = parseInt(gradeTypeMatch[1]);
          switch (typeNum) {
            case 1: grade = "G1"; break;
            case 2: grade = "G2"; break;
            case 3: grade = "G3"; break;
            case 5: grade = "L"; break;
            case 16: grade = "OP"; break;
            // Type13(3勝クラス), Type17(2勝クラス/特別), Type18(1勝クラス)はグレードなし
            default: grade = ""; break;
          }
        }

        // 発走時刻
        const timeMatch = li.match(/<span class="RaceList_Itemtime">([\s\S]*?)<\/span>/);
        const startTime = timeMatch ? timeMatch[1].replace(/<[^>]+>/g, "").trim() : "";

        // 距離・路面
        const distMatch = li.match(/<span class="RaceList_ItemLong (Turf|Dart)">([\s\S]*?)<\/span>/);
        let surface: "turf" | "dirt" = "turf";
        let distance = 0;
        if (distMatch) {
          surface = distMatch[1] === "Turf" ? "turf" : "dirt";
          const distNum = distMatch[2].match(/(\d+)/);
          distance = distNum ? parseInt(distNum[1]) : 0;
        }

        // 頭数
        const headMatch = li.match(/<span class="RaceList_Itemnumber">([\s\S]*?)<\/span>/);
        const horseCount = headMatch
          ? parseInt(headMatch[1].replace(/[^\d]/g, "")) || 0
          : 0;

        results.push({
          venue,
          raceNumber,
          raceName,
          grade,
          distance,
          surface,
          startTime,
          horseCount,
          raceId,
        });
      }
    }
  } catch (e) {
    console.warn("[fetchJraSchedule] netkeiba scrape error:", e);
  }
  return results;
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

          const gradeRaces = entry.info?.[0]?.gradeRace ?? [];

          // netkeibaから詳細レース情報を取得（レート制限対策: 1秒待機）
          await new Promise(resolve => setTimeout(resolve, 1000));
          const detailRaces = await scrapeNetkeibaRaceList(dateStr);

          if (detailRaces.length > 0) {
            // netkeibaから詳細データが取れた場合
            for (const race of detailRaces) {
              // 既存チェック
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

              if (existing.length > 0) {
                // 更新
                await db.update(raceSchedules).set({
                  raceName: race.raceName,
                  grade: race.grade || null,
                  distance: race.distance || null,
                  surface: race.surface,
                  startTime: race.startTime || null,
                  netkeibaRaceId: race.raceId,
                  horseCount: race.horseCount || null,
                  organizer: "JRA",
                }).where(eq(raceSchedules.id, existing[0].id));
                totalUpdated++;
              } else {
                // 新規挿入
                await db.insert(raceSchedules).values({
                  raceDate: dateStr,
                  venue: race.venue,
                  raceNumber: race.raceNumber,
                  raceName: race.raceName,
                  grade: race.grade || null,
                  distance: race.distance || null,
                  surface: race.surface,
                  startTime: race.startTime || null,
                  netkeibaRaceId: race.raceId,
                  horseCount: race.horseCount || null,
                  organizer: "JRA",
                });
                totalInserted++;
              }
            }
          } else {
            // netkeibaから取得できない場合はJRAカレンダーのみでプレースホルダー作成
            for (const venueInfo of venues) {
              const venueName = normalizeVenueName(venueInfo.name);
              // 1R〜12Rのプレースホルダーを作成
              for (let raceNum = 1; raceNum <= 12; raceNum++) {
                const existing = await db
                  .select({ id: raceSchedules.id })
                  .from(raceSchedules)
                  .where(
                    and(
                      eq(raceSchedules.raceDate, dateStr),
                      eq(raceSchedules.venue, venueName),
                      eq(raceSchedules.raceNumber, raceNum)
                    )
                  )
                  .limit(1);

                if (existing.length === 0) {
                  // グレードレースの名前を割り当て
                  let raceName = `${raceNum}R`;
                  let grade: string | null = null;
                  for (const gr of gradeRaces) {
                    const pos = parseInt(gr.pos);
                    // posは競馬場の順番（1=1番目の競馬場）
                    const venueIndex = venues.findIndex(v => normalizeVenueName(v.name) === venueName);
                    if (pos === venueIndex + 1 && raceNum === 11) {
                      raceName = gr.detail || gr.name;
                      grade = gr.grade;
                    }
                  }

                  await db.insert(raceSchedules).values({
                    raceDate: dateStr,
                    venue: venueName,
                    raceNumber: raceNum,
                    raceName,
                    grade,
                    surface: "turf",
                    organizer: "JRA",
                  });
                  totalInserted++;
                }
              }
            }
          }
        }
      }
    }

    console.log(`[fetchJraSchedule] Done: inserted=${totalInserted}, updated=${totalUpdated}`);
    return res.json({ success: true, inserted: totalInserted, updated: totalUpdated });
  } catch (e) {
    console.error("[fetchJraSchedule] Error:", e);
    return res.status(500).json({ error: String(e) });
  }
}

/**
 * 当日の単勝オッズ取込。
 * 中央は netkeiba のオッズAPI、地方は地方競馬情報サイト（keiba.go.jp）の出馬表から取得し、
 * entries.odds / entries.popularity を最新値で更新する。未発表の場合は更新せず、推定値を作らない。
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { entries, races } from "../../drizzle/schema";
import { describeScrapeError, fetchHtml } from "./netkeibaHttp";
import { jstDate } from "./ingestRaceCards";
import { NAR_BABA_CODE_BY_NETKEIBA_CODE, parseNarOfficialOdds, parseNetkeibaOddsApi, type ParsedOdds } from "./oddsParsers";

export type IngestRaceOddsResult = {
  dates: string[];
  racesTargeted: number;
  racesUpdated: number;
  racesWithoutOdds: number;
  entriesUpdated: number;
  errors: Array<{ scope: string; detail: string }>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function netkeibaOddsUrl(netkeibaRaceId: string): string {
  return `https://race.netkeiba.com/api/api_get_jra_odds.html?type=1&locale=ja&race_id=${netkeibaRaceId}&action=init`;
}

function narOfficialOddsUrl(raceDate: string, venueCode: string, raceNumber: number): string | null {
  const babaCode = NAR_BABA_CODE_BY_NETKEIBA_CODE[venueCode];
  if (!babaCode) return null;
  const date = encodeURIComponent(raceDate.replace(/-/g, "/"));
  return `https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/DebaTable?k_raceDate=${date}&k_babaCode=${babaCode}&k_raceNo=${raceNumber}`;
}

/** 指定日の未確定レースについて単勝オッズを取り込む。 */
export async function ingestRaceOdds(options: {
  dates?: string[];
  raceIds?: string[];
  requestDelayMs?: number;
} = {}): Promise<IngestRaceOddsResult> {
  const dates = options.dates ?? [jstDate(0)];
  const delay = options.requestDelayMs ?? 500;
  const result: IngestRaceOddsResult = {
    dates,
    racesTargeted: 0,
    racesUpdated: 0,
    racesWithoutOdds: 0,
    entriesUpdated: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    result.errors.push({ scope: "db", detail: "データベースに接続できません" });
    return result;
  }

  const targets = options.raceIds
    ? await db.select().from(races).where(inArray(races.raceId, options.raceIds))
    : await db
        .select()
        .from(races)
        .where(and(inArray(races.raceDate, dates), inArray(races.status, ["upcoming", "entries_confirmed"])));

  result.racesTargeted = targets.length;

  for (const race of targets) {
    let parsed: ParsedOdds[] = [];
    try {
      if (race.organizer === "JRA") {
        const netkeibaRaceId = race.netkeibaRaceId ?? race.raceId;
        const url = netkeibaOddsUrl(netkeibaRaceId);
        const body = await fetchHtml(url, { referer: `https://race.netkeiba.com/race/shutuba.html?race_id=${netkeibaRaceId}` });
        parsed = parseNetkeibaOddsApi(body);
      } else {
        const url = narOfficialOddsUrl(race.raceDate, race.venueCode, race.raceNumber);
        if (!url) {
          result.errors.push({ scope: `NAR odds ${race.raceId}`, detail: `場コード${race.venueCode}に対応する地方競馬情報サイトのコードが未定義です` });
          continue;
        }
        const html = await fetchHtml(url, { referer: "https://www.keiba.go.jp/KeibaWeb/TodayRaceInfo/TodayRaceInfoTop" });
        parsed = parseNarOfficialOdds(html);
      }
    } catch (error) {
      const detail = describeScrapeError(error);
      console.error(`[ingestRaceOdds] ${race.raceId} オッズ取得に失敗: ${detail}`);
      result.errors.push({ scope: `${race.organizer} odds ${race.raceId}`, detail });
      await sleep(delay);
      continue;
    }

    if (parsed.length === 0) {
      // 発売前・オッズ未発表。エラーではないため件数のみ記録する。
      result.racesWithoutOdds += 1;
      await sleep(delay);
      continue;
    }

    for (const item of parsed) {
      await db
        .update(entries)
        .set({ odds: item.odds, popularity: item.popularity })
        .where(and(eq(entries.raceId, race.raceId), eq(entries.horseNumber, item.horseNumber)));
    }
    result.entriesUpdated += parsed.length;
    result.racesUpdated += 1;
    await sleep(delay);
  }

  console.log("[ingestRaceOdds] 完了", JSON.stringify({ ...result, errors: result.errors.length }));
  return result;
}

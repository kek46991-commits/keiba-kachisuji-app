/**
 * 本番レースデータ取込（中央・地方共通）。
 * netkeiba のレース一覧と出馬表から races / entries / race_entry_master を更新する。
 * 取得できなかった場合はデモデータへフォールバックせず、失敗内容を errors として返す。
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { entries, races } from "../../drizzle/schema";
import { upsertRaceEntryMaster } from "../raceEntryMaster";
import { describeScrapeError, fetchHtml } from "./netkeibaHttp";
import { parseRaceList, parseShutuba, type ParsedRaceListItem } from "./netkeibaParsers";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type Organizer = "JRA" | "NAR";

export type IngestIssue = { scope: string; detail: string };

export type IngestRaceCardsResult = {
  organizer: Organizer;
  dates: string[];
  racesFound: number;
  racesInserted: number;
  racesUpdated: number;
  entriesUpserted: number;
  entryPagesEmpty: number;
  errors: IngestIssue[];
};

const BASE_URL: Record<Organizer, string> = {
  JRA: "https://race.netkeiba.com",
  NAR: "https://nar.netkeiba.com",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** JSTの今日からoffset日後の日付（YYYY-MM-DD） */
export function jstDate(offsetDays = 0): string {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000 + offsetDays * 24 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

export function normalizeVenueName(venueName: string): string {
  return venueName.replace(/[（(].*?[)）]/g, "").trim() || venueName.trim();
}

export function buildRaceId(raceDate: string, venueCode: string, raceNumber: number): string {
  return `${raceDate.replace(/-/g, "")}${venueCode}${String(raceNumber).padStart(2, "0")}`;
}

async function fetchRaceListForDate(organizer: Organizer, raceDate: string): Promise<ParsedRaceListItem[]> {
  const base = BASE_URL[organizer];
  const dateCompact = raceDate.replace(/-/g, "");
  const url = `${base}/top/race_list_sub.html?kaisai_date=${dateCompact}`;
  const html = await fetchHtml(url, { referer: `${base}/top/race_list.html?kaisai_date=${dateCompact}` });
  const items = parseRaceList(html, url);
  console.log(`[ingestRaceCards] ${organizer} ${raceDate}: ${items.length}件のレースを検出 (${url})`);
  return items;
}

async function upsertRace(db: Db, organizer: Organizer, raceDate: string, item: ParsedRaceListItem) {
  const venueName = normalizeVenueName(item.venueName);
  const raceId = buildRaceId(raceDate, item.venueCode, item.raceNumber);
  const shared = {
    netkeibaRaceId: item.netkeibaRaceId,
    raceName: item.raceName,
    postTime: item.postTime,
    surface: item.surface,
    distance: item.distance,
    headCount: item.headCount,
    grade: item.grade,
    venueName,
    venueCode: item.venueCode,
    organizer,
  };
  const existing = await db.select({ id: races.id, status: races.status }).from(races).where(eq(races.raceId, raceId)).limit(1);
  if (existing.length > 0) {
    await db.update(races).set(shared).where(eq(races.raceId, raceId));
    return { raceId, inserted: false };
  }
  await db.insert(races).values({
    raceId,
    raceDate,
    raceNumber: item.raceNumber,
    status: "upcoming",
    ...shared,
  });
  return { raceId, inserted: true };
}

async function upsertEntries(db: Db, raceId: string, raceName: string, parsed: Awaited<ReturnType<typeof parseShutuba>>) {
  for (const entry of parsed) {
    const values = {
      horseName: entry.horseName,
      gateNumber: entry.gateNumber,
      gateName: entry.gateNumber === null ? null : `${entry.gateNumber}枠`,
      sex: entry.sex,
      age: entry.age,
      weight: entry.weight,
      jockey: entry.jockey,
      trainer: entry.trainer,
      odds: entry.odds,
      popularity: entry.popularity,
      horseWeight: entry.horseWeight,
      horseWeightDiff: entry.horseWeightDiff,
    };
    const existing = await db
      .select({ id: entries.id })
      .from(entries)
      .where(and(eq(entries.raceId, raceId), eq(entries.horseNumber, entry.horseNumber)))
      .limit(1);
    if (existing.length > 0) {
      await db.update(entries).set(values).where(eq(entries.id, existing[0]!.id));
    } else {
      await db.insert(entries).values({ raceId, horseNumber: entry.horseNumber, ...values });
    }
  }
  // 予想側がダミー馬名（馬A等）を保持していても表示時に実名解決できるようにマスターも更新する
  await upsertRaceEntryMaster(db, {
    raceKey: raceId,
    raceName,
    entries: parsed.map((entry) => ({
      horseNumber: entry.horseNumber,
      horseName: entry.horseName,
      jockey: entry.jockey,
      popularity: entry.popularity,
      odds: entry.odds,
    })),
  });
  return parsed.length;
}

/** 指定日のレースカード（レース情報＋出馬表）を取り込む。 */
export async function ingestRaceCards(options: {
  organizer: Organizer;
  dates?: string[];
  withEntries?: boolean;
  requestDelayMs?: number;
}): Promise<IngestRaceCardsResult> {
  const { organizer } = options;
  const dates = options.dates ?? [jstDate(0), jstDate(1)];
  const withEntries = options.withEntries ?? true;
  const delay = options.requestDelayMs ?? 700;
  const result: IngestRaceCardsResult = {
    organizer,
    dates,
    racesFound: 0,
    racesInserted: 0,
    racesUpdated: 0,
    entriesUpserted: 0,
    entryPagesEmpty: 0,
    errors: [],
  };

  const db = await getDb();
  if (!db) {
    result.errors.push({ scope: "db", detail: "データベースに接続できません" });
    return result;
  }

  for (const raceDate of dates) {
    let items: ParsedRaceListItem[];
    try {
      items = await fetchRaceListForDate(organizer, raceDate);
    } catch (error) {
      const detail = describeScrapeError(error);
      console.error(`[ingestRaceCards] ${organizer} ${raceDate} レース一覧の取得に失敗: ${detail}`);
      result.errors.push({ scope: `${organizer} race_list ${raceDate}`, detail });
      continue;
    }

    result.racesFound += items.length;
    for (const item of items) {
      // netkeibaのレースIDに含まれる場コード（中央は01〜10、地方は30以上）で主催者を検証する
      const itemOrganizer: Organizer = Number(item.venueCode) <= 10 ? "JRA" : "NAR";
      if (itemOrganizer !== organizer) {
        console.warn(`[ingestRaceCards] ${organizer}の一覧に${itemOrganizer}のレース(${item.netkeibaRaceId})が含まれていたためスキップ`);
        continue;
      }
      const { raceId, inserted } = await upsertRace(db, organizer, raceDate, item);
      if (inserted) result.racesInserted += 1;
      else result.racesUpdated += 1;

      if (!withEntries) continue;
      const base = BASE_URL[organizer];
      const shutubaUrl = `${base}/race/shutuba.html?race_id=${item.netkeibaRaceId}`;
      try {
        const html = await fetchHtml(shutubaUrl, { referer: `${base}/top/race_list.html` });
        const parsed = parseShutuba(html, shutubaUrl);
        if (parsed.length === 0) {
          // 出馬表が未発表の状態。エラーではないので件数のみ記録する。
          result.entryPagesEmpty += 1;
        } else {
          result.entriesUpserted += await upsertEntries(db, raceId, item.raceName, parsed);
          await db.update(races).set({ status: "entries_confirmed" }).where(and(eq(races.raceId, raceId), eq(races.status, "upcoming")));
        }
      } catch (error) {
        const detail = describeScrapeError(error);
        console.error(`[ingestRaceCards] ${raceId} 出馬表の取得に失敗: ${detail}`);
        result.errors.push({ scope: `${organizer} shutuba ${raceId}`, detail });
      }
      await sleep(delay);
    }
  }

  console.log(`[ingestRaceCards] 完了 ${organizer}`, JSON.stringify({ ...result, errors: result.errors.length }));
  return result;
}

import type { Request, Response } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { entries, races } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { recordOddsSnapshots } from "../oddsEngine";

const COLLECTION_LEAD_MINUTES = 60;
const CRITICAL_WINDOW_MINUTES = 10;

function jstRaceStart(raceDate: string, postTime: string): Date | null {
  const match = raceDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const time = postTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!match || !time) return null;
  return new Date(Date.UTC(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(time[1]) - 9, Number(time[2]), 0,
  ));
}

/** 公式オッズを取り込んだ時点の発走までの残り分数をJST基準で返す。 */
export function getMinutesToRaceStart(raceDate: string, postTime: string | null, now = new Date()): number | null {
  if (!postTime) return null;
  const start = jstRaceStart(raceDate, postTime);
  return start ? Math.floor((start.getTime() - now.getTime()) / 60000) : null;
}

export function getOddsCollectionCadence(raceDate: string, postTime: string, now = new Date()) {
  const minutesToStart = getMinutesToRaceStart(raceDate, postTime, now);
  if (minutesToStart === null) return { due: false, minutesToStart: null, mode: "invalid" as const };
  if (minutesToStart <= 0 || minutesToStart > COLLECTION_LEAD_MINUTES) {
    return { due: false, minutesToStart, mode: "outside_window" as const };
  }
  if (minutesToStart <= CRITICAL_WINDOW_MINUTES) {
    return { due: true, minutesToStart, mode: "critical_1min" as const };
  }
  // Heartbeat自体は毎分発火するが、通常帯では偶数分だけDBを書き換え、実取得を2分に1回に制御する。
  const due = now.getUTCMinutes() % 2 === 0;
  return { due, minutesToStart, mode: "normal_2min" as const };
}

/**
 * 1分間隔のHeartbeat。JRA・NARとも発走60分前から監視し、通常帯は2分ごと、発走10分前からは毎分保存する。
 * オッズ提供元は公式CSVまたは許諾済みのデータ連携を前提とする。entriesに保存済みのオッズのみを
 * スナップショット化し、未接続・未許諾の外部サイトへ自動アクセスしない。
 */
export async function fetchNarOddsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB not available" });

    const now = new Date();
      const allUpcoming = await db
        .select()
        .from(races)
        .where(inArray(races.status, ["upcoming", "entries_confirmed"]));

    const results: Array<{ raceId: string; mode: string; captured: number; signals: number; skipped?: string }> = [];
    for (const race of allUpcoming) {
      if (!race.postTime) continue;
      const cadence = getOddsCollectionCadence(race.raceDate, race.postTime, now);
      if (!cadence.due || cadence.minutesToStart === null) {
        if (cadence.mode !== "outside_window") results.push({ raceId: race.raceId, mode: cadence.mode, captured: 0, signals: 0, skipped: "2分間隔の待機" });
        continue;
      }

      const currentEntries = await db
        .select({
          horseNumber: entries.horseNumber,
          horseName: entries.horseName,
          odds: entries.odds,
        })
        .from(entries)
        .where(eq(entries.raceId, race.raceId));
      const validOdds = currentEntries
        .filter((entry: { odds: number | null }) => entry.odds !== null && entry.odds > 0)
        .map((entry: { horseNumber: number; horseName: string; odds: number | null }) => ({
          horseNumber: entry.horseNumber,
          horseName: entry.horseName,
          winOdds: entry.odds as number,
        }));

      if (validOdds.length === 0) {
        results.push({ raceId: race.raceId, mode: cadence.mode, captured: 0, signals: 0, skipped: "許諾済みデータ連携からのオッズ未到着" });
        continue;
      }

      const signals = await recordOddsSnapshots(db, {
        raceId: race.raceId,
        minutesToStart: cadence.minutesToStart,
        odds: validOdds,
      });
      results.push({ raceId: race.raceId, mode: cadence.mode, captured: validOdds.length, signals: signals.length });
    }

    return res.json({ ok: true, source: "stored_official_or_authorized_odds", at: now.toISOString(), results });
  } catch (error) {
    console.error("[fetchNarOdds] failed", error);
    return res.status(500).json({ error: String(error), timestamp: new Date().toISOString() });
  }
}

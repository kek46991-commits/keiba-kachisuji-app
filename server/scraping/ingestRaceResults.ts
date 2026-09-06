/**
 * 本番レース結果・確定払戻の取込（中央・地方共通）。
 * netkeiba の result.html から着順と公式払戻を取得し、races.status / entries.finishPosition / payouts を更新する。
 * 取得後は既存の精算ロジック（settlePendingConfirmedRaces）で的中判定・回収率を確定させる。
 */
import { and, eq, gte, inArray, lte, ne } from "drizzle-orm";
import { getDb } from "../db";
import { entries, payouts, races } from "../../drizzle/schema";
import { settlePendingConfirmedRaces } from "../resultSettlement";
import { backfillPredictionsForConfirmedRaces } from "../predictionBackfill";
import { upsertRaceEntryMaster } from "../raceEntryMaster";
import { describeScrapeError, fetchHtml } from "./netkeibaHttp";
import { parsePayouts, parseResultRows } from "./netkeibaParsers";
import { jstDate, type IngestIssue } from "./ingestRaceCards";

export type IngestRaceResultsResult = {
  targets: number;
  confirmed: number;
  pending: number;
  payoutsSaved: number;
  settledPredictions: number;
  backfilledPredictions: number;
  errors: IngestIssue[];
};

const BASE_URL = { JRA: "https://race.netkeiba.com", NAR: "https://nar.netkeiba.com" } as const;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 直近（既定で過去3日〜当日）の未確定レースについて結果と払戻を取り込む。 */
export async function ingestRaceResults(options: { days?: number; limit?: number; raceIds?: string[] } = {}): Promise<IngestRaceResultsResult> {
  const result: IngestRaceResultsResult = { targets: 0, confirmed: 0, pending: 0, payoutsSaved: 0, settledPredictions: 0, backfilledPredictions: 0, errors: [] };
  const db = await getDb();
  if (!db) {
    result.errors.push({ scope: "db", detail: "データベースに接続できません" });
    return result;
  }

  const days = options.days ?? 3;
  const targets = options.raceIds && options.raceIds.length > 0
    ? await db.select().from(races).where(inArray(races.raceId, options.raceIds))
    : await db
        .select()
        .from(races)
        .where(and(gte(races.raceDate, jstDate(-days)), lte(races.raceDate, jstDate(0)), ne(races.status, "results_confirmed")))
        .limit(options.limit ?? 60);
  result.targets = targets.length;

  for (const race of targets) {
    if (!race.netkeibaRaceId) {
      result.errors.push({ scope: `result ${race.raceId}`, detail: "netkeibaRaceIdが未登録のため結果を取得できません" });
      continue;
    }
    const base = BASE_URL[race.organizer];
    const url = `${base}/race/result.html?race_id=${race.netkeibaRaceId}`;
    try {
      const html = await fetchHtml(url, { referer: `${base}/top/race_list.html` });
      const rows = parseResultRows(html, url);
      if (rows.length === 0 || rows.every((row) => row.finishPosition === null)) {
        // 未確定（発走前・中止など）。誤った不的中判定を避けるため何も更新しない。
        result.pending += 1;
        continue;
      }

      for (const row of rows) {
        const existing = await db
          .select({ id: entries.id })
          .from(entries)
          .where(and(eq(entries.raceId, race.raceId), eq(entries.horseNumber, row.horseNumber)))
          .limit(1);
        const values = {
          horseName: row.horseName,
          gateNumber: row.gateNumber,
          finishPosition: row.finishPosition,
          finishTime: row.finishTime,
          margin: row.margin,
          last3f: row.last3f,
          cornerPositions: row.cornerPositions,
          odds: row.odds,
          popularity: row.popularity,
        };
        if (existing.length > 0) {
          await db.update(entries).set(values).where(eq(entries.id, existing[0]!.id));
        } else {
          await db.insert(entries).values({ raceId: race.raceId, horseNumber: row.horseNumber, ...values });
        }
      }
      await upsertRaceEntryMaster(db, {
        raceKey: race.raceId,
        raceName: race.raceName,
        entries: rows.map((row) => ({ horseNumber: row.horseNumber, horseName: row.horseName, popularity: row.popularity, odds: row.odds })),
      });

      const parsedPayouts = parsePayouts(html, url);
      if (parsedPayouts.length > 0) {
        await db.delete(payouts).where(eq(payouts.raceId, race.raceId));
        for (const item of parsedPayouts) {
          await db.insert(payouts).values({
            raceId: race.raceId,
            betType: item.betType,
            combination: item.combination,
            payout: item.payout,
            popularity: item.popularity,
          });
        }
        result.payoutsSaved += parsedPayouts.length;
      } else {
        result.errors.push({ scope: `payout ${race.raceId}`, detail: "確定払戻テーブルを取得できませんでした" });
      }

      await db.update(races).set({ status: "results_confirmed" }).where(eq(races.raceId, race.raceId));
      result.confirmed += 1;
      console.log(`[ingestRaceResults] ${race.raceId} 確定: ${rows.length}頭 / 払戻${parsedPayouts.length}件`);
    } catch (error) {
      const detail = describeScrapeError(error);
      console.error(`[ingestRaceResults] ${race.raceId} 結果取得に失敗: ${detail}`);
      result.errors.push({ scope: `result ${race.raceId}`, detail });
    }
    await sleep(500);
  }

  if (result.confirmed > 0) {
    // 予想が未保存の確定レースへ決定論的スコアリングで予想を補完し、成績集計の対象にする。
    const backfilled = await backfillPredictionsForConfirmedRaces(db, 200);
    result.backfilledPredictions = backfilled.created;
    const settled = await settlePendingConfirmedRaces(db, 300);
    result.settledPredictions = settled.length;
  }

  console.log("[ingestRaceResults] 完了", JSON.stringify({ ...result, errors: result.errors.length }));
  return result;
}

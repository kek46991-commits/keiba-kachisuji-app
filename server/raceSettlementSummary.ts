import { asc, desc, eq, inArray } from "drizzle-orm";
import { entries, payouts, predictions, raceEntryMaster, races } from "../drizzle/schema";
import { buildHorseNameMap, type HorseNameMap } from "../shared/horseNameMapping";
import { buildRaceResultSummary, type RaceResultSummary, type ResultEntryInput } from "../shared/raceResultSummary";
import { calculatePredictionSettlement } from "./resultSettlement";
import { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const settlementBetTypes = ["trifecta", "trio", "quinella", "exacta", "wide"] as const;
type SettlementBetType = (typeof settlementBetTypes)[number];

export type RaceSettlementInput = {
  raceId: string;
  resultsConfirmed: boolean;
  entries: ResultEntryInput[];
  nameMap?: HorseNameMap;
  officialPayouts: Array<{ betType: SettlementBetType; combination: string; payout: number }>;
  prediction: { recommendedBets: string | null; investAmount: number | null; returnAmount: number | null; isHit: boolean | null } | null;
};

export type RaceSettlementSummary = RaceResultSummary & {
  hasPrediction: boolean;
  settlementState: "no_prediction" | "settled" | "pending_ticket_data" | "pending_payouts";
};

/** 保存済み予想と公式払戻からレース単位の的中判定・回収率を組み立てる。 */
export function buildRaceSettlementSummary(input: RaceSettlementInput): RaceSettlementSummary {
  if (!input.prediction) {
    return {
      ...buildRaceResultSummary({
        raceId: input.raceId,
        resultsConfirmed: input.resultsConfirmed,
        entries: input.entries,
        nameMap: input.nameMap,
        isHit: null,
        investAmount: null,
        returnAmount: null,
      }),
      hasPrediction: false,
      settlementState: "no_prediction",
    };
  }

  const calculated = calculatePredictionSettlement(input.prediction.recommendedBets, input.officialPayouts);
  const isHit = calculated.state === "settled" ? calculated.isHit : input.prediction.isHit;
  const returnAmount = calculated.state === "settled" ? calculated.returnAmount : input.prediction.returnAmount;

  return {
    ...buildRaceResultSummary({
      raceId: input.raceId,
      resultsConfirmed: input.resultsConfirmed,
      entries: input.entries,
      nameMap: input.nameMap,
      isHit,
      investAmount: input.prediction.investAmount,
      returnAmount,
    }),
    hasPrediction: true,
    settlementState: calculated.state,
  };
}

export function buildRaceSettlementSummaries(inputs: RaceSettlementInput[]): RaceSettlementSummary[] {
  return inputs.map(buildRaceSettlementSummary);
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const grouped = new Map<K, T[]>();
  for (const row of rows) {
    const groupKey = key(row);
    const bucket = grouped.get(groupKey);
    if (bucket) bucket.push(row);
    else grouped.set(groupKey, [row]);
  }
  return grouped;
}

/** 中央・地方どちらのレースでも、共通テーブルからレース単位の結果照合サマリーを取得する。 */
export async function summarizeRaceSettlements(db: Db, raceIds: string[]): Promise<RaceSettlementSummary[]> {
  const uniqueRaceIds = Array.from(new Set(raceIds.filter(raceId => raceId.trim())));
  if (uniqueRaceIds.length === 0) return [];

  const [raceRows, entryRows, payoutRows, predictionRows, masterRows] = await Promise.all([
    db.select({ raceId: races.raceId, status: races.status }).from(races).where(inArray(races.raceId, uniqueRaceIds)),
    db
      .select({ raceId: entries.raceId, horseNumber: entries.horseNumber, horseName: entries.horseName, finishPosition: entries.finishPosition })
      .from(entries)
      .where(inArray(entries.raceId, uniqueRaceIds))
      .orderBy(asc(entries.horseNumber)),
    db
      .select({ raceId: payouts.raceId, betType: payouts.betType, combination: payouts.combination, payout: payouts.payout })
      .from(payouts)
      .where(inArray(payouts.raceId, uniqueRaceIds)),
    db
      .select({
        raceId: predictions.raceId,
        recommendedBets: predictions.recommendedBets,
        investAmount: predictions.investAmount,
        returnAmount: predictions.returnAmount,
        isHit: predictions.isHit,
      })
      .from(predictions)
      .where(inArray(predictions.raceId, uniqueRaceIds))
      .orderBy(desc(predictions.predictedAt), desc(predictions.id)),
    db
      .select({ raceKey: raceEntryMaster.raceKey, horseNumber: raceEntryMaster.horseNumber, horseName: raceEntryMaster.horseName })
      .from(raceEntryMaster)
      .where(inArray(raceEntryMaster.raceKey, uniqueRaceIds)),
  ]);

  const statusByRace = new Map(raceRows.map(race => [race.raceId, race.status]));
  const entriesByRace = groupBy(entryRows, row => row.raceId);
  const payoutsByRace = groupBy(payoutRows, row => row.raceId);
  const masterByRace = groupBy(masterRows, row => row.raceKey);
  const latestPredictionByRace = new Map<string, (typeof predictionRows)[number]>();
  for (const prediction of predictionRows) {
    if (!latestPredictionByRace.has(prediction.raceId)) latestPredictionByRace.set(prediction.raceId, prediction);
  }

  return buildRaceSettlementSummaries(
    uniqueRaceIds.map(raceId => {
      const prediction = latestPredictionByRace.get(raceId) ?? null;
      return {
        raceId,
        resultsConfirmed: statusByRace.get(raceId) === "results_confirmed",
        entries: entriesByRace.get(raceId) ?? [],
        nameMap: buildHorseNameMap(masterByRace.get(raceId) ?? []),
        officialPayouts: (payoutsByRace.get(raceId) ?? [])
          .filter((payout): payout is typeof payout & { betType: SettlementBetType } =>
            settlementBetTypes.includes(payout.betType as SettlementBetType))
          .map(payout => ({ betType: payout.betType, combination: payout.combination, payout: payout.payout })),
        prediction: prediction
          ? {
              recommendedBets: prediction.recommendedBets,
              investAmount: prediction.investAmount,
              returnAmount: prediction.returnAmount,
              isHit: prediction.isHit,
            }
          : null,
      };
    }),
  );
}

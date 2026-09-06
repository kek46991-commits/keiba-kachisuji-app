/**
 * 確定済みレースのうち予想が未保存のものへ、保存済み出走表から決定論的スコアリングで予想を生成する。
 * 生成に使うのは出走表・騎手成績など公式取込データのみで、着順や払戻は参照しない。
 * 公式払戻が未取得のレースは対象外にし、生成後の的中判定は settlePendingConfirmedRaces に委ねる。
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import { entries, jockeyMaster, payouts, predictions, races } from "../drizzle/schema";
import {
  assignRatings,
  calculateScore,
  generateBettingRecommendation,
  generatePartialBettingRecommendation,
  type EntryData,
  type PredictionResult,
} from "./predictionRouter";
import { applyPredictionMetrics } from "./predictionMetrics";
import { getPredictionAvailability } from "./predictionAvailability";
import { savePredictionTicketSets } from "./predictionTicketSets";

type Db = any;

export type BackfillSummary = {
  created: number;
  skippedExisting: number;
  skippedNoPayouts: number;
  skippedNoEntries: number;
};

export async function backfillPredictionsForConfirmedRaces(db: Db, limit = 200): Promise<BackfillSummary> {
  const summary: BackfillSummary = { created: 0, skippedExisting: 0, skippedNoPayouts: 0, skippedNoEntries: 0 };

  const confirmedRaces = await db
    .select()
    .from(races)
    .where(eq(races.status, "results_confirmed"))
    .orderBy(asc(races.raceDate), asc(races.venueName), asc(races.raceNumber))
    .limit(limit);

  const raceIds = confirmedRaces.map((race: typeof races.$inferSelect) => race.raceId);
  if (raceIds.length === 0) return summary;

  const [existing, payoutRows, jockeyRows] = await Promise.all([
    db.select({ raceId: predictions.raceId }).from(predictions).where(inArray(predictions.raceId, raceIds)),
    db.select({ raceId: payouts.raceId }).from(payouts).where(inArray(payouts.raceId, raceIds)),
    db.select().from(jockeyMaster),
  ]);
  const alreadyPredicted = new Set(existing.map((row: { raceId: string }) => row.raceId));
  const withPayouts = new Set(payoutRows.map((row: { raceId: string }) => row.raceId));
  const jockeyStats = new Map(jockeyRows.map((j: typeof jockeyMaster.$inferSelect) => [j.name, {
    winRate: j.winRate ?? 0,
    placeRate: j.placeRate ?? 0,
    turfWinRate: j.turfWinRate ?? 0,
    dirtWinRate: j.dirtWinRate ?? 0,
    heavyWinRate: j.heavyWinRate ?? 0,
  }])) as Map<string, { winRate: number; placeRate: number; turfWinRate: number; dirtWinRate: number; heavyWinRate: number }>;

  for (const race of confirmedRaces as Array<typeof races.$inferSelect>) {
    if (alreadyPredicted.has(race.raceId)) {
      summary.skippedExisting += 1;
      continue;
    }
    if (!withPayouts.has(race.raceId)) {
      summary.skippedNoPayouts += 1;
      continue;
    }

    const entryRows = await db
      .select()
      .from(entries)
      .where(eq(entries.raceId, race.raceId))
      .orderBy(asc(entries.horseNumber));

    const availability = getPredictionAvailability(entryRows.length);
    if (!availability.canScore) {
      summary.skippedNoEntries += 1;
      continue;
    }

    const raceEntries: EntryData[] = entryRows.map((e: typeof entries.$inferSelect) => ({
      horseNumber: e.horseNumber,
      horseName: e.horseName,
      jockey: e.jockey,
      odds: e.odds,
      popularity: e.popularity,
      weight: e.weight,
      gateNumber: e.gateNumber,
      age: e.age,
      sex: e.sex,
      sire: e.sire,
      dam: e.dam,
      horseWeight: e.horseWeight,
      horseWeightDiff: e.horseWeightDiff,
      last3f: e.last3f,
    }));

    let scored: PredictionResult[] = raceEntries.map(entry => {
      const breakdown = calculateScore(entry, {
        surface: race.surface,
        distance: race.distance,
        venueName: race.venueName,
        trackCondition: race.trackCondition,
        headCount: race.headCount ?? raceEntries.length,
      }, jockeyStats);
      return {
        horseNumber: entry.horseNumber,
        horseName: entry.horseName,
        jockey: entry.jockey,
        odds: null,
        score: breakdown.abilityScore,
        winProbability: 0,
        expectedValue: null,
        breakdown,
        rating: "",
      };
    });

    scored = applyPredictionMetrics(scored);
    scored.sort((a, b) => b.score - a.score);
    const ratings = assignRatings(scored);
    for (const entry of scored) entry.rating = ratings.get(entry.horseNumber) ?? "☆";

    const predictionOnly = scored.map(entry => ({ ...entry, odds: null, expectedValue: null }));
    const recommendation = availability.canGenerateCombinationBets
      ? generateBettingRecommendation(predictionOnly, { oddsMode: "predicted" })
      : generatePartialBettingRecommendation(predictionOnly);

    const top3 = scored.slice(0, 3);
    const investAmount = recommendation.referenceOnly ? 0 : recommendation.totalBets * 100;
    await db.insert(predictions).values({
      raceId: race.raceId,
      honmei: top3[0]?.horseNumber ?? 0,
      taikou: top3[1]?.horseNumber ?? 0,
      tanana: top3[2]?.horseNumber ?? 0,
      renka: JSON.stringify(scored.slice(3, 5).map(entry => entry.horseNumber)),
      recommendedBets: JSON.stringify(recommendation),
      investAmount,
      reasoning: recommendation.reasoning.join("\n"),
    });

    const [saved] = await db
      .select({ id: predictions.id })
      .from(predictions)
      .where(eq(predictions.raceId, race.raceId))
      .orderBy(sql`${predictions.id} desc`)
      .limit(1);
    if (saved) {
      await savePredictionTicketSets(db, {
        predictionId: saved.id,
        raceId: race.raceId,
        sets: [{ strategy: "score", ticketData: recommendation, investAmount }],
      });
    }
    summary.created += 1;
  }

  return summary;
}

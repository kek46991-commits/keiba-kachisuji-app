/**
 * 確定済みレースに対して、保存済みの実データ（出走表）から予想を一括生成し、
 * 公式払戻で精算まで行うバックフィルスクリプト。
 *
 * 実行例:
 *   DATABASE_URL='mysql://root:keiba@127.0.0.1:3307/keiba' npx tsx backfill_predictions.ts
 *
 * 既に予想があるレースはスキップし、公式結果・払戻が揃っていないレースは精算保留のまま残す。
 */
import { drizzle } from "drizzle-orm/mysql2";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { entries, jockeyMaster, payouts, predictions, races } from "./drizzle/schema";
import {
  assignRatings,
  calculateScore,
  generateBettingRecommendation,
  generatePartialBettingRecommendation,
  type EntryData,
  type PredictionResult,
} from "./server/predictionRouter";
import { applyPredictionMetrics } from "./server/predictionMetrics";
import { getPredictionAvailability } from "./server/predictionAvailability";
import { savePredictionTicketSets } from "./server/predictionTicketSets";
import { settlePendingConfirmedRaces } from "./server/resultSettlement";

const db = drizzle(process.env.DATABASE_URL!);

async function main() {
  const limit = Number(process.env.BACKFILL_LIMIT ?? "500");

  const confirmedRaces = await db
    .select()
    .from(races)
    .where(eq(races.status, "results_confirmed"))
    .orderBy(asc(races.raceDate), asc(races.venueName), asc(races.raceNumber))
    .limit(limit);

  const raceIds = confirmedRaces.map(race => race.raceId);
  if (raceIds.length === 0) {
    console.log("確定済みレースがありません");
    return;
  }

  const [existing, payoutRows] = await Promise.all([
    db.select({ raceId: predictions.raceId }).from(predictions).where(inArray(predictions.raceId, raceIds)),
    db.select({ raceId: payouts.raceId }).from(payouts).where(inArray(payouts.raceId, raceIds)),
  ]);
  const alreadyPredicted = new Set(existing.map(row => row.raceId));
  const withPayouts = new Set(payoutRows.map(row => row.raceId));

  const jockeyRows = await db.select().from(jockeyMaster);
  const jockeyStats = new Map(jockeyRows.map(j => [j.name, {
    winRate: j.winRate ?? 0,
    placeRate: j.placeRate ?? 0,
    turfWinRate: j.turfWinRate ?? 0,
    dirtWinRate: j.dirtWinRate ?? 0,
    heavyWinRate: j.heavyWinRate ?? 0,
  }]));

  let created = 0;
  let skippedNoPayouts = 0;
  let skippedNoEntries = 0;
  let skippedExisting = 0;

  for (const race of confirmedRaces) {
    if (alreadyPredicted.has(race.raceId)) {
      skippedExisting += 1;
      continue;
    }
    if (!withPayouts.has(race.raceId)) {
      skippedNoPayouts += 1;
      continue;
    }

    const entryRows = await db
      .select()
      .from(entries)
      .where(eq(entries.raceId, race.raceId))
      .orderBy(asc(entries.horseNumber));

    const availability = getPredictionAvailability(entryRows.length);
    if (!availability.canScore) {
      skippedNoEntries += 1;
      continue;
    }

    const raceEntries: EntryData[] = entryRows.map(e => ({
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
      renka: JSON.stringify(scored.slice(3, 5).map(e => e.horseNumber)),
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
      await savePredictionTicketSets(db as any, {
        predictionId: saved.id,
        raceId: race.raceId,
        sets: [{ strategy: "score", ticketData: recommendation, investAmount }],
      });
    }
    created += 1;
  }

  console.log(JSON.stringify({ created, skippedExisting, skippedNoPayouts, skippedNoEntries }, null, 2));

  const settlement = await settlePendingConfirmedRaces(db as any, 1000);
  console.log(JSON.stringify({ settlement: settlement.length }, null, 2));

  const [summary] = await db
    .select({
      total: sql<number>`count(*)`,
      settled: sql<number>`sum(case when ${predictions.isHit} is not null then 1 else 0 end)`,
      hits: sql<number>`sum(case when ${predictions.isHit} = true then 1 else 0 end)`,
      invest: sql<number>`sum(${predictions.investAmount})`,
      ret: sql<number>`sum(${predictions.returnAmount})`,
    })
    .from(predictions);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

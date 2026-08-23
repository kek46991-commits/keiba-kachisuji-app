import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { races, entries, predictions, predictionTicketSets, payouts } from "../drizzle/schema";
import { eq, desc, and, gte, lte, sql, isNull, inArray } from "drizzle-orm";
import { aggregateTicketPerformance, hasAuditableRecordedBets } from "./ticketPerformance";
import { predictionHistoryFilterInputSchema } from "./predictionHistoryFilters";
import { aggregatePredictionHistoryPerformance, buildPredictionHistoryTimeline } from "./predictionHistoryPerformance";
import { aggregateBetTypePerformance } from "./betTypePerformance";
import { buildRaceDetailReconciliation } from "./raceDetailReconciliation";
import { readTicketSelections, ticketStrategyLabels, type TicketStrategy } from "./predictionTicketSets";
import { getRaceActionStatus } from "./raceActionStatus";
import { getHorseNameMap } from "./raceEntryMaster";
import { withResolvedHorseNames } from "../shared/horseNameMapping";
import { summarizeRaceSettlements } from "./raceSettlementSummary";
import { settlePendingConfirmedRaces } from "./resultSettlement";

export const raceDataRouter = router({
  // 今週末のレース一覧を取得
  getThisWeekend: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    // 今日〜7日後のレースを取得
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const nextWeek = new Date(Date.now() + 7 * 86400000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

    const result = await db
      .select()
      .from(races)
      .where(and(gte(races.raceDate, today), lte(races.raceDate, nextWeek)))
      .orderBy(races.raceDate, races.raceNumber);

    return result;
  }),

  // 特定日のレース一覧を取得
  getByDate: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db
        .select()
        .from(races)
        .where(eq(races.raceDate, input.date))
        .orderBy(races.venueName, races.raceNumber);

      return result;
    }),

  // レース詳細（出走馬含む）を取得
  getDetail: publicProcedure
    .input(z.object({ raceId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [race] = await db
        .select()
        .from(races)
        .where(eq(races.raceId, input.raceId))
        .limit(1);

      if (!race) return null;

      const raceEntries = await db
        .select()
        .from(entries)
        .where(eq(entries.raceId, input.raceId))
        .orderBy(entries.horseNumber);

      const racePayouts = await db
        .select()
        .from(payouts)
        .where(eq(payouts.raceId, input.raceId));

      const nameMap = await getHorseNameMap(db, input.raceId);

      const racePredictions = await db
        .select()
        .from(predictions)
        .where(eq(predictions.raceId, input.raceId))
        .orderBy(desc(predictions.predictedAt), desc(predictions.id))
        .limit(1);

      const latestPrediction = racePredictions[0] ?? null;
      const storedTicketSets = latestPrediction
        ? await db
            .select()
            .from(predictionTicketSets)
            .where(eq(predictionTicketSets.predictionId, latestPrediction.id))
        : [];
      const storedSetByStrategy = new Map(storedTicketSets.map(ticketSet => [ticketSet.strategy as TicketStrategy, ticketSet]));
      const strategyTicketSources = latestPrediction
        ? (["score", "longshot"] as TicketStrategy[]).map(strategy => {
            const stored = storedSetByStrategy.get(strategy);
            if (stored) {
              return {
                strategy,
                ticketData: stored.ticketData,
                investAmount: stored.investAmount,
                returnAmount: stored.returnAmount,
                isHit: stored.isHit,
                recorded: true,
              };
            }
            if (strategy === "score") {
              return {
                strategy,
                ticketData: latestPrediction.recommendedBets,
                investAmount: latestPrediction.investAmount,
                returnAmount: latestPrediction.returnAmount,
                isHit: latestPrediction.isHit,
                recorded: false,
              };
            }
            return {
              strategy,
              ticketData: null,
              investAmount: null,
              returnAmount: null,
              isHit: null,
              recorded: false,
            };
          })
        : [];

      return {
        race,
        raceActionStatus: getRaceActionStatus({
          raceDate: race.raceDate,
          startTime: race.postTime,
          resultsConfirmed: race.status === "results_confirmed",
        }),
        entries: withResolvedHorseNames(raceEntries, nameMap),
        payouts: racePayouts,
        prediction: latestPrediction,
        reconciliation: buildRaceDetailReconciliation({
          prediction: latestPrediction,
          officialPayouts: racePayouts
            .filter(payout => ["trifecta", "trio", "quinella", "exacta", "wide"].includes(payout.betType))
            .map(payout => ({
              betType: payout.betType as "trifecta" | "trio" | "quinella" | "exacta" | "wide",
              combination: payout.combination,
              payout: payout.payout,
            })),
          entries: raceEntries.map(entry => ({ horseNumber: entry.horseNumber, horseName: entry.horseName, finishPosition: entry.finishPosition })),
          nameMap,
        }),
        strategyReconciliations: strategyTicketSources.map(ticketSet => ({
          strategy: ticketSet.strategy,
          label: ticketStrategyLabels[ticketSet.strategy],
          recorded: ticketSet.recorded,
          reconciliation: buildRaceDetailReconciliation({
            prediction: {
              recommendedBets: ticketSet.ticketData,
              investAmount: ticketSet.investAmount,
              returnAmount: ticketSet.returnAmount,
              isHit: ticketSet.isHit,
            },
            officialPayouts: racePayouts
              .filter(payout => ["trifecta", "trio", "quinella", "exacta", "wide"].includes(payout.betType))
              .map(payout => ({
                betType: payout.betType as "trifecta" | "trio" | "quinella" | "exacta" | "wide",
                combination: payout.combination,
                payout: payout.payout,
              })),
            entries: raceEntries.map(entry => ({ horseNumber: entry.horseNumber, horseName: entry.horseName, finishPosition: entry.finishPosition })),
            nameMap,
          }),
        })),
      };
    }),

  // レース一覧向けの結果照合・回収率サマリー（中央・地方共通）
  getRaceSettlements: publicProcedure
    .input(z.object({ raceIds: z.array(z.string()).max(200) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db || input.raceIds.length === 0) return [];
      await settlePendingConfirmedRaces(db);
      return summarizeRaceSettlements(db, input.raceIds);
    }),

  // 予想履歴を取得
  getPredictionHistory: publicProcedure
    .input(predictionHistoryFilterInputSchema)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { predictions: [], total: 0 };

      const conditions = [];
      if (input.venueMissing) conditions.push(isNull(races.venueName));
      else if (input.venue) conditions.push(eq(races.venueName, input.venue));
      if (input.distanceMissing) conditions.push(isNull(races.distance));
      else if (input.distance) conditions.push(eq(races.distance, input.distance));
      if (input.trackConditionMissing) conditions.push(isNull(races.trackCondition));
      else if (input.trackCondition) conditions.push(eq(races.trackCondition, input.trackCondition));

      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const result = await db
        .select({ prediction: predictions, race: races })
        .from(predictions)
        .leftJoin(races, eq(races.raceId, predictions.raceId))
        .where(where)
        .orderBy(desc(predictions.predictedAt), desc(predictions.id))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(predictions)
        .leftJoin(races, eq(races.raceId, predictions.raceId))
        .where(where);

      const predictionIds = result.map(row => row.prediction.id);
      const ticketSets = predictionIds.length > 0
        ? await db
            .select()
            .from(predictionTicketSets)
            .where(inArray(predictionTicketSets.predictionId, predictionIds))
        : [];
      const setsByPrediction = new Map<number, typeof ticketSets>();
      for (const ticketSet of ticketSets) {
        const existing = setsByPrediction.get(ticketSet.predictionId) ?? [];
        existing.push(ticketSet);
        setsByPrediction.set(ticketSet.predictionId, existing);
      }

      return {
        predictions: result.map(row => {
          const storedSets = setsByPrediction.get(row.prediction.id) ?? [];
          const setByStrategy = new Map(storedSets.map(ticketSet => [ticketSet.strategy as TicketStrategy, ticketSet]));
          const ticketSetSummaries = (["score", "longshot"] as TicketStrategy[]).map(strategy => {
            const stored = setByStrategy.get(strategy);
            if (stored) {
              return {
                strategy,
                label: ticketStrategyLabels[strategy],
                selections: readTicketSelections(stored.ticketData),
                investAmount: stored.investAmount,
                returnAmount: stored.returnAmount,
                isHit: stored.isHit,
                recorded: true,
              };
            }
            if (strategy === "score") {
              return {
                strategy,
                label: ticketStrategyLabels.score,
                selections: readTicketSelections(row.prediction.recommendedBets),
                investAmount: row.prediction.investAmount,
                returnAmount: row.prediction.returnAmount,
                isHit: row.prediction.isHit,
                recorded: false,
              };
            }
            return {
              strategy,
              label: ticketStrategyLabels.longshot,
              selections: [],
              investAmount: null,
              returnAmount: null,
              isHit: null,
              recorded: false,
            };
          });
          const raceActionStatus = row.race
            ? getRaceActionStatus({
                raceDate: row.race.raceDate,
                startTime: row.race.postTime,
                resultsConfirmed: row.race.status === "results_confirmed",
              })
            : null;
          return { ...row.prediction, race: row.race, raceActionStatus, ticketSetSummaries };
        }),
        total: countResult?.count ?? 0,
      };
    }),

  /** 現在選択中の会場・距離・馬場状態に対する、確定済み買い目の実測成績。 */
  getPredictionHistoryPerformance: publicProcedure
    .input(predictionHistoryFilterInputSchema)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return aggregatePredictionHistoryPerformance([]);

      const conditions = [];
      if (input.venueMissing) conditions.push(isNull(races.venueName));
      else if (input.venue) conditions.push(eq(races.venueName, input.venue));
      if (input.distanceMissing) conditions.push(isNull(races.distance));
      else if (input.distance) conditions.push(eq(races.distance, input.distance));
      if (input.trackConditionMissing) conditions.push(isNull(races.trackCondition));
      else if (input.trackCondition) conditions.push(eq(races.trackCondition, input.trackCondition));

      await settlePendingConfirmedRaces(db);

      const settled = await db
        .select({
          id: predictions.id,
          raceId: predictions.raceId,
          predictedAt: predictions.predictedAt,
          recommendedBets: predictions.recommendedBets,
          isHit: predictions.isHit,
          investAmount: predictions.investAmount,
          returnAmount: predictions.returnAmount,
        })
        .from(predictions)
        .innerJoin(races, eq(races.raceId, predictions.raceId))
        .where(and(eq(races.status, "results_confirmed"), sql`${predictions.isHit} is not null`, ...conditions));

      return aggregatePredictionHistoryPerformance(settled);
    }),

  /** 現在選択中の条件における、日別の累積収支・累積回収率の推移。 */
  getPredictionHistoryTimeline: publicProcedure
    .input(predictionHistoryFilterInputSchema)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return buildPredictionHistoryTimeline([]);

      const conditions = [];
      if (input.venueMissing) conditions.push(isNull(races.venueName));
      else if (input.venue) conditions.push(eq(races.venueName, input.venue));
      if (input.distanceMissing) conditions.push(isNull(races.distance));
      else if (input.distance) conditions.push(eq(races.distance, input.distance));
      if (input.trackConditionMissing) conditions.push(isNull(races.trackCondition));
      else if (input.trackCondition) conditions.push(eq(races.trackCondition, input.trackCondition));

      await settlePendingConfirmedRaces(db);

      const settled = await db
        .select({
          id: predictions.id,
          raceId: predictions.raceId,
          predictedAt: predictions.predictedAt,
          recommendedBets: predictions.recommendedBets,
          isHit: predictions.isHit,
          investAmount: predictions.investAmount,
          returnAmount: predictions.returnAmount,
        })
        .from(predictions)
        .innerJoin(races, eq(races.raceId, predictions.raceId))
        .where(and(eq(races.status, "results_confirmed"), sql`${predictions.isHit} is not null`, ...conditions));

      return buildPredictionHistoryTimeline(settled);
    }),

  // フィルター選択肢は、実際に保存済み予想と紐付くレース条件だけを返す。
  getPredictionHistoryFilterOptions: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { venues: [], distances: [], trackConditions: [], missing: { venue: false, distance: false, trackCondition: false } };

    const rows = await db
      .select({ venueName: races.venueName, distance: races.distance, trackCondition: races.trackCondition })
      .from(predictions)
      .leftJoin(races, eq(races.raceId, predictions.raceId));

    return {
      venues: Array.from(new Set(rows.map(row => row.venueName).filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "ja")),
      distances: Array.from(new Set(rows.map(row => row.distance).filter((value): value is number => typeof value === "number"))).sort((a, b) => a - b),
      trackConditions: Array.from(new Set(rows.map(row => row.trackCondition).filter((value): value is "good" | "slightly_heavy" | "heavy" | "bad" => Boolean(value)))),
      missing: {
        venue: rows.some(row => row.venueName === null),
        distance: rows.some(row => row.distance === null),
        trackCondition: rows.some(row => row.trackCondition === null),
      },
    };
  }),

  // 的中率統計を取得
  getStats: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, hits: 0, hitRate: 0, totalReturn: 0, totalInvest: 0, roi: 0, excludedLegacyCount: 0 };

    const settled = await db
      .select({
        id: predictions.id,
        raceId: predictions.raceId,
        predictedAt: predictions.predictedAt,
        recommendedBets: predictions.recommendedBets,
        isHit: predictions.isHit,
        investAmount: predictions.investAmount,
        returnAmount: predictions.returnAmount,
      })
      .from(predictions)
      .innerJoin(races, eq(races.raceId, predictions.raceId))
      .where(and(eq(races.status, "results_confirmed"), sql`${predictions.isHit} is not null`))
      .orderBy(desc(predictions.predictedAt), desc(predictions.id));

    // 同一レースへの再生成は最新記録だけを採用し、点数未記録の旧形式は実測対象から除外する。
    const latestByRace = new Map<string, typeof settled[number]>();
    for (const prediction of settled) {
      if (!latestByRace.has(prediction.raceId)) latestByRace.set(prediction.raceId, prediction);
    }
    const latestSettled = Array.from(latestByRace.values());
    const auditable = latestSettled.filter(prediction => hasAuditableRecordedBets(prediction.recommendedBets));
    const total = auditable.length;
    const hits = auditable.filter(prediction => prediction.isHit).length;
    const totalReturn = auditable.reduce((sum, prediction) => sum + Number(prediction.returnAmount ?? 0), 0);
    const totalInvest = auditable.reduce((sum, prediction) => sum + Number(prediction.investAmount ?? 0), 0);

    return {
      total,
      hits,
      hitRate: total > 0 ? Math.round((hits / total) * 1000) / 10 : 0,
      totalReturn,
      totalInvest,
      roi: totalInvest > 0 ? Math.round((totalReturn / totalInvest) * 1000) / 10 : 0,
      excludedLegacyCount: latestSettled.length - auditable.length,
    };
  }),

  /** 保存済み買い目点数を使い、点数帯ごとの収支と的中率を比較する。 */
  getTicketPointPerformance: publicProcedure
    .input(z.object({ days: z.number().int().min(7).max(3650).default(365) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { bands: [], unclassifiedCount: 0, settledCount: 0, periodDays: input.days };

      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const settled = await db
        .select({
          recommendedBets: predictions.recommendedBets,
          investAmount: predictions.investAmount,
          returnAmount: predictions.returnAmount,
          isHit: predictions.isHit,
        })
        .from(predictions)
        .where(and(gte(predictions.predictedAt, since), sql`${predictions.isHit} is not null`));

      return {
        ...aggregateTicketPerformance(settled),
        settledCount: settled.length,
        periodDays: input.days,
      };
    }),

  /**
   * 過去2週間の券種別的中率を計算
   * 各予想のrecommendedBetsを解析し、実際のレース結果と照合して的中判定
   */
  getHitRateByBetType: publicProcedure.query(async () => {
    const emptyBetTypeStats = [
      ["trifecta", "3連単"],
      ["trio", "3連複"],
      ["quinella", "馬連"],
      ["wide", "ワイド"],
      ["exacta", "馬単"],
    ].map(([betType, betTypeName]) => ({ betType, betTypeName, total: 0, hits: 0, hitRate: 0, totalReturn: 0, totalInvest: 0, roi: 0 }));
    const db = await getDb();
    if (!db) return { betTypeStats: emptyBetTypeStats, period: "", totalRaces: 0, excludedLegacyCount: 0 };

    // 過去2週間の日付を計算
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const twoWeeksAgoStr = twoWeeksAgo.toISOString().split("T")[0]!;

    const recentPredictions = await db
      .select({ id: predictions.id, raceId: predictions.raceId, predictedAt: predictions.predictedAt, recommendedBets: predictions.recommendedBets })
      .from(predictions)
      .innerJoin(races, eq(races.raceId, predictions.raceId))
      .where(and(gte(predictions.predictedAt, new Date(twoWeeksAgoStr)), eq(races.status, "results_confirmed")));
    const raceIds = Array.from(new Set(recentPredictions.map(prediction => prediction.raceId)));
    if (raceIds.length === 0) return { betTypeStats: emptyBetTypeStats, period: twoWeeksAgoStr, totalRaces: 0, excludedLegacyCount: 0 };

    const racePayouts = await db
      .select({ raceId: payouts.raceId, betType: payouts.betType, combination: payouts.combination, payout: payouts.payout })
      .from(payouts)
      .where(sql`raceId IN (${sql.join(raceIds.map(id => sql`${id}`), sql`,`)})`);
    const report = aggregateBetTypePerformance(
      recentPredictions,
      racePayouts.map(payout => ({ ...payout, betType: payout.betType as "trifecta" | "trio" | "quinella" | "exacta" | "wide" })),
    );

    const betTypeStats = Object.entries(report.stats).map(([type, data]) => ({
      betType: type,
      betTypeName: {
        trifecta: "3連単",
        trio: "3連複",
        quinella: "馬連",
        wide: "ワイド",
        exacta: "馬単",
      }[type] ?? type,
      total: data.total,
      hits: data.hits,
      hitRate: data.total > 0 ? Math.round((data.hits / data.total) * 1000) / 10 : 0,
      totalReturn: data.totalReturn,
      totalInvest: data.totalInvest,
      roi: data.totalInvest > 0 ? Math.round((data.totalReturn / data.totalInvest) * 1000) / 10 : 0,
    }));

    return {
      betTypeStats,
      period: twoWeeksAgoStr,
      totalRaces: report.settledRaces,
      excludedLegacyCount: report.excludedLegacyCount,
    };
  }),
});

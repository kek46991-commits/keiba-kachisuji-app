import { describe, expect, it } from "vitest";
import { aggregatePredictionHistoryPerformance, buildPredictionHistoryTimeline } from "./predictionHistoryPerformance";

describe("prediction history performance", () => {
  it("同一レースは最新の点数記録済み予想だけを実測成績に採用する", () => {
    const report = aggregatePredictionHistoryPerformance([
      { id: 1, raceId: "a", predictedAt: new Date("2026-08-01T00:00:00Z"), recommendedBets: JSON.stringify({ totalBets: 3 }), isHit: true, investAmount: 300, returnAmount: 900 },
      { id: 2, raceId: "a", predictedAt: new Date("2026-08-01T01:00:00Z"), recommendedBets: JSON.stringify({ totalBets: 3 }), isHit: false, investAmount: 300, returnAmount: 0 },
      { id: 3, raceId: "b", predictedAt: new Date("2026-08-02T00:00:00Z"), recommendedBets: JSON.stringify({ totalBets: 6 }), isHit: true, investAmount: 600, returnAmount: 1200 },
    ]);

    expect(report).toMatchObject({ total: 2, hits: 1, misses: 1, hitRate: 50, totalInvest: 900, totalReturn: 1200, profit: 300, roi: 133.3 });
  });

  it("点数未記録の旧形式は除外件数として示し、成績へ混入させない", () => {
    const report = aggregatePredictionHistoryPerformance([
      { id: 1, raceId: "legacy", predictedAt: new Date("2026-08-01T00:00:00Z"), recommendedBets: JSON.stringify({ box: [1, 2, 3] }), isHit: true, investAmount: 300, returnAmount: 900 },
    ]);

    expect(report).toMatchObject({ settledCount: 1, total: 0, excludedLegacyCount: 1, hitRate: null, roi: null });
  });

  it("条件に合う現行形式予想だけから日別の累積収支と回収率を作る", () => {
    const timeline = buildPredictionHistoryTimeline([
      { id: 1, raceId: "a", predictedAt: new Date("2026-08-01T01:00:00Z"), recommendedBets: JSON.stringify({ totalBets: 3 }), isHit: false, investAmount: 300, returnAmount: 0 },
      { id: 2, raceId: "b", predictedAt: new Date("2026-08-02T01:00:00Z"), recommendedBets: JSON.stringify({ totalBets: 3 }), isHit: true, investAmount: 300, returnAmount: 1200 },
      { id: 3, raceId: "legacy", predictedAt: new Date("2026-08-03T01:00:00Z"), recommendedBets: JSON.stringify({ box: [1, 2, 3] }), isHit: true, investAmount: 300, returnAmount: 900 },
    ]);

    expect(timeline.points).toEqual([
      { date: "2026-08-01", cumulativeProfit: -300, cumulativeRoi: 0, cumulativeInvest: 300, cumulativeReturn: 0, raceCount: 1, hitCount: 0, dailyInvest: 300, dailyReturn: 0, dailyProfit: -300, dailyRoi: 0 },
      { date: "2026-08-02", cumulativeProfit: 600, cumulativeRoi: 200, cumulativeInvest: 600, cumulativeReturn: 1200, raceCount: 1, hitCount: 1, dailyInvest: 300, dailyReturn: 1200, dailyProfit: 900, dailyRoi: 400 },
    ]);
    expect(timeline).toMatchObject({ total: 2, excludedLegacyCount: 1 });
  });
});

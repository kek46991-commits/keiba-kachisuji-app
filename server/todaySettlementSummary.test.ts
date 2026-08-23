import { describe, expect, it } from "vitest";
import { summarizeTodaySettlements } from "./todaySettlementSummary";

const auditableBets = JSON.stringify({ totalBets: 1, trifecta: "1着1/2着2/3着3" });

describe("summarizeTodaySettlements", () => {
  it("同一レースの最新かつ実測可能な予想だけを当日成績へ集計する", () => {
    const summary = summarizeTodaySettlements([
      { raceId: "R1", predictedAt: new Date("2026-08-13T01:00:00Z"), recommendedBets: auditableBets, isHit: false, investAmount: 500, returnAmount: 0 },
      { raceId: "R1", predictedAt: new Date("2026-08-13T02:00:00Z"), recommendedBets: auditableBets, isHit: true, investAmount: 300, returnAmount: 1200 },
      { raceId: "R2", predictedAt: new Date("2026-08-13T02:00:00Z"), recommendedBets: auditableBets, isHit: false, investAmount: 200, returnAmount: 0 },
      { raceId: "R3", predictedAt: new Date("2026-08-13T02:00:00Z"), recommendedBets: null, isHit: true, investAmount: 100, returnAmount: 500 },
    ]);

    expect(summary).toEqual({
      settledPredictionCount: 2,
      hitCount: 1,
      investmentAmount: 500,
      returnAmount: 1200,
      profitAmount: 700,
      recoveryRate: 240,
    });
  });
});

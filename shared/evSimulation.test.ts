import { describe, expect, it } from "vitest";
import { calculateSimulationEv, calculateTicketBoundary, calculateTicketRisk, createDemoSimulationEntries, createRecoveryRateCurve } from "./evSimulation";

describe("検証用EVシミュレーション", () => {
  it("固定のテスト値だけを返し、実在レースIDを持たない", () => {
    const entries = createDemoSimulationEntries();
    expect(entries).toHaveLength(4);
    expect(entries.every(entry => entry.label.startsWith("テスト値"))).toBe(true);
    expect(entries.some(entry => "raceId" in entry)).toBe(false);
  });

  it("能力スコアを正規化し、オッズからEVを分離計算する", () => {
    const results = calculateSimulationEv([{ id: "a", label: "A", abilityScore: 80, odds: 2 }, { id: "b", label: "B", abilityScore: 68, odds: 12 }]);
    expect(results[0]!.estimatedWinProbability).toBeGreaterThan(results[1]!.estimatedWinProbability);
    expect(results[0]!.expectedValue).not.toBeNull();
    expect(results[1]!.expectedValue).not.toBeNull();
  });

  it("組合せオッズが投資総額を下回る場合はトリガミリスクと判定する", () => {
    expect(calculateTicketRisk({ combinationOdds: 3, ticketCount: 4, stakePerTicket: 100 })).toMatchObject({ status: "risk", totalStake: 400, minimumExpectedPayout: 300, breakEvenOdds: 4 });
    expect(calculateTicketRisk({ combinationOdds: null, ticketCount: 4, stakePerTicket: 100 }).status).toBe("pending");
  });

  it("トリガミ境界オッズと現在値との差分を探索する", () => {
    expect(calculateTicketBoundary({ combinationOdds: 3.4, ticketCount: 4, stakePerTicket: 100 })).toMatchObject({ status: "below", boundaryOdds: 4, difference: -0.6, additionalOddsNeeded: 0.6 });
    expect(calculateTicketBoundary({ combinationOdds: 4, ticketCount: 4, stakePerTicket: 100 }).status).toBe("at_boundary");
    expect(calculateTicketBoundary({ combinationOdds: 5.2, ticketCount: 4, stakePerTicket: 100 })).toMatchObject({ status: "above", difference: 1.2, additionalOddsNeeded: 0 });
  });

  it("テスト組合せオッズに対する期待回収率系列を生成し、境界で100%になる", () => {
    const curve = createRecoveryRateCurve({ combinationOdds: 3, ticketCount: 4, stakePerTicket: 100 }, 9);
    expect(curve).toHaveLength(9);
    expect(curve.every(point => point.recoveryRate > 0)).toBe(true);
    const closestBoundary = curve.reduce((closest, point) => Math.abs(point.odds - 4) < Math.abs(closest.odds - 4) ? point : closest);
    expect(closestBoundary.recoveryRate).toBe(100);
  });
});

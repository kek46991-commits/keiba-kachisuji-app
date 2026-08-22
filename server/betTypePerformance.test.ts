import { describe, expect, it } from "vitest";
import { aggregateBetTypePerformance } from "./betTypePerformance";

describe("aggregateBetTypePerformance", () => {
  it("実際に保存された3連単フォーメーションと公式払戻を照合して集計する", () => {
    const report = aggregateBetTypePerformance([
      { id: 1, raceId: "race-a", predictedAt: new Date("2026-08-01T00:00:00Z"), recommendedBets: JSON.stringify({ totalBets: 2, trifecta: "厳選本線: 1着1 / 2着2 / 3着3,4（2点）", trio: "対象外", quinella: "対象外", exacta: "対象外", wide: "対象外" }) },
    ], [
      { raceId: "race-a", betType: "trifecta", combination: "1-2-3", payout: 1280 },
    ]);

    expect(report.stats.trifecta).toMatchObject({ total: 1, hits: 1, totalInvest: 200, totalReturn: 1280 });
    expect(report.settledRaces).toBe(1);
  });

  it("点数未記録の旧形式は0%ではなく除外件数として扱う", () => {
    const report = aggregateBetTypePerformance([
      { id: 1, raceId: "legacy", predictedAt: new Date("2026-08-01T00:00:00Z"), recommendedBets: JSON.stringify({ box: [1, 2, 3] }) },
    ], []);
    expect(report).toMatchObject({ settledRaces: 0, excludedLegacyCount: 1 });
    expect(report.stats.trifecta.total).toBe(0);
  });
});

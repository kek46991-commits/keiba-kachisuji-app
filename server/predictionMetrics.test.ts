import { describe, expect, it } from "vitest";
import { applyPredictionMetrics } from "./predictionMetrics";

describe("applyPredictionMetrics", () => {
  it("推定勝率を100%へ正規化し、AIスコアの高い馬を上位にする", () => {
    const result = applyPredictionMetrics([
      { horseNumber: 1, score: 80, odds: 3.0 },
      { horseNumber: 2, score: 60, odds: 10.0 },
      { horseNumber: 3, score: 40, odds: 20.0 },
    ]);

    expect(result[0]!.winProbability).toBeGreaterThan(result[1]!.winProbability);
    expect(result[1]!.winProbability).toBeGreaterThan(result[2]!.winProbability);
    expect(result.reduce((sum, item) => sum + item.winProbability, 0)).toBeCloseTo(100, 1);
  });

  it("単勝オッズがある馬だけに期待値を付与し、オッズ未発表はnullを維持する", () => {
    const result = applyPredictionMetrics([
      { horseNumber: 1, score: 70, odds: 5.0 },
      { horseNumber: 2, score: 70, odds: null },
    ]);

    expect(result[0]!.expectedValue).not.toBeNull();
    expect(result[1]!.expectedValue).toBeNull();
  });
});

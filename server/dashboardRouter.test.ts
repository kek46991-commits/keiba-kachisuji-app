import { describe, expect, it } from "vitest";
import { calculateThreeViewAnalyses } from "./dashboardRouter";

const breakdown = {
  base: 60,
  jockeyBonus: 6,
  oddsScore: 2,
  gateScore: 2,
  trackConditionScore: 1,
  bloodlineScore: 2,
  weightScore: 2,
  ageScore: 3,
  paddockScore: 0,
  intervalScore: 1,
  classScore: 1,
  paceScore: 1,
};

describe("calculateThreeViewAnalyses", () => {
  it("AI・市場・状態の三支点を総合し、総合点の高い順に返す", () => {
    const analyses = calculateThreeViewAnalyses([
      { horseNumber: 2, horseName: "標準馬", jockey: "騎手B", rating: "○", odds: 12, popularity: 5, expectedValue: 5, breakdown },
      { horseNumber: 1, horseName: "上位馬", jockey: "騎手A", rating: "◎", odds: 5, popularity: 2, expectedValue: 25, breakdown: { ...breakdown, base: 75, bloodlineScore: 5 } },
    ]);

    expect(analyses).toHaveLength(2);
    expect(analyses[0]?.horseNumber).toBe(1);
    expect(analyses[0]?.threeView.overall.total).toBeGreaterThan(analyses[1]?.threeView.overall.total ?? 0);
    expect(analyses[0]?.threeView.overall.confidence).toMatch(/[SABCD]/);
  });
});

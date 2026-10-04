import { describe, expect, it } from "vitest";
import { buildAnaBettingRecommendationForRace, generateAnaBettingRecommendation } from "./anaUmaRouter";

const candidate = (horseNumber: number) => ({
  horseNumber,
  horseName: `穴馬${horseNumber}`,
  jockey: null,
  odds: 10 + horseNumber,
  popularity: horseNumber,
  category: "中穴" as const,
  explosionRate: 25,
  anaScore: 90 - horseNumber,
  scoreBreakdown: { courseAffinity: 0, trackConditionBoost: 0, oddsValue: 0, bloodlineBoost: 0, jockeyChange: 0, weightTrend: 0, ageBonus: 0, gateAdvantage: 0 },
  reasons: [],
});

describe("generateAnaBettingRecommendation", () => {
  it("穴馬を1着軸にし、上位スコア馬を2・3着候補から外さない", () => {
    const bets = generateAnaBettingRecommendation(
      [candidate(3), candidate(5), candidate(7), candidate(9), candidate(10)],
      [
        { horseNumber: 1, odds: 2.0 },
        { horseNumber: 2, odds: 4.0 },
        { horseNumber: 3, odds: 13.0 },
        { horseNumber: 5, odds: 15.0 },
        { horseNumber: 7, odds: 17.0 },
        { horseNumber: 9, odds: 19.0 },
        { horseNumber: 10, odds: 20.0 },
      ],
      [1, 2, 4, 6, 8],
    );

    expect(bets.trifecta).toContain("1着3");
    expect(bets.trifecta).toContain("2着1,2,4,5");
    for (const horseNumber of [1, 2, 4]) expect(bets.trifecta).toContain(String(horseNumber));
    expect(bets.trio).not.toContain("保険");
    expect(bets.trio).not.toContain("BOX");
    expect(bets).toMatchObject({ trifectaCount: 16, trioCount: 3, totalBets: 19 });
    expect(bets.riskWarning).toContain("組合せオッズが未取得");
  });

  it("スコア順位がない場合は人気順で穴馬買い目を補完しない", () => {
    const bets = generateAnaBettingRecommendation([candidate(3)], [{ horseNumber: 1, odds: 2.0 }, { horseNumber: 3, odds: 13.0 }]);
    expect(bets.totalBets).toBe(0);
    expect(bets.formationCaution).toContain("スコア順位データ");
  });

  it("根拠が不足する穴馬は見送りにする", () => {
    const weak = { ...candidate(3), anaScore: 20, explosionRate: 10 };
    const bets = generateAnaBettingRecommendation([weak], [{ horseNumber: 1, odds: 2.0 }, { horseNumber: 3, odds: 13.0 }]);
    expect(bets.totalBets).toBe(0);
    expect(bets.trifecta).toBe("見送り");
  });

  it("予想オッズを用いても穴馬軸買い目を生成し、公式市場値と区別する", () => {
    const bets = buildAnaBettingRecommendationForRace({
      entries: [
        { horseNumber: 1, horseName: "能力上位1", jockey: null, odds: 4.8, popularity: null, age: 4, gateNumber: 1 },
        { horseNumber: 2, horseName: "能力上位2", jockey: null, odds: 5.6, popularity: null, age: 4, gateNumber: 2 },
        { horseNumber: 3, horseName: "穴候補3", jockey: null, odds: 7.2, popularity: null, age: 4, gateNumber: 3 },
        { horseNumber: 4, horseName: "穴候補4", jockey: null, odds: 9.8, popularity: null, age: 5, gateNumber: 4 },
        { horseNumber: 5, horseName: "穴候補5", jockey: null, odds: 14.2, popularity: null, age: 3, gateNumber: 5 },
      ],
      venue: "園田",
      surface: "dirt",
      distance: 1400,
      trackCondition: "good",
      scoreRankedHorseNumbers: [1, 2, 3, 4, 5],
      oddsMode: "predicted",
    });

    expect(bets.totalBets).toBeGreaterThan(0);
    expect(bets.trifecta).toContain("穴軸");
    expect(bets.riskWarning).toContain("予想オッズ");
    expect(bets.reasoning.join("\n")).toContain("公式オッズ未取得");
  });
});

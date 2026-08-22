import { describe, expect, it } from "vitest";
import { generateBettingRecommendation } from "./predictionRouter";

const syntheticEntrants = [
  [1, "馬A", 6.7, 10.6],
  [2, "馬B", 77.5, 6.6],
  [3, "馬C", 74.2, 3.0],
  [4, "馬D", 81.7, 2.6],
  [5, "馬E", 93.3, 4.2],
  [6, "馬F", 13.5, 14.6],
].map(([horseNumber, horseName, score, odds]) => ({
  horseNumber,
  horseName,
  jockey: "テスト騎手",
  odds,
  score,
  winProbability: 0,
  expectedValue: null,
  breakdown: {},
  rating: "",
}));

describe("synthetic prediction pipeline", () => {
  it("非実在の馬名を置換せずにスコア順・穴馬軸の券種別出力を生成する", () => {
    const namesBeforeGeneration = syntheticEntrants.map((entrant) => entrant.horseName);
    const bets = generateBettingRecommendation(syntheticEntrants as any, { oddsMode: "predicted" });

    expect(syntheticEntrants.map((entrant) => entrant.horseName)).toEqual(namesBeforeGeneration);
    expect(namesBeforeGeneration).toEqual(["馬A", "馬B", "馬C", "馬D", "馬E", "馬F"]);
    expect(bets.trifectaCount).toBeGreaterThan(0);
    expect(bets.trioCount).toBeGreaterThan(0);
    expect(bets.quinellaCount).toBe(3);
    expect(bets.wideCount).toBe(3);
    expect(bets.quinella).toBe("4-5,2-5,3-5");
    expect(bets.wide).toContain("ワイド3点");
    expect(bets.reasoning.join(" ")).toContain("公式オッズ未取得");
  });
});

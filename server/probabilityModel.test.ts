import { describe, expect, it } from "vitest";
import { blendAbilityWithMarket } from "./probabilityModel";

describe("blendAbilityWithMarket", () => {
  it("公式オッズが2頭未満のレースでは能力スコアをそのまま使う", () => {
    const blended = blendAbilityWithMarket([
      { horseNumber: 1, abilityScore: 70, odds: 2.4 },
      { horseNumber: 2, abilityScore: 60, odds: null },
      { horseNumber: 3, abilityScore: 55, odds: null },
    ]);

    expect(blended.map(item => item.score)).toEqual([70, 60, 55]);
    expect(blended.every(item => item.marketSignalScore === 0)).toBe(true);
    expect(blended.every(item => item.marketProbability === null)).toBe(true);
  });

  it("市場の支持が厚い馬を押し上げ、能力スコアだけの順位を上書きする", () => {
    const blended = blendAbilityWithMarket([
      { horseNumber: 1, abilityScore: 62, odds: 18.0 },
      { horseNumber: 2, abilityScore: 58, odds: 1.8 },
      { horseNumber: 3, abilityScore: 55, odds: 9.0 },
    ]);

    const ranked = [...blended].sort((left, right) => right.score - left.score);
    expect(ranked[0]!.horseNumber).toBe(2);
    expect(blended[1]!.marketSignalScore).toBeGreaterThan(0);
    expect(blended[0]!.marketSignalScore).toBeLessThan(0);
  });

  it("オッズ未取得の馬は能力スコア由来の確率で補完し、市場側で不当に沈めない", () => {
    const blended = blendAbilityWithMarket([
      { horseNumber: 1, abilityScore: 70, odds: 3.0 },
      { horseNumber: 2, abilityScore: 69, odds: 3.2 },
      { horseNumber: 3, abilityScore: 68, odds: null },
    ]);

    expect(blended[2]!.marketProbability).toBeNull();
    expect(blended[2]!.score).toBeGreaterThan(blended[0]!.score - 10);
  });

  it("混合スコアの平均は能力スコアの平均と一致し、買い目側のスコア尺度を壊さない", () => {
    const inputs = [
      { horseNumber: 1, abilityScore: 72, odds: 2.1 },
      { horseNumber: 2, abilityScore: 64, odds: 5.4 },
      { horseNumber: 3, abilityScore: 59, odds: 12.0 },
      { horseNumber: 4, abilityScore: 51, odds: 30.0 },
    ];
    const blended = blendAbilityWithMarket(inputs);

    const abilityMean = inputs.reduce((sum, input) => sum + input.abilityScore, 0) / inputs.length;
    const blendedMean = blended.reduce((sum, item) => sum + item.score, 0) / blended.length;
    expect(blendedMean).toBeCloseTo(abilityMean, 1);
  });
});

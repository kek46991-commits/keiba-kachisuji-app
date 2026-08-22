import { describe, expect, it } from "vitest";
import { generateNarBettingRecommendation } from "./narPredictionRouter";

const result = (horseNumber: number, odds: number, expectedValue: number | null = 0) => ({
  horseNumber,
  horseName: `馬${horseNumber}`,
  jockey: "騎手",
  totalScore: 100 - horseNumber,
  odds,
  expectedValue,
  breakdown: { jockeyBonus: 0 },
}) as any;

describe("generateNarBettingRecommendation", () => {
  it("能力差が小さい候補3頭では1着候補を分散し、保険BOXを出さない", () => {
    const bets = generateNarBettingRecommendation([result(1, 3, 20), result(2, 5, 10), result(3, 8, 5), result(4, 12, -2), result(5, 20, -9)]);
    expect(bets.trifectaCount).toBe(4);
    expect(bets.trifecta).toContain("1着1,2");
    expect(bets.trio).not.toContain("BOX");
    expect(bets.totalBets).toBe(5);
    expect(bets.formationCaution).toContain("1着候補を1・2へ分散");
  });

  it("期待値プラス候補が3頭未満なら、購入推奨なしの参考フォーメーションを返す", () => {
    const bets = generateNarBettingRecommendation([result(1, 12, 20), result(2, 15, 5), result(3, 18, -3), result(4, 25, -5), result(5, 30, null)]);
    expect(bets.referenceOnly).toBe(true);
    expect(bets.totalBets).toBe(16);
    expect(bets.trifecta).toContain("参考フォーメーション");
    expect(bets.referenceNotice).toContain("購入推奨なし");
  });

  it("予想オッズモードでは公式EVが未算出でもスコア順の通常買い目を生成する", () => {
    const bets = generateNarBettingRecommendation(
      [result(1, 0, null), result(2, 0, null), result(3, 0, null), result(4, 0, null), result(5, 0, null)],
      { oddsMode: "predicted" },
    );

    expect(bets.referenceOnly).toBeUndefined();
    expect(bets).toMatchObject({ trifectaCount: 12, trioCount: 4, totalBets: 16 });
    expect(bets.reasoning.join(" ")).toContain("公式オッズ未取得");
  });

  it("能力差が小さい候補5頭なら分散した3連単12点と3連複4点を作る", () => {
    const bets = generateNarBettingRecommendation([result(1, 3, 30), result(2, 5, 24), result(3, 8, 18), result(4, 12, 12), result(5, 20, 6)]);
    expect(bets).toMatchObject({ trifectaCount: 12, trioCount: 4, totalBets: 16 });
    expect(bets.riskWarning).toContain("組合せオッズが未取得");
  });
});

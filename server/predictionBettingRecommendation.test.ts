import { describe, expect, it } from "vitest";
import { generateBettingRecommendation, generatePartialBettingRecommendation } from "./predictionRouter";

const row = (horseNumber: number, expectedValue: number | null, odds = 5) => ({
  horseNumber,
  horseName: `馬${horseNumber}`,
  jockey: null,
  odds,
  score: 100 - horseNumber,
  winProbability: 20,
  expectedValue,
  breakdown: {},
  rating: "",
}) as any;

describe("generateBettingRecommendation", () => {
  it("保存済み出走馬が1頭だけでもスコア順・穴馬軸の基礎情報を保ち、不可能な券種を対象外にする", () => {
    const bets = generatePartialBettingRecommendation([row(1, null)]);
    expect(bets.trifecta).toContain("対象外");
    expect(bets.trio).toContain("対象外");
    expect(bets.quinella).toContain("—");
    expect(bets.wide).toContain("対象外");
    expect(bets.reasoning.join(" ")).toContain("穴馬軸");
  });

  it("保存済み出走馬が2頭だけなら実在馬だけで暫定評価し、不可能な3連系を出さない", () => {
    const bets = generatePartialBettingRecommendation([row(1, null), row(2, null)]);
    expect(bets.trifecta).toContain("対象外");
    expect(bets.trio).toContain("対象外");
    expect(bets.quinella).toBe("1-2");
    expect(bets.wide).toBe("1-2（ワイド1点）");
    expect(bets.totalBets).toBe(bets.quinellaCount + bets.wideCount);
    expect(bets.referenceOnly).toBe(false);
  });

  it("能力差が小さい候補3頭では1着候補を分散し、低根拠の馬を足さない", () => {
    const bets = generateBettingRecommendation([row(1, 22, 3), row(2, 11), row(3, 4), row(4, -8), row(5, null)]);
    expect(bets.trifectaCount).toBe(4);
    expect(bets.totalBets).toBe(9);
    expect(bets.trifecta).toContain("1着1,2");
    expect(bets.formationCaution).toContain("1着候補を1・2へ分散");
  });

  it("期待値プラス候補が3頭に届かない場合は、購入推奨なしの参考フォーメーションを返す", () => {
    const bets = generateBettingRecommendation([row(1, 20), row(2, 4), row(3, -2), row(4, null)]);
    expect(bets.referenceOnly).toBe(true);
    expect(bets.totalBets).toBe(12);
    expect(bets.trifecta).toContain("参考フォーメーション");
    expect(bets.referenceNotice).toContain("購入推奨なし");
  });

  it("予想オッズモードでは公式EVが未算出でもスコア順の通常買い目を生成する", () => {
    const bets = generateBettingRecommendation(
      [row(1, null), row(2, null), row(3, null), row(4, null), row(5, null)],
      { oddsMode: "predicted" },
    );

    expect(bets.referenceOnly).toBeUndefined();
    expect(bets).toMatchObject({ trifectaCount: 12, trioCount: 4, quinellaCount: 4, wideCount: 4, totalBets: 24 });
    expect(bets.quinella).not.toBe("対象外");
    expect(bets.wide).toContain("ワイド4点");
    expect(bets.reasoning.join(" ")).toContain("公式オッズ未取得");
  });

  it("予想オッズモードは一部の補助項目が欠損してもスコア順の通常買い目を維持する", () => {
    const noIndependentEvidence = (horseNumber: number) => ({
      ...row(horseNumber, null),
      breakdown: { jockeyBonus: 0, gateScore: 0, bloodlineScore: 0, weightScore: 0, ageScore: 4 },
    });

    const bets = generateBettingRecommendation(
      [noIndependentEvidence(1), noIndependentEvidence(2), noIndependentEvidence(3), noIndependentEvidence(4), noIndependentEvidence(5)],
      { oddsMode: "predicted" },
    );

    expect(bets.referenceOnly).toBeUndefined();
    expect(bets.trifecta).toContain("スコア順本線");
    expect(bets.trifectaCount).toBeGreaterThan(0);
  });

  it("記録済みのスコア内訳で補助根拠が不足する候補は参考フォーメーションとして表示する", () => {
    const noSupport = (horseNumber: number) => ({
      ...row(horseNumber, 12),
      breakdown: { jockeyBonus: 0, gateScore: 0, bloodlineScore: 0, weightScore: 0, ageScore: 0 },
    });
    const bets = generateBettingRecommendation([noSupport(1), noSupport(2), noSupport(3)]);

    expect(bets.referenceOnly).toBe(true);
    expect(bets.totalBets).toBe(5);
    expect(bets.reasoning.join(" ")).toContain("補助根拠");
  });

  it("補助根拠を確認できる候補が3頭でも重複なしのフォーメーションを維持する", () => {
    const supported = (horseNumber: number, expectedValue: number) => ({
      ...row(horseNumber, expectedValue),
      breakdown: { jockeyBonus: 3, gateScore: 0, bloodlineScore: 0, weightScore: 0, ageScore: 0 },
    });
    const bets = generateBettingRecommendation([supported(1, 20), supported(2, 12), supported(3, 4)]);

    expect(bets.totalBets).toBe(9);
    expect(bets.trifecta).toContain("スコア順本線");
  });

  it("能力差が小さい候補5頭なら分散した3連単12点と3連複4点を作る", () => {
    const bets = generateBettingRecommendation([row(1, 30), row(2, 24), row(3, 18), row(4, 12), row(5, 6)]);
    expect(bets).toMatchObject({ trifectaCount: 12, trioCount: 4, quinellaCount: 4, wideCount: 4, totalBets: 24 });
    expect(bets.trifecta).toContain("1着1,2");
    expect(bets.riskWarning).toContain("組合せオッズが未取得");
  });
});

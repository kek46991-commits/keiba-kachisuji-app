import { describe, expect, it } from "vitest";
import { buildFormationBranches, formatAxisSelection, formatBetSelectionForDisplay } from "../shared/formationDisplay";

describe("formationDisplay", () => {
  it("1着候補ごとに、その馬を2着・3着候補から除外して分岐する", () => {
    const branches = buildFormationBranches({ first: [8, 5], second: [8, 5, 7], third: [8, 5, 7, 3] });
    expect(branches).toEqual([
      { first: 8, second: [5, 7], third: [5, 7, 3], count: 4 },
      { first: 5, second: [8, 7], third: [8, 7, 3], count: 4 },
    ]);
  });

  it("1着1頭のフォーメーション表記から重複を除く", () => {
    expect(formatBetSelectionForDisplay("穴軸: 1着6 / 2着5,3,4 / 3着6,5,3,4（9点）")).toBe("穴軸: 1着6 → 2着5,3,4 → 3着5,3,4（6点）");
  });

  it("1着複数のフォーメーションは1着ごとの分岐表記へ整形する", () => {
    expect(formatBetSelectionForDisplay("スコア順本線: 1着8,5 / 2着8,5,7 / 3着8,5,7,3")).toBe(
      "スコア順本線: 1着8 → 2着5,7 → 3着5,7,3（4点） ／ 1着5 → 2着8,7 → 3着8,7,3（4点）",
    );
  });

  it("軸-相手の表記から軸の重複を除く", () => {
    expect(formatAxisSelection(6, [6, 5, 3, 5])).toBe("6 - 5,3");
    expect(formatBetSelectionForDisplay("穴軸カバー: 6 - 6,5,3（3点）")).toBe("穴軸カバー: 6 - 5,3（3点）");
  });

  it("解析できない文字列と空値は元の表示を保つ", () => {
    expect(formatBetSelectionForDisplay("見送り")).toBe("見送り");
    expect(formatBetSelectionForDisplay("対象外")).toBe("対象外");
    expect(formatBetSelectionForDisplay(null)).toBe("");
  });
});

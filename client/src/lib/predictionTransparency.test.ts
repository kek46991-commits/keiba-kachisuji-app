import { describe, expect, it } from "vitest";
import { getExpectedValueStatus } from "./predictionTransparency";

describe("getExpectedValueStatus", () => {
  it("正・負のEVを区別する", () => {
    expect(getExpectedValueStatus({ odds: 4.2, winProbability: 30, expectedValue: 26 })).toEqual({ status: "positive" });
    expect(getExpectedValueStatus({ odds: 2.1, winProbability: 30, expectedValue: -37 })).toEqual({ status: "negative" });
  });

  it("欠損値をマイナスEVとして扱わず理由を返す", () => {
    expect(getExpectedValueStatus({ odds: null, winProbability: 30, expectedValue: null })).toEqual({ status: "unavailable", reason: "公式単勝オッズが未取得または不正です。" });
    expect(getExpectedValueStatus({ odds: 3, winProbability: null, expectedValue: null })).toEqual({ status: "unavailable", reason: "推定勝率が未算出です。" });
  });
});

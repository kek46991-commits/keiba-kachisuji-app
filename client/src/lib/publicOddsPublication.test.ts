import { describe, expect, it } from "vitest";
import { maskUnlicensedPublicOdds, publicOddsPublicationState } from "./publicOddsPublication";

describe("publicOddsPublication", () => {
  it("公式連携前は予想オッズを残し、EVだけを伏せて能力スコアを保持する", () => {
    const result = maskUnlicensedPublicOdds([
      { horseNumber: 1, score: 82, odds: 3.4, expectedValue: 12.6 },
      { horseNumber: 2, score: 76, odds: 8.1, expectedValue: -8.2 },
    ]);

    expect(publicOddsPublicationState).toBe("predicted_until_official_contract");
    expect(result).toEqual([
      { horseNumber: 1, score: 82, odds: 3.4, expectedValue: null },
      { horseNumber: 2, score: 76, odds: 8.1, expectedValue: null },
    ]);
  });
});

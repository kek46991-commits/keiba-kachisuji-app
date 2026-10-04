import { describe, expect, it } from "vitest";
import { derivePredictedOdds } from "./predictedOdds";

describe("derivePredictedOdds", () => {
  it("推定勝率の逆数を小数1桁の予想オッズとして返す", () => {
    expect(derivePredictedOdds(25)).toBe(4);
    expect(derivePredictedOdds(33.3)).toBe(3);
  });

  it("未算出または不正な勝率では予想オッズを作らない", () => {
    expect(derivePredictedOdds(null)).toBeNull();
    expect(derivePredictedOdds(0)).toBeNull();
  });
});

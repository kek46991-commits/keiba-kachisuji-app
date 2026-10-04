import { describe, expect, it } from "vitest";
import { predictionHistoryFilterInputSchema } from "./predictionHistoryFilters";

describe("prediction history filter input", () => {
  it("会場・距離・馬場状態を同時に指定できる", () => {
    const parsed = predictionHistoryFilterInputSchema.parse({
      venue: "東京",
      distance: 1600,
      trackCondition: "good",
    });

    expect(parsed).toMatchObject({ venue: "東京", distance: 1600, trackCondition: "good" });
    expect(parsed.limit).toBe(50);
  });

  it("条件値と未登録指定の矛盾を拒否する", () => {
    expect(() => predictionHistoryFilterInputSchema.parse({ venue: "東京", venueMissing: true })).toThrow();
    expect(() => predictionHistoryFilterInputSchema.parse({ distance: 1200, distanceMissing: true })).toThrow();
    expect(() => predictionHistoryFilterInputSchema.parse({ trackCondition: "heavy", trackConditionMissing: true })).toThrow();
  });
});

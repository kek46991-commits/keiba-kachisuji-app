import { describe, expect, it } from "vitest";
import { getMinutesUntilJstStart, selectComparisonHorseNumbers, selectHeroAlert } from "./heroAlertLogic";

describe("hero alert prioritisation", () => {
  it("市場急変を重要レースより優先する", () => {
    const result = selectHeroAlert([
      { kind: "important_race", urgency: "medium", title: "G3", detail: "", href: "/predictions", score: 40 },
      { kind: "odds", urgency: "high", title: "急変", detail: "", href: "/nar-predictions", score: 100 },
    ]);
    expect(result?.kind).toBe("odds");
  });

  it("不正な日時は開始時刻を算出しない", () => {
    expect(getMinutesUntilJstStart("invalid", "12:00")).toBeNull();
    expect(getMinutesUntilJstStart("2026-08-12", null)).toBeNull();
  });

  it("比較対象では急変対象を優先し、オッズ未取得の馬を除外する", () => {
    const horses = selectComparisonHorseNumbers([
      { horseNumber: 1, winOdds: 2.8 },
      { horseNumber: 2, winOdds: null },
      { horseNumber: 3, winOdds: 6.4 },
      { horseNumber: 4, winOdds: 11.2 },
      { horseNumber: 5, winOdds: 18.0 },
    ], 4, 3);

    expect(horses).toEqual([4, 1, 3]);
  });
});

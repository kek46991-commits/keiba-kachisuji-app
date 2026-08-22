import { describe, expect, it } from "vitest";
import {
  calculateCompatibilityBonus,
  calculateJockeyStatsBonus,
  calculateOddsMovementSignal,
  getDistanceRange,
} from "./oddsEngine";

describe("oddsEngine", () => {
  it("距離を正しい距離帯へ分類する", () => {
    expect(getDistanceRange(820)).toBe("sprint");
    expect(getDistanceRange(1600)).toBe("mile");
    expect(getDistanceRange(2000)).toBe("middle");
  });

  it("十分なコース成績がある騎手にのみボーナスを与える", () => {
    expect(calculateJockeyStatsBonus({ totalRides: 8, winRate: 30, placeRate: 45, showRate: 60 })).toBe(0);
    expect(calculateJockeyStatsBonus({ totalRides: 100, winRate: 25, placeRate: 40, showRate: 55 })).toBeGreaterThan(0);
  });

  it("馬と騎手のコンビ実績をボーナスへ反映する", () => {
    expect(calculateCompatibilityBonus({ comboRides: 1, comboWins: 1, comboPlaces: 1, styleMatchScore: "0.8" })).toBe(0);
    expect(calculateCompatibilityBonus({ comboRides: 5, comboWins: 2, comboPlaces: 4, styleMatchScore: "0.8" })).toBeGreaterThan(0);
  });

  it("単勝オッズ20%以上の急落を市場変動シグナルとして検知する", () => {
    expect(calculateOddsMovementSignal(10, 9)).toBeNull();
    expect(calculateOddsMovementSignal(10, 7.5)).toMatchObject({ changePct: -25, bonusScore: 4, alertType: "abnormal" });
    expect(calculateOddsMovementSignal(10, 5.5)).toMatchObject({ changePct: -45, bonusScore: 8, alertType: "large_bet" });
  });
});

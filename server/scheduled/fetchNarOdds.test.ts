import { describe, expect, it } from "vitest";
import { getOddsCollectionCadence } from "./fetchNarOdds";

describe("getOddsCollectionCadence", () => {
  it("発走10分前からは毎分オッズ取得対象にする", () => {
    const now = new Date("2026-08-12T03:51:00.000Z"); // JST 12:51
    expect(getOddsCollectionCadence("2026-08-12", "13:00", now)).toMatchObject({
      due: true,
      minutesToStart: 9,
      mode: "critical_1min",
    });
  });

  it("通常帯では偶数分のみ取得し2分間隔へ制御する", () => {
    const dueNow = new Date("2026-08-12T03:30:00.000Z"); // JST 12:30 (偶数分)
    const skipNow = new Date("2026-08-12T03:31:00.000Z"); // JST 12:31 (奇数分)
    expect(getOddsCollectionCadence("2026-08-12", "12:50", dueNow)).toMatchObject({ due: true, mode: "normal_2min" });
    expect(getOddsCollectionCadence("2026-08-12", "12:50", skipNow)).toMatchObject({ due: false, mode: "normal_2min" });
  });

  it("発走済み・60分より前のレースは対象外にする", () => {
    const now = new Date("2026-08-12T03:00:00.000Z"); // JST 12:00
    expect(getOddsCollectionCadence("2026-08-12", "11:59", now)).toMatchObject({ due: false, mode: "outside_window" });
    expect(getOddsCollectionCadence("2026-08-12", "13:30", now)).toMatchObject({ due: false, mode: "outside_window" });
  });
});

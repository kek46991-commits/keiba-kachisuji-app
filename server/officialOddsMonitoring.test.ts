import { describe, expect, it } from "vitest";
import { getMinutesToRaceStart } from "./scheduled/fetchNarOdds";

describe("公式オッズ取込の発走時刻計算", () => {
  it("JSTの発走時刻から取込時点の残り分数を計算する", () => {
    const now = new Date("2026-08-13T03:52:00.000Z"); // JST 12:52
    expect(getMinutesToRaceStart("2026-08-13", "13:00", now)).toBe(8);
  });

  it("発走時刻が未登録の場合は残り分数を返さない", () => {
    expect(getMinutesToRaceStart("2026-08-13", null, new Date())).toBeNull();
  });
});

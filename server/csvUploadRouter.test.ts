import { describe, expect, it } from "vitest";
import { buildOfficialRaceId } from "./csvUploadRouter";

describe("buildOfficialRaceId", () => {
  it("JRA・NARの公式CSVで同じ形式の内部レースIDを生成する", () => {
    expect(buildOfficialRaceId("東京", "2026/08/12", 5)).toBe("20260812S505");
    expect(buildOfficialRaceId("園田", "2026-08-12", 10)).toBe("202608121210");
  });

  it("不正な開催日・レース番号を受け付けない", () => {
    expect(() => buildOfficialRaceId("東京", "2026.08.12", 5)).toThrow("開催日");
    expect(() => buildOfficialRaceId("園田", "2026-08-12", 13)).toThrow("レース番号");
  });
});

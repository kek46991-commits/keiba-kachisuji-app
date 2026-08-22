import { describe, expect, it } from "vitest";
import { buildMonthlyResultImportTrend, buildUnimportedRaceRanking } from "./resultImportTrend";

describe("buildMonthlyResultImportTrend", () => {
  it("主催者別の公式結果確定・未取込レースを月単位で集計する", () => {
    const trend = buildMonthlyResultImportTrend([
      { raceDate: "2026-07-20", organizer: "JRA", status: "results_confirmed" },
      { raceDate: "2026-07-21", organizer: "NAR", status: "upcoming" },
      { raceDate: "2026-07-22", organizer: "NAR", status: "entries_confirmed" },
      { raceDate: "2026-08-01", organizer: "JRA", status: "upcoming" },
      { raceDate: "2026-08-02", organizer: "NAR", status: "results_confirmed" },
    ]);

    expect(trend).toEqual([
      { month: "2026-07", imported: 1, unimported: 2, jraImported: 1, jraUnimported: 0, narImported: 0, narUnimported: 2 },
      { month: "2026-08", imported: 1, unimported: 1, jraImported: 0, jraUnimported: 1, narImported: 1, narUnimported: 0 },
    ]);
  });

  it("日付形式が不正な行を月次推移に含めない", () => {
    const trend = buildMonthlyResultImportTrend([
      { raceDate: "", organizer: "JRA", status: "results_confirmed" },
      { raceDate: "20260803", organizer: "NAR", status: "upcoming" },
    ]);

    expect(trend).toEqual([]);
  });

  it("未取込レースを主催者別・会場別に件数と最古日付きで順位付けする", () => {
    const ranking = buildUnimportedRaceRanking([
      { organizer: "NAR", venueName: "盛岡", raceDate: "2026-08-04" },
      { organizer: "NAR", venueName: "盛岡", raceDate: "2026-08-05" },
      { organizer: "NAR", venueName: "園田", raceDate: "2026-08-03" },
      { organizer: "JRA", venueName: "中京", raceDate: "2026-08-01" },
    ]);

    expect(ranking.organizerRanking).toEqual([
      { organizer: "NAR", raceCount: 3, oldestRaceDate: "2026-08-03" },
      { organizer: "JRA", raceCount: 1, oldestRaceDate: "2026-08-01" },
    ]);
    expect(ranking.venueRanking).toEqual([
      { organizer: "NAR", venueName: "盛岡", raceCount: 2, oldestRaceDate: "2026-08-04", latestRaceDate: "2026-08-05" },
      { organizer: "JRA", venueName: "中京", raceCount: 1, oldestRaceDate: "2026-08-01", latestRaceDate: "2026-08-01" },
      { organizer: "NAR", venueName: "園田", raceCount: 1, oldestRaceDate: "2026-08-03", latestRaceDate: "2026-08-03" },
    ]);
  });
});

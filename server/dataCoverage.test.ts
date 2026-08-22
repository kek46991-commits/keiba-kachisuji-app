import { describe, expect, it } from "vitest";
import { buildOrganizerDataCoverage, buildVenueDataCoverage } from "./dataCoverage";

const rows = [
  { organizer: "JRA" as const, venueName: "東京", totalRaces: 10, entryRaceCount: 10, winOddsRaceCount: 0, combinationOddsRaceCount: 0, resultsConfirmedCount: 10 },
  { organizer: "NAR" as const, venueName: "園田", totalRaces: 10, entryRaceCount: 8, winOddsRaceCount: 4, combinationOddsRaceCount: 0, resultsConfirmedCount: 0 },
  { organizer: "NAR" as const, venueName: "大井", totalRaces: 10, entryRaceCount: 10, winOddsRaceCount: 8, combinationOddsRaceCount: 0, resultsConfirmedCount: 0 },
];

describe("data coverage", () => {
  it("会場を4指標平均の不足度順へ並べ、未充足指標を明示する", () => {
    const venueRows = buildVenueDataCoverage(rows);
    expect(venueRows.map(row => row.venueName)).toEqual(["園田", "大井", "東京"]);
    expect(venueRows[0].missingLabels).toEqual(["出馬表", "単勝", "組合せ", "結果"]);
    expect(venueRows[0].averageRate).toBe(30);
  });

  it("主催者ごとに分母を合算して充足率を計算する", () => {
    const organizers = buildOrganizerDataCoverage(rows);
    const nar = organizers.find(row => row.organizer === "NAR");
    expect(nar?.entryRate).toBe(90);
    expect(nar?.winOddsRate).toBe(60);
    expect(nar?.resultRate).toBe(0);
  });

  it("同じ主催者・会場のレース行をひとつの会場へ合算する", () => {
    const venueRows = buildVenueDataCoverage([...rows, { organizer: "JRA", venueName: "東京", totalRaces: 10, entryRaceCount: 10, winOddsRaceCount: 0, combinationOddsRaceCount: 0, resultsConfirmedCount: 0 }]);
    const tokyo = venueRows.find(row => row.venueName === "東京");
    expect(venueRows.filter(row => row.venueName === "東京")).toHaveLength(1);
    expect(tokyo?.totalRaces).toBe(20);
    expect(tokyo?.resultRate).toBe(50);
  });
});

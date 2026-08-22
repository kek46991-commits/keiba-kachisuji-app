export type DataCoverageSourceRow = {
  organizer: "JRA" | "NAR";
  venueName: string;
  totalRaces: number;
  entryRaceCount: number;
  winOddsRaceCount: number;
  combinationOddsRaceCount: number;
  resultsConfirmedCount: number;
};

export type DataCoverage = {
  organizer: "JRA" | "NAR";
  venueName?: string;
  totalRaces: number;
  entryRate: number;
  winOddsRate: number;
  combinationOddsRate: number;
  resultRate: number;
  averageRate: number;
  missingLabels: string[];
};

const metrics = [
  ["出馬表", "entryRaceCount", "entryRate"],
  ["単勝", "winOddsRaceCount", "winOddsRate"],
  ["組合せ", "combinationOddsRaceCount", "combinationOddsRate"],
  ["結果", "resultsConfirmedCount", "resultRate"],
] as const;

function percentage(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function asCoverage(source: DataCoverageSourceRow, venueName?: string): DataCoverage {
  const entryRate = percentage(source.entryRaceCount, source.totalRaces);
  const winOddsRate = percentage(source.winOddsRaceCount, source.totalRaces);
  const combinationOddsRate = percentage(source.combinationOddsRaceCount, source.totalRaces);
  const resultRate = percentage(source.resultsConfirmedCount, source.totalRaces);
  const rates = { entryRate, winOddsRate, combinationOddsRate, resultRate };
  const missingLabels = metrics.filter(([, , rateKey]) => rates[rateKey] < 100).map(([label]) => label);
  const averageRate = Math.round(((entryRate + winOddsRate + combinationOddsRate + resultRate) / 4) * 10) / 10;

  return { organizer: source.organizer, venueName, totalRaces: source.totalRaces, entryRate, winOddsRate, combinationOddsRate, resultRate, averageRate, missingLabels };
}

/** 会場ごとの4指標（出馬表・単勝・組合せ・結果）の充足率を不足度順へ整形する。 */
export function buildVenueDataCoverage(rows: DataCoverageSourceRow[]): DataCoverage[] {
  const grouped = new Map<string, DataCoverageSourceRow>();
  for (const row of rows) {
    if (row.totalRaces <= 0 || !row.venueName) continue;
    const key = `${row.organizer}:${row.venueName}`;
    const current = grouped.get(key) ?? { organizer: row.organizer, venueName: row.venueName, totalRaces: 0, entryRaceCount: 0, winOddsRaceCount: 0, combinationOddsRaceCount: 0, resultsConfirmedCount: 0 };
    current.totalRaces += row.totalRaces;
    current.entryRaceCount += row.entryRaceCount;
    current.winOddsRaceCount += row.winOddsRaceCount;
    current.combinationOddsRaceCount += row.combinationOddsRaceCount;
    current.resultsConfirmedCount += row.resultsConfirmedCount;
    grouped.set(key, current);
  }
  return Array.from(grouped.values())
    .map(row => asCoverage(row, row.venueName))
    .sort((left, right) => left.averageRate - right.averageRate || right.totalRaces - left.totalRaces || (left.venueName ?? "").localeCompare(right.venueName ?? ""));
}

/** 会場行を主催者単位へ合算し、データ不足の比較に使う。 */
export function buildOrganizerDataCoverage(rows: DataCoverageSourceRow[]): DataCoverage[] {
  const grouped = new Map<"JRA" | "NAR", DataCoverageSourceRow>();
  for (const row of rows) {
    const current = grouped.get(row.organizer) ?? { organizer: row.organizer, venueName: "", totalRaces: 0, entryRaceCount: 0, winOddsRaceCount: 0, combinationOddsRaceCount: 0, resultsConfirmedCount: 0 };
    current.totalRaces += row.totalRaces;
    current.entryRaceCount += row.entryRaceCount;
    current.winOddsRaceCount += row.winOddsRaceCount;
    current.combinationOddsRaceCount += row.combinationOddsRaceCount;
    current.resultsConfirmedCount += row.resultsConfirmedCount;
    grouped.set(row.organizer, current);
  }
  return Array.from(grouped.values()).map(row => asCoverage(row)).sort((left, right) => left.averageRate - right.averageRate || left.organizer.localeCompare(right.organizer));
}

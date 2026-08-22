export type ResultImportTrendRace = {
  raceDate: string;
  organizer: "JRA" | "NAR";
  status: string;
};

export type MonthlyResultImportTrend = {
  month: string;
  imported: number;
  unimported: number;
  jraImported: number;
  jraUnimported: number;
  narImported: number;
  narUnimported: number;
};

export type UnimportedRaceRecord = {
  raceDate: string;
  organizer: "JRA" | "NAR";
  venueName: string;
};

export type UnimportedRaceRanking = {
  organizerRanking: Array<{ organizer: "JRA" | "NAR"; raceCount: number; oldestRaceDate: string }>;
  venueRanking: Array<{ organizer: "JRA" | "NAR"; venueName: string; raceCount: number; oldestRaceDate: string; latestRaceDate: string }>;
};

/**
 * 発走日が過去のレースだけを入力として、公式結果の確定状態を月別に集計する。
 * `results_confirmed` 以外は、結果・払戻が揃っていない未取込として保持する。
 */
export function buildMonthlyResultImportTrend(rows: ResultImportTrendRace[]): MonthlyResultImportTrend[] {
  const months = new Map<string, MonthlyResultImportTrend>();

  for (const row of rows) {
    const month = row.raceDate.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(month)) continue;
    const current = months.get(month) ?? {
      month,
      imported: 0,
      unimported: 0,
      jraImported: 0,
      jraUnimported: 0,
      narImported: 0,
      narUnimported: 0,
    };
    const imported = row.status === "results_confirmed";

    if (imported) {
      current.imported += 1;
      if (row.organizer === "JRA") current.jraImported += 1;
      else current.narImported += 1;
    } else {
      current.unimported += 1;
      if (row.organizer === "JRA") current.jraUnimported += 1;
      else current.narUnimported += 1;
    }
    months.set(month, current);
  }

  return Array.from(months.values()).sort((a, b) => a.month.localeCompare(b.month));
}

/** 未取込の過去レースを、主催者・会場ごとに件数の多い順へ並べる。 */
export function buildUnimportedRaceRanking(rows: UnimportedRaceRecord[]): UnimportedRaceRanking {
  const organizerMap = new Map<"JRA" | "NAR", { organizer: "JRA" | "NAR"; raceCount: number; oldestRaceDate: string }>();
  const venueMap = new Map<string, { organizer: "JRA" | "NAR"; venueName: string; raceCount: number; oldestRaceDate: string; latestRaceDate: string }>();

  for (const row of rows) {
    if (!row.raceDate || !row.venueName) continue;
    const organizer = organizerMap.get(row.organizer) ?? { organizer: row.organizer, raceCount: 0, oldestRaceDate: row.raceDate };
    organizer.raceCount += 1;
    if (row.raceDate < organizer.oldestRaceDate) organizer.oldestRaceDate = row.raceDate;
    organizerMap.set(row.organizer, organizer);

    const key = `${row.organizer}:${row.venueName}`;
    const venue = venueMap.get(key) ?? { organizer: row.organizer, venueName: row.venueName, raceCount: 0, oldestRaceDate: row.raceDate, latestRaceDate: row.raceDate };
    venue.raceCount += 1;
    if (row.raceDate < venue.oldestRaceDate) venue.oldestRaceDate = row.raceDate;
    if (row.raceDate > venue.latestRaceDate) venue.latestRaceDate = row.raceDate;
    venueMap.set(key, venue);
  }

  const byDelay = <T extends { raceCount: number; oldestRaceDate: string }>(a: T, b: T) => b.raceCount - a.raceCount || a.oldestRaceDate.localeCompare(b.oldestRaceDate);
  return {
    organizerRanking: Array.from(organizerMap.values()).sort(byDelay),
    venueRanking: Array.from(venueMap.values()).sort((a, b) => byDelay(a, b) || a.venueName.localeCompare(b.venueName)),
  };
}

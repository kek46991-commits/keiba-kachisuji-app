export type TicketBand = "1-15" | "16-30" | "31-45" | "46-60" | "61+";

export const TICKET_BANDS: TicketBand[] = ["1-15", "16-30", "31-45", "46-60", "61+"];

export function parseRecordedTicketCount(raw: string | null): number | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { totalBets?: unknown; referenceOnly?: unknown };
    if (parsed.referenceOnly === true) return null;
    const totalBets = typeof parsed.totalBets === "number" ? parsed.totalBets : Number(parsed.totalBets);
    return Number.isInteger(totalBets) && totalBets > 0 ? totalBets : null;
  } catch {
    return null;
  }
}

/** 総点数が明記された保存済み買い目だけを、的中率・回収率の実測対象として扱う。 */
export function hasAuditableRecordedBets(raw: string | null): boolean {
  return parseRecordedTicketCount(raw) !== null;
}

export function ticketBandFor(count: number): TicketBand {
  if (count <= 15) return "1-15";
  if (count <= 30) return "16-30";
  if (count <= 45) return "31-45";
  if (count <= 60) return "46-60";
  return "61+";
}

export type SettledPredictionForPerformance = {
  recommendedBets: string | null;
  investAmount: number | null;
  returnAmount: number | null;
  isHit: boolean | null;
};

export function aggregateTicketPerformance(rows: SettledPredictionForPerformance[]) {
  const buckets = new Map<TicketBand, { records: number; hits: number; totalInvest: number; totalReturn: number }>(
    TICKET_BANDS.map(band => [band, { records: 0, hits: 0, totalInvest: 0, totalReturn: 0 }]),
  );
  let unclassifiedCount = 0;

  for (const row of rows) {
    const ticketCount = parseRecordedTicketCount(row.recommendedBets);
    if (!ticketCount) {
      unclassifiedCount++;
      continue;
    }
    const bucket = buckets.get(ticketBandFor(ticketCount))!;
    bucket.records++;
    bucket.hits += row.isHit ? 1 : 0;
    bucket.totalInvest += Number(row.investAmount ?? 0);
    bucket.totalReturn += Number(row.returnAmount ?? 0);
  }

  return {
    bands: TICKET_BANDS.map(band => {
      const bucket = buckets.get(band)!;
      const profit = bucket.totalReturn - bucket.totalInvest;
      return {
        band,
        ...bucket,
        profit,
        hitRate: bucket.records > 0 ? Math.round((bucket.hits / bucket.records) * 1000) / 10 : null,
        roi: bucket.totalInvest > 0 ? Math.round((bucket.totalReturn / bucket.totalInvest) * 1000) / 10 : null,
      };
    }),
    unclassifiedCount,
  };
}

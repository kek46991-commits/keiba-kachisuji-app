import { calculateRecoveryRate } from "../shared/settlementDisplay";
import { hasAuditableRecordedBets } from "./ticketPerformance";

export type HistoryPerformanceRow = {
  id: number;
  raceId: string;
  predictedAt: Date;
  recommendedBets: string | null;
  isHit: boolean | null;
  investAmount: number | null;
  returnAmount: number | null;
};

function getLatestSettledRows(rows: HistoryPerformanceRow[]) {
  const latestByRace = new Map<string, HistoryPerformanceRow>();
  for (const row of rows) {
    const current = latestByRace.get(row.raceId);
    if (!current || row.predictedAt.getTime() > current.predictedAt.getTime() || (row.predictedAt.getTime() === current.predictedAt.getTime() && row.id > current.id)) {
      latestByRace.set(row.raceId, row);
    }
  }
  return Array.from(latestByRace.values()).filter(row => row.isHit !== null);
}

function toJstDateKey(value: Date) {
  return value.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/**
 * 同一レースへの再生成は最新だけを採用し、点数未記録の旧形式は実績の分母・分子から除外する。
 * 的中率・回収率を推測値ではなく、保存済みの確定買い目だけで算出するための集計関数。
 */
export function aggregatePredictionHistoryPerformance(rows: HistoryPerformanceRow[]) {
  const settled = getLatestSettledRows(rows);
  const auditable = settled.filter(row => hasAuditableRecordedBets(row.recommendedBets));
  const total = auditable.length;
  const hits = auditable.filter(row => row.isHit).length;
  const invest = auditable.reduce((sum, row) => sum + Number(row.investAmount ?? 0), 0);
  const returned = auditable.reduce((sum, row) => sum + Number(row.returnAmount ?? 0), 0);

  return {
    settledCount: settled.length,
    total,
    hits,
    misses: total - hits,
    hitRate: total > 0 ? Math.round((hits / total) * 1000) / 10 : null,
    totalInvest: invest,
    totalReturn: returned,
    profit: returned - invest,
    roi: invest > 0 ? Math.round((returned / invest) * 1000) / 10 : null,
    excludedLegacyCount: settled.length - auditable.length,
  };
}

export type TimelinePoint = {
  date: string;
  cumulativeProfit: number;
  cumulativeRoi: number | null;
  cumulativeInvest: number;
  cumulativeReturn: number;
  raceCount: number;
  hitCount: number;
  dailyInvest: number;
  dailyReturn: number;
  dailyProfit: number;
  dailyRoi: number | null;
};

/** 日単位の投資・回収・回収率と、累積収支・累積回収率の推移。 */
export function buildPredictionHistoryTimeline(rows: HistoryPerformanceRow[]) {
  const settled = getLatestSettledRows(rows);
  const auditable = settled
    .filter(row => hasAuditableRecordedBets(row.recommendedBets))
    .sort((left, right) => left.predictedAt.getTime() - right.predictedAt.getTime() || left.id - right.id);

  let cumulativeInvest = 0;
  let cumulativeReturn = 0;
  const points = new Map<string, TimelinePoint>();
  for (const row of auditable) {
    const invest = Number(row.investAmount ?? 0);
    const returned = Number(row.returnAmount ?? 0);
    cumulativeInvest += invest;
    cumulativeReturn += returned;
    const date = toJstDateKey(row.predictedAt);
    const previous = points.get(date);
    const dailyInvest = (previous?.dailyInvest ?? 0) + invest;
    const dailyReturn = (previous?.dailyReturn ?? 0) + returned;
    points.set(date, {
      date,
      cumulativeProfit: cumulativeReturn - cumulativeInvest,
      cumulativeRoi: calculateRecoveryRate(cumulativeInvest, cumulativeReturn),
      cumulativeInvest,
      cumulativeReturn,
      raceCount: (previous?.raceCount ?? 0) + 1,
      hitCount: (previous?.hitCount ?? 0) + (row.isHit ? 1 : 0),
      dailyInvest,
      dailyReturn,
      dailyProfit: dailyReturn - dailyInvest,
      dailyRoi: calculateRecoveryRate(dailyInvest, dailyReturn),
    });
  }

  return {
    points: Array.from(points.values()),
    total: auditable.length,
    excludedLegacyCount: settled.length - auditable.length,
  };
}

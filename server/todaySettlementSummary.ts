import { calculateRecoveryRate } from "../shared/settlementDisplay";
import { hasAuditableRecordedBets } from "./ticketPerformance";

export type TodaySettlementPrediction = {
  raceId: string;
  predictedAt: Date;
  recommendedBets: string | null;
  isHit: boolean | null;
  investAmount: number | null;
  returnAmount: number | null;
};

export type TodaySettlementSummary = {
  settledPredictionCount: number;
  hitCount: number;
  investmentAmount: number;
  returnAmount: number;
  profitAmount: number;
  recoveryRate: number | null;
};

/** 同一レースの最新かつ実測可能な予想だけから、当日成績を集計する。 */
export function summarizeTodaySettlements(rows: TodaySettlementPrediction[]): TodaySettlementSummary {
  const latestByRace = new Map<string, TodaySettlementPrediction>();
  for (const row of rows) {
    if (row.isHit === null || !hasAuditableRecordedBets(row.recommendedBets)) continue;
    const existing = latestByRace.get(row.raceId);
    if (!existing || row.predictedAt > existing.predictedAt) latestByRace.set(row.raceId, row);
  }

  const records = Array.from(latestByRace.values());
  const investmentAmount = records.reduce((sum, row) => sum + (row.investAmount ?? 0), 0);
  const returnAmount = records.reduce((sum, row) => sum + (row.returnAmount ?? 0), 0);
  return {
    settledPredictionCount: records.length,
    hitCount: records.filter(row => row.isHit).length,
    investmentAmount,
    returnAmount,
    profitAmount: returnAmount - investmentAmount,
    recoveryRate: calculateRecoveryRate(investmentAmount, returnAmount),
  };
}

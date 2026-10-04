import { calculatePredictionSettlementByType } from "./resultSettlement";
import type { BetTypeSettlement } from "./resultSettlement";

type PredictionRow = {
  id: number;
  raceId: string;
  predictedAt: Date;
  recommendedBets: string | null;
};

type OfficialPayout = {
  raceId: string;
  betType: "trifecta" | "trio" | "quinella" | "exacta" | "wide";
  combination: string;
  payout: number;
};

const BET_TYPES = ["trifecta", "trio", "quinella", "exacta", "wide"] as const;

export function aggregateBetTypePerformance(rows: PredictionRow[], officialPayouts: OfficialPayout[]) {
  const latestByRace = new Map<string, PredictionRow>();
  for (const row of rows) {
    const current = latestByRace.get(row.raceId);
    if (!current || row.predictedAt.getTime() > current.predictedAt.getTime() || (row.predictedAt.getTime() === current.predictedAt.getTime() && row.id > current.id)) {
      latestByRace.set(row.raceId, row);
    }
  }

  const stats = Object.fromEntries(BET_TYPES.map(betType => [betType, { total: 0, hits: 0, totalInvest: 0, totalReturn: 0 }])) as Record<typeof BET_TYPES[number], { total: number; hits: number; totalInvest: number; totalReturn: number }>;
  let settledRaces = 0;
  let excludedLegacyCount = 0;

  for (const row of Array.from(latestByRace.values())) {
    const payouts = officialPayouts.filter(payout => payout.raceId === row.raceId).map(({ betType, combination, payout }) => ({ betType, combination, payout }));
    const settlement = calculatePredictionSettlementByType(row.recommendedBets, payouts);
    if (settlement.state === "pending_ticket_data") {
      excludedLegacyCount++;
      continue;
    }
    if (settlement.state !== "settled") continue;
    settledRaces++;
    for (const result of settlement.byType as BetTypeSettlement[]) {
      const stat = stats[result.betType];
      stat.total++;
      stat.hits += result.isHit ? 1 : 0;
      stat.totalInvest += result.ticketCount * 100;
      stat.totalReturn += result.returnAmount;
    }
  }

  return { stats, settledRaces, excludedLegacyCount };
}

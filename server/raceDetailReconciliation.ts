import { calculatePredictionSettlementByType } from "./resultSettlement";

type SupportedBetType = "trifecta" | "trio" | "quinella" | "exacta" | "wide";

export type OfficialPayoutForDetail = {
  betType: SupportedBetType;
  combination: string;
  payout: number;
};

export type DetailPredictionForReconciliation = {
  recommendedBets: string | null;
  investAmount: number | null;
  returnAmount: number | null;
  isHit: boolean | null;
};

export type DetailEntryForReconciliation = {
  horseNumber: number;
  finishPosition: number | null;
};

const betTypeLabels: Record<SupportedBetType, string> = {
  trifecta: "3連単",
  trio: "3連複",
  quinella: "馬連",
  exacta: "馬単",
  wide: "ワイド",
};

const betTypeOrder: SupportedBetType[] = ["trifecta", "trio", "quinella", "exacta", "wide"];

function readRecommendedBets(rawBets: string | null) {
  if (!rawBets) return [] as Array<{ betType: SupportedBetType; label: string; selection: string }>;
  try {
    const parsed = JSON.parse(rawBets) as Record<string, unknown>;
    return betTypeOrder.flatMap(betType => {
      const selection = parsed[betType];
      return typeof selection === "string" && selection.trim()
        ? [{ betType, label: betTypeLabels[betType], selection: selection.trim() }]
        : [];
    });
  } catch {
    return [];
  }
}

export function buildRaceDetailReconciliation({
  prediction,
  officialPayouts,
  entries,
}: {
  prediction: DetailPredictionForReconciliation | null;
  officialPayouts: OfficialPayoutForDetail[];
  entries: DetailEntryForReconciliation[];
}) {
  const topThree = entries
    .filter(entry => entry.finishPosition !== null && entry.finishPosition >= 1 && entry.finishPosition <= 3)
    .sort((left, right) => (left.finishPosition ?? 99) - (right.finishPosition ?? 99))
    .map(entry => ({ position: entry.finishPosition!, horseNumber: entry.horseNumber }));

  if (!prediction) {
    return {
      state: "no_prediction" as const,
      stateLabel: "AI予想未保存",
      stateDetail: "このレースには保存済みのAI予想がありません。",
      topThree,
      tickets: [],
      investAmount: null,
      returnAmount: null,
      profitAmount: null,
    };
  }

  const calculated = calculatePredictionSettlementByType(prediction.recommendedBets, officialPayouts);
  const recommended = readRecommendedBets(prediction.recommendedBets);
  const settledByType = new Map(calculated.state === "settled" ? calculated.byType.map(ticket => [ticket.betType, ticket]) : []);
  const settledReturn = calculated.state === "settled"
    ? calculated.byType.reduce((sum, ticket) => sum + ticket.returnAmount, 0)
    : prediction.returnAmount;
  const resolvedReturn = settledReturn ?? null;
  const investAmount = prediction.investAmount ?? null;

  const state = calculated.state === "settled"
    ? "settled"
    : calculated.state === "pending_payouts"
      ? "pending_payouts"
      : "pending_ticket_data";
  const stateCopy = {
    settled: { stateLabel: prediction.isHit === true ? "的中・精算済み" : "不的中・精算済み", stateDetail: "保存済み買い目と公式払戻を照合済みです。" },
    pending_payouts: { stateLabel: "払戻取込待ち", stateDetail: "予想買い目は保存されていますが、必要な公式払戻が未取込です。" },
    pending_ticket_data: { stateLabel: "買い目データ未精算", stateDetail: "買い目点数または記録形式が不足しているため、精算対象外です。" },
  }[state];

  return {
    state,
    ...stateCopy,
    topThree,
    tickets: recommended.map(ticket => {
      const settlement = settledByType.get(ticket.betType);
      return {
        ...ticket,
        ticketCount: settlement?.ticketCount ?? null,
        isHit: settlement?.isHit ?? null,
        returnAmount: settlement?.returnAmount ?? null,
      };
    }),
    investAmount,
    returnAmount: resolvedReturn,
    profitAmount: investAmount !== null && resolvedReturn !== null ? resolvedReturn - investAmount : null,
  };
}

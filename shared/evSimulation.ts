export type SimulationHorseInput = {
  id: string;
  label: string;
  abilityScore: number;
  odds: number | null;
};

export type SimulationHorseResult = SimulationHorseInput & {
  estimatedWinProbability: number;
  expectedValue: number | null;
};

export type TicketRiskInput = {
  combinationOdds: number | null;
  ticketCount: number;
  stakePerTicket: number;
};

export type TicketRiskResult = {
  status: "pending" | "safe" | "risk";
  totalStake: number;
  minimumExpectedPayout: number | null;
  breakEvenOdds: number | null;
};

export type TicketBoundaryResult = {
  status: "pending" | "below" | "at_boundary" | "above";
  boundaryOdds: number | null;
  currentOdds: number | null;
  difference: number | null;
  additionalOddsNeeded: number | null;
};

export type RecoveryRateCurvePoint = {
  odds: number;
  recoveryRate: number;
  expectedPayout: number;
  profitLoss: number;
};

/**
 * 検証専用のEV計算。実在レース、公式オッズ、予想・精算テーブルには接続しない。
 * 予測画面と同じ「能力をレース内で正規化し、オッズと別軸でEVを算出する」式を使う。
 */
export function calculateSimulationEv(items: SimulationHorseInput[]): SimulationHorseResult[] {
  if (items.length === 0) return [];
  const maxScore = Math.max(...items.map(item => item.abilityScore));
  const temperature = 12;
  const weights = items.map(item => Math.exp((item.abilityScore - maxScore) / temperature));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;
  return items.map((item, index) => {
    const estimatedWinProbability = Math.round((weights[index]! / totalWeight) * 1000) / 10;
    const expectedValue = item.odds !== null && item.odds > 0
      ? Math.round((((estimatedWinProbability / 100) * item.odds - 1) * 100) * 10) / 10
      : null;
    return { ...item, estimatedWinProbability, expectedValue };
  });
}

/** 検証画面に表示する固定値。実在馬・実在レース・公式データではない。 */
export function createDemoSimulationEntries(): SimulationHorseInput[] {
  return [
    { id: "demo-a", label: "テスト値 A", abilityScore: 82, odds: 2.4 },
    { id: "demo-b", label: "テスト値 B", abilityScore: 78, odds: 4.8 },
    { id: "demo-c", label: "テスト値 C", abilityScore: 73, odds: 9.5 },
    { id: "demo-d", label: "テスト値 D", abilityScore: 68, odds: 16 },
  ];
}

export function calculateTicketRisk(input: TicketRiskInput): TicketRiskResult {
  const ticketCount = Math.max(0, Math.floor(input.ticketCount));
  const stakePerTicket = Math.max(0, input.stakePerTicket);
  const totalStake = ticketCount * stakePerTicket;
  const breakEvenOdds = ticketCount > 0 ? ticketCount : null;
  if (input.combinationOdds === null || input.combinationOdds <= 0 || ticketCount <= 0 || stakePerTicket <= 0) {
    return { status: "pending", totalStake, minimumExpectedPayout: null, breakEvenOdds };
  }
  const minimumExpectedPayout = Math.round(input.combinationOdds * stakePerTicket);
  return { status: minimumExpectedPayout >= totalStake ? "safe" : "risk", totalStake, minimumExpectedPayout, breakEvenOdds };
}

/** 一律購入においてトリガミを避ける最小組合せオッズを探索する。 */
export function calculateTicketBoundary(input: TicketRiskInput): TicketBoundaryResult {
  const ticketCount = Math.max(0, Math.floor(input.ticketCount));
  const stakePerTicket = Math.max(0, input.stakePerTicket);
  const currentOdds = input.combinationOdds !== null && input.combinationOdds > 0 ? input.combinationOdds : null;
  if (ticketCount <= 0 || stakePerTicket <= 0 || currentOdds === null) {
    return { status: "pending", boundaryOdds: null, currentOdds, difference: null, additionalOddsNeeded: null };
  }
  const boundaryOdds = ticketCount;
  const difference = Math.round((currentOdds - boundaryOdds) * 100) / 100;
  if (difference === 0) return { status: "at_boundary", boundaryOdds, currentOdds, difference, additionalOddsNeeded: 0 };
  return { status: difference > 0 ? "above" : "below", boundaryOdds, currentOdds, difference, additionalOddsNeeded: difference < 0 ? Math.abs(difference) : 0 };
}

/**
 * 入力されたテスト条件の周辺で、組合せオッズと期待回収率の関係を描くための系列。
 * 期待回収率 = 最低想定払戻 ÷ 総投資額 × 100。実データ・公式オッズは使用しない。
 */
export function createRecoveryRateCurve(input: TicketRiskInput, pointCount = 17): RecoveryRateCurvePoint[] {
  const ticketCount = Math.max(0, Math.floor(input.ticketCount));
  const stakePerTicket = Math.max(0, input.stakePerTicket);
  const currentOdds = input.combinationOdds !== null && input.combinationOdds > 0 ? input.combinationOdds : null;
  if (ticketCount <= 0 || stakePerTicket <= 0 || currentOdds === null) return [];

  const boundaryOdds = ticketCount;
  const lower = Math.max(0.1, Math.min(currentOdds, boundaryOdds) * 0.4);
  const upper = Math.max(currentOdds, boundaryOdds) * 1.8;
  const count = Math.max(5, pointCount);
  const step = (upper - lower) / (count - 1);
  const totalStake = ticketCount * stakePerTicket;

  return Array.from({ length: count }, (_, index) => {
    const odds = Math.round((lower + step * index) * 100) / 100;
    const expectedPayout = Math.round(odds * stakePerTicket);
    return {
      odds,
      expectedPayout,
      recoveryRate: Math.round((expectedPayout / totalStake) * 1000) / 10,
      profitLoss: expectedPayout - totalStake,
    };
  });
}

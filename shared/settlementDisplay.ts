/**
 * 的中判定と回収率の表示ロジック。
 * 保存済みの投資額・回収額だけから算出し、未確定の値は推測せず null / 未精算として扱う。
 */

export type HitStatus = "hit" | "miss" | "pending";

export function resolveHitStatus(isHit: boolean | null | undefined): HitStatus {
  if (isHit === true) return "hit";
  if (isHit === false) return "miss";
  return "pending";
}

export const hitStatusLabels: Record<HitStatus, string> = {
  hit: "的中 🎯",
  miss: "不的中",
  pending: "未精算",
};

export function hitStatusLabel(isHit: boolean | null | undefined): string {
  return hitStatusLabels[resolveHitStatus(isHit)];
}

/** 回収率（%・小数1桁）。投資額が未記録・0の場合は算出しない。 */
export function calculateRecoveryRate(
  investAmount: number | null | undefined,
  returnAmount: number | null | undefined,
): number | null {
  if (investAmount === null || investAmount === undefined) return null;
  if (returnAmount === null || returnAmount === undefined) return null;
  const invest = Number(investAmount);
  const returned = Number(returnAmount);
  if (!Number.isFinite(invest) || !Number.isFinite(returned) || invest <= 0) return null;
  return Math.round((returned / invest) * 1000) / 10;
}

export function formatRecoveryRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  return `${rate.toFixed(1)}%`;
}

export function formatYen(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return "—";
  return `¥${Number(amount).toLocaleString()}`;
}

export function formatSignedYen(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount))) return "—";
  const value = Number(amount);
  return `${value >= 0 ? "+" : "−"}¥${Math.abs(value).toLocaleString()}`;
}

export type SettlementFigures = {
  investAmount: number | null;
  returnAmount: number | null;
  profitAmount: number | null;
  recoveryRate: number | null;
};

export function buildSettlementFigures(
  investAmount: number | null | undefined,
  returnAmount: number | null | undefined,
): SettlementFigures {
  const invest = investAmount === null || investAmount === undefined ? null : Number(investAmount);
  const returned = returnAmount === null || returnAmount === undefined ? null : Number(returnAmount);
  return {
    investAmount: invest,
    returnAmount: returned,
    profitAmount: invest !== null && returned !== null ? returned - invest : null,
    recoveryRate: calculateRecoveryRate(invest, returned),
  };
}

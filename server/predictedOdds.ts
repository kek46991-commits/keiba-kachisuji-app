/**
 * 推定勝率の逆数から理論上の予想オッズを作る。
 * 市場で成立した公式オッズではなく、予想の相対的な強弱を表示するためだけに使う。
 */
export function derivePredictedOdds(winProbability: number | null | undefined): number | null {
  if (typeof winProbability !== "number" || !Number.isFinite(winProbability) || winProbability <= 0) return null;
  const raw = 100 / winProbability;
  const bounded = Math.min(999.9, Math.max(1.1, raw));
  return Math.round(bounded * 10) / 10;
}

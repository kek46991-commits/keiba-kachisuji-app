/**
 * AIスコアをレース内で正規化し、比較可能な推定勝率と期待値を返す。
 * これは確率を保証するものではなく、同一レース内での相対評価である。
 */
import { derivePredictedOdds } from "./predictedOdds";

export function applyPredictionMetrics<T extends { score: number; odds: number | null }>(items: T[]) {
  if (items.length === 0) return items.map(item => ({ ...item, winProbability: 0, expectedValue: null as number | null }));

  const maxScore = Math.max(...items.map(item => item.score));
  const temperature = 12;
  const weights = items.map(item => Math.exp((item.score - maxScore) / temperature));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0) || 1;

  return items.map((item, index) => {
    const winProbability = Math.round((weights[index]! / totalWeight) * 1000) / 10;
    const expectedValue = item.odds && item.odds > 0
      ? Math.round((((winProbability / 100) * item.odds - 1) * 100) * 10) / 10
      : null;
    return { ...item, winProbability, predictedOdds: derivePredictedOdds(winProbability), expectedValue };
  });
}

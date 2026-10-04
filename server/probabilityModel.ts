/**
 * 能力スコアと公式オッズ（市場）を対数空間で混合し、レース内の推定勝率へ変換する。
 *
 * 取込済みの確定レース88件で検証したところ、能力スコアのみの並びは単勝的中30.7%・◎複勝圏51.1%に対し、
 * 公式オッズの支持率順は44.3%・71.6%だった。能力スコアだけで並べ替えると市場情報を捨てることになるため、
 * 両者を混合する。同じ88件で公式払戻を使った買い目の回収率も比較した結果、能力側の重み0.5が
 * 単勝的中46.6%・◎複勝圏71.6%（いずれも市場単独以上）で、3連単回収90.9%・3連複回収61.3%と
 * 重み0.2（同72.8%・58.0%）を上回ったため、市場と能力を等分に扱う。
 * ※88レースの検証であり、回収率が100%を超えることを示すものではない。
 */

/** 混合スコアを softmax で確率化するときの温度。predictionMetrics と揃える。 */
export const SCORE_TEMPERATURE = 12;

/** 対数混合における能力スコア側の重み。残りが市場（公式オッズ）側の重み。 */
export const ABILITY_WEIGHT = 0.5;

const MIN_PROBABILITY = 1e-6;

export interface BlendInput {
  horseNumber: number;
  abilityScore: number;
  /** 公式に成立した単勝オッズ。未発表・未取得は null。 */
  odds: number | null;
}

export interface BlendedScore {
  horseNumber: number;
  /** 能力スコアと同じ尺度に戻した混合スコア。 */
  score: number;
  /** 能力スコアからの増減。市場シグナルの寄与分。 */
  marketSignalScore: number;
  /** 公式オッズから求めた支持率。オッズ未取得の馬は null。 */
  marketProbability: number | null;
}

function softmax(scores: number[], temperature: number): number[] {
  const max = Math.max(...scores);
  const weights = scores.map(score => Math.exp((score - max) / temperature));
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  return weights.map(weight => weight / total);
}

/**
 * 公式オッズが2頭以上に揃っている場合のみ市場を混合する。
 * オッズ未取得の馬は能力スコア由来の確率で補完し、市場側の情報だけで不当に沈めない。
 */
export function blendAbilityWithMarket(inputs: BlendInput[], abilityWeight: number = ABILITY_WEIGHT): BlendedScore[] {
  if (inputs.length === 0) return [];

  const abilityProbabilities = softmax(inputs.map(input => input.abilityScore), SCORE_TEMPERATURE);
  const quotedCount = inputs.filter(input => (input.odds ?? 0) > 0).length;

  if (quotedCount < 2) {
    return inputs.map(input => ({
      horseNumber: input.horseNumber,
      score: input.abilityScore,
      marketSignalScore: 0,
      marketProbability: null,
    }));
  }

  const impliedTotal = inputs.reduce((sum, input) => sum + ((input.odds ?? 0) > 0 ? 1 / input.odds! : 0), 0);
  const marketProbabilities = inputs.map((input, index) =>
    (input.odds ?? 0) > 0 && impliedTotal > 0 ? 1 / input.odds! / impliedTotal : abilityProbabilities[index]!,
  );
  const marketTotal = marketProbabilities.reduce((sum, value) => sum + value, 0) || 1;

  const logBlend = inputs.map((_, index) => {
    const market = Math.max(marketProbabilities[index]! / marketTotal, MIN_PROBABILITY);
    const ability = Math.max(abilityProbabilities[index]!, MIN_PROBABILITY);
    return (1 - abilityWeight) * Math.log(market) + abilityWeight * Math.log(ability);
  });

  // 能力スコアと同じ平均・尺度へ戻すことで、買い目生成側のスコア差しきい値をそのまま使える。
  const blendedProbabilities = softmax(logBlend.map(value => value * SCORE_TEMPERATURE), SCORE_TEMPERATURE);
  const rawScores = blendedProbabilities.map(probability => SCORE_TEMPERATURE * Math.log(Math.max(probability, MIN_PROBABILITY)));
  const abilityMean = inputs.reduce((sum, input) => sum + input.abilityScore, 0) / inputs.length;
  const rawMean = rawScores.reduce((sum, score) => sum + score, 0) / rawScores.length;

  return inputs.map((input, index) => {
    const score = Math.round((rawScores[index]! - rawMean + abilityMean) * 10) / 10;
    return {
      horseNumber: input.horseNumber,
      score,
      marketSignalScore: Math.round((score - input.abilityScore) * 10) / 10,
      marketProbability: (input.odds ?? 0) > 0 && impliedTotal > 0 ? 1 / input.odds! / impliedTotal : null,
    };
  });
}

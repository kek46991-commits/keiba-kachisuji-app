export type ValueCandidate = {
  horseNumber: number;
  score: number;
  odds: number | null;
  expectedValue: number | null;
  winProbability: number;
};

export type ValueSelection<T extends ValueCandidate> = {
  candidates: T[];
  skipped: boolean;
  threshold: number;
  reason: string;
};

/**
 * 馬単体の相対期待値を入口に、買い目候補を厳選する。
 * 3連系の厳密な期待値ではないため、相関を仮定した組合せ期待値は表示・保証しない。
 */
export function selectValueCandidates<T extends ValueCandidate>(
  results: T[],
  minimumExpectedValue = 0,
  maxCandidates = 4,
): ValueSelection<T> {
  const eligible = results
    .filter((result) => result.odds !== null && result.odds > 0 && result.expectedValue !== null)
    .filter((result) => (result.expectedValue ?? Number.NEGATIVE_INFINITY) >= minimumExpectedValue)
    .sort((a, b) => {
      const byExpectedValue = (b.expectedValue ?? 0) - (a.expectedValue ?? 0);
      return byExpectedValue !== 0 ? byExpectedValue : b.score - a.score;
    })
    .slice(0, maxCandidates);

  if (eligible.length < 3) {
    return {
      candidates: [],
      skipped: true,
      threshold: minimumExpectedValue,
      reason: `相対期待値${minimumExpectedValue >= 0 ? "+" : ""}${minimumExpectedValue}%以上の候補が3頭未満のため、無理な買い目は出さず見送り`,
    };
  }

  return {
    candidates: eligible,
    skipped: false,
    threshold: minimumExpectedValue,
    reason: `相対期待値${minimumExpectedValue >= 0 ? "+" : ""}${minimumExpectedValue}%以上の${eligible.length}頭だけを候補に採用`,
  };
}

export function countOrderedTrifecta(first: number[], second: number[], third: number[]): number {
  const combinations = new Set<string>();
  for (const a of first) for (const b of second) for (const c of third) {
    if (a !== b && b !== c && a !== c) combinations.add(`${a}-${b}-${c}`);
  }
  return combinations.size;
}

export type CoverageFormation = {
  axis: number;
  first: number[];
  second: number[];
  third: number[];
  trioPartners: number[];
  trifectaCount: number;
  trioCount: number;
  targetReached: boolean;
  caution: string | null;
  trigamiWarning: string;
  scoreGap: number | null;
};

const TRIGAMI_UNAVAILABLE = "3連単・3連複の公式組合せオッズが未取得のため、最低配当を使ったトリガミ判定は未確認です。購入前に公式オッズで総投資額を下回らないか確認してください。";

function uniqueHorseNumbers(numbers: number[]) {
  return Array.from(new Set(numbers)).filter(number => number > 0);
}

function buildAxisFormation({
  axis,
  second,
  third,
  trioPartners,
  target,
  caution,
}: {
  axis: number;
  second: number[];
  third: number[];
  trioPartners: number[];
  target: { trifectaMin: number; trifectaMax: number; trioMin: number; trioMax: number };
  caution?: string;
}): CoverageFormation {
  const normalizedSecond = uniqueHorseNumbers(second).filter(number => number !== axis);
  const normalizedThird = uniqueHorseNumbers(third).filter(number => number !== axis);
  const normalizedTrioPartners = uniqueHorseNumbers(trioPartners).filter(number => number !== axis);
  const trifectaCount = countOrderedTrifecta([axis], normalizedSecond, normalizedThird);
  const trioCount = normalizedTrioPartners.length >= 2 ? (normalizedTrioPartners.length * (normalizedTrioPartners.length - 1)) / 2 : 0;
  const targetReached = trifectaCount >= target.trifectaMin && trifectaCount <= target.trifectaMax && trioCount >= target.trioMin && trioCount <= target.trioMax;
  return {
    axis,
    first: [axis],
    second: normalizedSecond,
    third: normalizedThird,
    trioPartners: normalizedTrioPartners,
    trifectaCount,
    trioCount,
    targetReached,
    caution: caution ?? (targetReached ? null : "候補不足により目安点数へ届きません。低根拠の馬を追加せず、現在の候補だけで構成します。"),
    trigamiWarning: TRIGAMI_UNAVAILABLE,
    scoreGap: null,
  };
}

export type ScoreRankedHorse = { horseNumber: number; score?: number | null };

const SCORE_GAP_FOR_SPLIT_FIRST = 4;

function normalizeScoreRanked(input: Array<number | ScoreRankedHorse>) {
  const seen = new Set<number>();
  return input.flatMap((entry) => {
    const horseNumber = typeof entry === "number" ? entry : entry.horseNumber;
    if (!Number.isInteger(horseNumber) || horseNumber <= 0 || seen.has(horseNumber)) return [];
    seen.add(horseNumber);
    return [{ horseNumber, score: typeof entry === "number" ? null : entry.score ?? null }];
  });
}

/**
 * 能力1・2位の差が小さいときだけ1着候補を2頭に分散する。
 * スコアが与えられない旧呼び出しでは従来どおり1位固定にし、無根拠な点数増加を防ぐ。
 */
export function buildScoreFirstFormation(scoreRankedInput: Array<number | ScoreRankedHorse>): CoverageFormation | null {
  const rankedRows = normalizeScoreRanked(scoreRankedInput);
  const ranked = rankedRows.map(row => row.horseNumber);
  if (ranked.length < 3) return null;
  const [axis, ...partners] = ranked;
  const topScore = rankedRows[0]?.score;
  const secondScore = rankedRows[1]?.score;
  const scoreGap = typeof topScore === "number" && typeof secondScore === "number"
    ? Math.max(0, Math.round((topScore - secondScore) * 10) / 10)
    : null;

  if (scoreGap !== null && scoreGap <= SCORE_GAP_FOR_SPLIT_FIRST) {
    const first = ranked.slice(0, 2);
    const second = ranked.slice(0, 3);
    const third = ranked.slice(0, 5);
    const trioPartners = ranked.slice(0, 4);
    const trifectaCount = countOrderedTrifecta(first, second, third);
    const trioCount = trioPartners.length >= 3 ? (trioPartners.length * (trioPartners.length - 1) * (trioPartners.length - 2)) / 6 : 0;
    const targetReached = trifectaCount <= 20 && trioCount <= 4;
    return {
      axis: axis!,
      first,
      second,
      third,
      trioPartners,
      trifectaCount,
      trioCount,
      targetReached,
      caution: `能力1・2位の差が${scoreGap}点と小さいため、1着候補を${first.join("・")}へ分散しています。`,
      trigamiWarning: TRIGAMI_UNAVAILABLE,
      scoreGap,
    };
  }

  const formation = buildAxisFormation({
    axis: axis!,
    second: partners.slice(0, 3),
    third: partners.slice(0, 4),
    // 相手4頭を全て使うと6点になるため、3連複は上位3頭に絞って3点へ収める。
    trioPartners: partners.slice(0, 3),
    target: { trifectaMin: 8, trifectaMax: 12, trioMin: 3, trioMax: 4 },
  });
  return { ...formation, scoreGap };
}

/** 穴馬を1着固定にしつつ、上位スコア馬を2・3着候補から必ず残す。 */
export function buildLongshotAxisFormation({
  axis,
  scoreRankedHorseNumbers,
  holePartnerHorseNumbers,
}: {
  axis: number;
  scoreRankedHorseNumbers: number[];
  holePartnerHorseNumbers: number[];
}): CoverageFormation | null {
  if (!axis) return null;
  const scorePartners = uniqueHorseNumbers(scoreRankedHorseNumbers).filter(number => number !== axis);
  const holePartners = uniqueHorseNumbers(holePartnerHorseNumbers).filter(number => number !== axis && !scorePartners.includes(number));
  const second = uniqueHorseNumbers([...scorePartners.slice(0, 3), ...holePartners, ...scorePartners.slice(3)]).slice(0, 4);
  const third = uniqueHorseNumbers([...scorePartners.slice(0, 4), ...holePartners, ...scorePartners.slice(4)]).slice(0, 5);
  if (second.length < 2 || third.length < 3) return null;
  // 3連複は上位スコア2頭と穴相手1頭を優先し、3点に抑える。
  const trioPartners = uniqueHorseNumbers([...scorePartners.slice(0, 2), ...holePartners, ...scorePartners.slice(2)]).slice(0, 3);
  const caution = holePartners.length === 0
    ? "穴軸以外の穴相手がデータ上で確認できないため、上位スコア馬だけで構成しています。"
    : undefined;
  return buildAxisFormation({
    axis,
    second,
    third,
    trioPartners,
    target: { trifectaMin: 12, trifectaMax: 18, trioMin: 3, trioMax: 5 },
    caution,
  });
}

/**
 * 軸馬1頭が1着に来た場合の2・3着抜けを抑える3連系フォーメーション。
 * 公式の組合せオッズが未保存のときは、トリガミを判定せず明示的に警告する。
 */
export function buildCoverageFormation(candidates: Array<Pick<ValueCandidate, "horseNumber">>): CoverageFormation | null {
  const unique = Array.from(new Set(candidates.map(candidate => candidate.horseNumber))).filter(number => number > 0);
  if (unique.length < 3) return null;

  const [axis, ...partners] = unique;
  const second = partners.slice(0, Math.min(4, partners.length));
  const third = partners.slice(0, Math.min(5, partners.length));
  const trioPartners = partners.slice(0, Math.min(4, partners.length));
  const trifectaCount = countOrderedTrifecta([axis!], second, third);
  const trioCount = trioPartners.length >= 2 ? (trioPartners.length * (trioPartners.length - 1)) / 2 : 0;
  const targetReached = trifectaCount >= 12 && trifectaCount <= 20 && trioCount >= 3 && trioCount <= 6;

  return {
    axis: axis!,
    first: [axis!],
    second,
    third,
    trioPartners,
    trifectaCount,
    trioCount,
    targetReached,
    caution: targetReached ? null : "相対期待値と補助根拠を満たす候補が不足しているため、目標点数まで低根拠の馬を追加せず、少点数で表示します。",
    trigamiWarning: TRIGAMI_UNAVAILABLE,
    scoreGap: null,
  };
}

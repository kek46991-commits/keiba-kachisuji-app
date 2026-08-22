export type RaceVolatilityLevel = "A" | "B" | "C" | "D" | "unknown";
export type AxisPolicy = "single" | "dual" | "single_caution" | "undetermined";

export type RaceAnalysisDiagnostics = {
  volatility: RaceVolatilityLevel;
  volatilityLabel: string;
  volatilityReason: string;
  axisPolicy: AxisPolicy;
  axisPolicyLabel: string;
  scoreGap: number | null;
  scoreSpread: number | null;
  oddsAvailable: boolean;
  missingDataNotice: string | null;
};

type DiagnosticEntry = { score: number; odds: number | null };

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * 能力スコアの差と公式オッズの分布を別々に観察する。
 * オッズがない場合に市場分布を推測せず、波乱度と軸方針を未確定として返す。
 */
export function analyzeRaceDiagnostics(entries: DiagnosticEntry[]): RaceAnalysisDiagnostics {
  const sortedByScore = [...entries].sort((left, right) => right.score - left.score);
  const scoreGap = sortedByScore.length >= 2 ? round(sortedByScore[0]!.score - sortedByScore[1]!.score) : null;
  const mean = entries.length > 0 ? entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length : 0;
  const scoreSpread = entries.length > 1
    ? round(Math.sqrt(entries.reduce((sum, entry) => sum + (entry.score - mean) ** 2, 0) / entries.length))
    : null;
  const odds = entries.map(entry => entry.odds).filter((odds): odds is number => odds !== null && odds > 0);
  const oddsAvailable = odds.length === entries.length && entries.length >= 3;

  if (!oddsAvailable) {
    return {
      volatility: "unknown",
      volatilityLabel: "判定保留",
      volatilityReason: "公式オッズが全頭分そろっていないため、市場分布に基づく波乱度は判定しません。",
      axisPolicy: scoreGap === null ? "undetermined" : scoreGap <= 4 ? "dual" : "single_caution",
      axisPolicyLabel: scoreGap === null ? "軸方針保留" : scoreGap <= 4 ? "スコア僅差：W軸検討" : "単軸候補（市場確認待ち）",
      scoreGap,
      scoreSpread,
      oddsAvailable: false,
      missingDataNotice: "公式オッズ未取得のため、波乱度・トリガミ・市場評価は未確認です。",
    };
  }

  const favoriteOdds = Math.min(...odds);
  let volatility: RaceVolatilityLevel;
  let volatilityLabel: string;
  let volatilityReason: string;
  if (favoriteOdds <= 2.5 && (scoreGap ?? 0) >= 8) {
    volatility = "A";
    volatilityLabel = "A：堅め";
    volatilityReason = "低オッズの有力馬と能力スコア差がともに明確です。";
  } else if (favoriteOdds <= 4 && (scoreGap ?? 0) >= 5) {
    volatility = "B";
    volatilityLabel = "B：やや堅め";
    volatilityReason = "上位馬に一定の優位がありますが、相手候補の比較が必要です。";
  } else if (favoriteOdds >= 7 || (scoreGap ?? 0) <= 3) {
    volatility = "D";
    volatilityLabel = "D：超波乱";
    volatilityReason = "市場の本命が不在、または能力上位のスコア差が僅差です。";
  } else {
    volatility = "C";
    volatilityLabel = "C：混戦";
    volatilityReason = "上位能力と市場評価が拮抗しており、組合せの不確実性が高い状態です。";
  }

  const axisPolicy: AxisPolicy = (scoreGap ?? 0) <= 4 || volatility === "D"
    ? "dual"
    : volatility === "A" && (scoreGap ?? 0) >= 8
      ? "single"
      : "single_caution";
  const axisPolicyLabel = axisPolicy === "dual"
    ? "スコア僅差：W軸検討"
    : axisPolicy === "single"
      ? "能力差明確：1頭軸候補"
      : "単軸候補（相手厚め）";
  return { volatility, volatilityLabel, volatilityReason, axisPolicy, axisPolicyLabel, scoreGap, scoreSpread, oddsAvailable: true, missingDataNotice: null };
}

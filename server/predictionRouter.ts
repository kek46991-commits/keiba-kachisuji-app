/**
 * 予想実行ルーター
 * コース特性・天気・馬場状態・騎手相性・オッズ分析を統合したAIスコアリング
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { premiumProcedure } from "./access/premiumAccess";
import { getDb } from "./db";
import { races, entries, predictions, predictionTicketSets, venues, jockeyMaster, raceSchedules } from "../drizzle/schema";
import { eq, and, gte, lte, asc, desc, sql, inArray } from "drizzle-orm";
import { getOddsMovementBonus } from "./oddsEngine";
import { applyPredictionMetrics } from "./predictionMetrics";
import { getSavedStructuredPrediction } from "./structuredPredictionService";
import { savePredictionTicketSets } from "./predictionTicketSets";
import { buildScoreFirstFormation, selectValueCandidates } from "./valueBetting";
import { buildAnaBettingRecommendationForRace } from "./anaUmaRouter";
import { analyzeRaceDiagnostics } from "./raceAnalysisDiagnostics";
import { getPredictionAvailability } from "./predictionAvailability";

// 出馬表・オッズは、DBへ取り込まれた公式データまたは許諾済みデータだけを使う。
// 個人契約データや第三者サイトのHTMLを公開予想処理から取得しない。

// ==========================================
// スコアリングアルゴリズム定数
// ==========================================

/** 騎手ランク別補正（トップジョッキーほど加点） */
const TOP_JOCKEYS: Record<string, number> = {
  "C.ルメール": 12, "川田将雅": 11, "横山武史": 10, "戸崎圭太": 9,
  "福永祐一": 9, "松山弘平": 8, "岩田望来": 7, "坂井瑠星": 7,
  "M.デムーロ": 8, "武豊": 8, "池添謙一": 6, "田辺裕信": 6,
  "横山典弘": 6, "吉田隼人": 5, "丹内祐次": 4, "石橋脩": 5,
  "菅原明良": 5, "鮫島克駿": 5, "藤岡佑介": 5, "北村宏司": 4,
};

/** コース適性（芝/ダート × 距離帯 × 脚質） */
const DISTANCE_CATEGORIES = {
  sprint: { min: 0, max: 1400 },
  mile: { min: 1401, max: 1800 },
  intermediate: { min: 1801, max: 2200 },
  long: { min: 2201, max: 3600 },
} as const;

/** 馬場状態補正係数 */
const TRACK_CONDITION_FACTOR: Record<string, Record<string, number>> = {
  good: { turf: 1.0, dirt: 1.0 },
  slightly_heavy: { turf: 0.95, dirt: 1.05 },
  heavy: { turf: 0.88, dirt: 1.1 },
  bad: { turf: 0.8, dirt: 1.15 },
};

/** 枠番補正（コース別に内枠/外枠の有利不利） */
const GATE_BIAS: Record<string, Record<string, number>> = {
  "東京": { inner: 2, outer: -1 },
  "中山": { inner: 3, outer: -2 },
  "阪神": { inner: 1, outer: 0 },
  "京都": { inner: 2, outer: -1 },
  "中京": { inner: 0, outer: 1 },
  "新潟": { inner: -1, outer: 2 },
  "札幌": { inner: 2, outer: -1 },
  "函館": { inner: 2, outer: -2 },
  "小倉": { inner: 3, outer: -2 },
  "福島": { inner: 1, outer: 0 },
};

/** 血統系統×コース適性マッピング */
const SIRE_LINE_AFFINITY: Record<string, { turf: number; dirt: number; sprint: number; long: number }> = {
  "ディープインパクト": { turf: 5, dirt: -2, sprint: -1, long: 4 },
  "キングカメハメハ": { turf: 3, dirt: 3, sprint: 1, long: 2 },
  "ハーツクライ": { turf: 4, dirt: 0, sprint: -2, long: 5 },
  "ロードカナロア": { turf: 3, dirt: 1, sprint: 5, long: -2 },
  "エピファネイア": { turf: 4, dirt: 1, sprint: -1, long: 3 },
  "ドゥラメンテ": { turf: 4, dirt: 2, sprint: 0, long: 3 },
  "モーリス": { turf: 4, dirt: 0, sprint: 1, long: 2 },
  "キタサンブラック": { turf: 4, dirt: 1, sprint: -1, long: 4 },
  "サトノダイヤモンド": { turf: 3, dirt: 0, sprint: -2, long: 4 },
  "ゴールドシップ": { turf: 3, dirt: 1, sprint: -3, long: 5 },
};

// ==========================================
// スコアリング関数
// ==========================================

interface EntryData {
  horseNumber: number;
  horseName: string;
  jockey: string | null;
  odds: number | null;
  popularity: number | null;
  weight: number | null;
  gateNumber: number | null;
  age: number | null;
  sex: string | null;
  sire: string | null;
  dam: string | null;
  horseWeight: number | null;
  horseWeightDiff: number | null;
  last3f: number | null;
}

interface ScoreBreakdown {
  base: number;
  jockeyBonus: number;
  oddsScore: number;
  gateScore: number;
  trackConditionScore: number;
  bloodlineScore: number;
  weightScore: number;
  ageScore: number;
  oddsMovementScore: number;
  abilityScore: number;
  marketSignalScore: number;
  total: number;
}

interface PredictionResult {
  horseNumber: number;
  horseName: string;
  jockey: string | null;
  odds: number | null;
  /** 能力スコアから導く理論上の予想オッズ。市場で成立した公式オッズではない。 */
  predictedOdds?: number | null;
  oddsSource?: "official" | "predicted";
  score: number;
  winProbability: number;
  expectedValue: number | null;
  breakdown: ScoreBreakdown;
  rating: string; // ◎○▲△☆
}

function calculateScore(
  entry: EntryData,
  raceInfo: { surface: string | null; distance: number | null; venueName: string; trackCondition: string | null; headCount: number | null },
  jockeyStats: Map<string, { winRate: number; placeRate: number; turfWinRate: number; dirtWinRate: number; heavyWinRate: number }>,
): ScoreBreakdown {
  const surface = raceInfo.surface ?? "turf";
  const distance = raceInfo.distance ?? 1600;
  const venue = raceInfo.venueName;
  const trackCondition = raceInfo.trackCondition ?? "good";
  const headCount = raceInfo.headCount ?? 16;

  // 1. ベーススコア。市場オッズは能力評価へ混在させない。
  // 過去走など能力の直接データが未取得の現行データ契約では中立点から始め、取得済みの適性・騎手・馬体重だけで差を付ける。
  const base = 50;

  // 2. 騎手ボーナス
  let jockeyBonus = 0;
  if (entry.jockey) {
    // トップジョッキーリストからの補正（完全一致 or 部分一致）
    jockeyBonus = TOP_JOCKEYS[entry.jockey] ?? 0;
    // SP版は姓のみ表示のため、部分一致でも検索
    if (jockeyBonus === 0) {
      for (const [name, bonus] of Object.entries(TOP_JOCKEYS)) {
        if (name.includes(entry.jockey) || entry.jockey.includes(name.replace(/^[A-Z]\./, ""))) {
          jockeyBonus = bonus;
          break;
        }
      }
    }
    // DB統計からの補正
    const stats = jockeyStats.get(entry.jockey);
    if (stats) {
      const relevantWinRate = surface === "turf" ? stats.turfWinRate : stats.dirtWinRate;
      jockeyBonus += Math.round(relevantWinRate * 20);
      if (trackCondition === "heavy" || trackCondition === "bad") {
        jockeyBonus += Math.round(stats.heavyWinRate * 15);
      }
    }
  }

  // 3. オッズスコア（穴馬検知）
  let oddsScore = 0;
  if (entry.odds && entry.popularity) {
    // 人気以上にオッズが低い（過小評価）馬を検知
    const expectedOdds = entry.popularity * 3;
    if (entry.odds < expectedOdds * 0.7) {
      oddsScore = 5; // 実力以上に人気がある
    } else if (entry.odds > expectedOdds * 1.5 && entry.odds < 30) {
      oddsScore = 8; // 穴馬候補（過小評価されている）
    }
  }

  // 4. 枠番スコア
  let gateScore = 0;
  if (entry.gateNumber && GATE_BIAS[venue]) {
    const bias = GATE_BIAS[venue]!;
    const isInner = entry.gateNumber <= Math.ceil(headCount / 3);
    const isOuter = entry.gateNumber > Math.ceil(headCount * 2 / 3);
    if (isInner) gateScore = bias.inner;
    else if (isOuter) gateScore = bias.outer;
  }

  // 5. 馬場状態スコア
  let trackConditionScore = 0;
  const factor = TRACK_CONDITION_FACTOR[trackCondition]?.[surface] ?? 1.0;
  if (factor !== 1.0) {
    // 重馬場で有利な馬（ダート得意、パワー型）を加点
    if (surface === "dirt" && factor > 1.0) {
      trackConditionScore = Math.round((factor - 1.0) * 30);
    } else if (surface === "turf" && factor < 1.0) {
      trackConditionScore = Math.round((1.0 - factor) * -10);
    }
  }

  // 6. 血統スコア
  let bloodlineScore = 0;
  if (entry.sire) {
    const sireAffinity = SIRE_LINE_AFFINITY[entry.sire];
    if (sireAffinity) {
      bloodlineScore += surface === "turf" ? sireAffinity.turf : sireAffinity.dirt;
      if (distance <= 1400) bloodlineScore += sireAffinity.sprint;
      else if (distance >= 2200) bloodlineScore += sireAffinity.long;
    }
  }

  // 7. 馬体重スコア（増減による体調判定）
  let weightScore = 0;
  if (entry.horseWeightDiff !== null && entry.horseWeightDiff !== undefined) {
    if (entry.horseWeightDiff < -10) {
      weightScore = -5; // 大幅減は体調不良リスク
    } else if (entry.horseWeightDiff > 15) {
      weightScore = -3; // 大幅増は仕上がり不足リスク
    } else if (entry.horseWeightDiff >= -2 && entry.horseWeightDiff <= 4) {
      weightScore = 3; // 微増は好調サイン
    }
  }

  // 8. 年齢スコア
  let ageScore = 0;
  if (entry.age) {
    if (entry.age === 3) ageScore = 3; // 3歳は成長力
    else if (entry.age === 4) ageScore = 4; // 4歳はピーク
    else if (entry.age === 5) ageScore = 2;
    else if (entry.age >= 7) ageScore = -3; // 高齢は衰え
  }

  const oddsMovementScore = 0;
  const abilityScore = base + jockeyBonus + gateScore + trackConditionScore + bloodlineScore + weightScore + ageScore;
  const marketSignalScore = oddsScore + oddsMovementScore;
  const total = abilityScore;

  return {
    base,
    jockeyBonus,
    oddsScore,
    gateScore,
    trackConditionScore,
    bloodlineScore,
    weightScore,
    ageScore,
    oddsMovementScore,
    abilityScore,
    marketSignalScore,
    total,
  };
}

function assignRatings(results: Array<{ score: number; horseNumber: number }>): Map<number, string> {
  const sorted = [...results].sort((a, b) => b.score - a.score);
  const ratings = new Map<number, string>();
  if (sorted[0]) ratings.set(sorted[0].horseNumber, "◎");
  if (sorted[1]) ratings.set(sorted[1].horseNumber, "○");
  if (sorted[2]) ratings.set(sorted[2].horseNumber, "▲");
  if (sorted[3]) ratings.set(sorted[3].horseNumber, "△");
  if (sorted[4]) ratings.set(sorted[4].horseNumber, "△");
  for (let i = 5; i < sorted.length; i++) {
    if (sorted[i]) ratings.set(sorted[i]!.horseNumber, "☆");
  }
  return ratings;
}

type IndependentScoreBreakdown = Partial<Pick<ScoreBreakdown, "jockeyBonus" | "gateScore" | "bloodlineScore" | "weightScore">>;

/**
 * 年齢・基礎点・予想オッズだけで買い目を強く推さないため、馬ごとに異なる能力根拠を確認する。
 * 空の内訳は旧形式・テスト用として「未記録」と扱い、この関数で低根拠と断定しない。
 */
function hasRecordedIndependentBreakdown(candidate: { breakdown: unknown }) {
  const breakdown = candidate.breakdown as IndependentScoreBreakdown;
  return ["jockeyBonus", "gateScore", "bloodlineScore", "weightScore"].some((key) => typeof breakdown[key as keyof IndependentScoreBreakdown] === "number");
}

function hasIndependentAbilityEvidence(candidate: { breakdown: unknown }) {
  const breakdown = candidate.breakdown as IndependentScoreBreakdown;
  return ["jockeyBonus", "gateScore", "bloodlineScore", "weightScore"].some((key) => {
    const value = breakdown[key as keyof IndependentScoreBreakdown];
    return typeof value === "number" && value !== 0;
  });
}

function generateLegacyBettingRecommendation(results: PredictionResult[]): {
  trifecta: string;
  trio: string;
  quinella: string;
  wide: string;
  trifectaCount: number;
  trioCount: number;
  quinellaCount: number;
  wideCount: number;
  totalBets: number;
  reasoning: string[];
} {
  const top5 = results.slice(0, 5);
  const honmei = top5[0];
  const taikou = top5[1];
  const tanana = top5[2];
  const renka = top5.slice(3);

  const trifecta = honmei && taikou && tanana
    ? `${honmei.horseNumber}→${taikou.horseNumber}→${tanana.horseNumber}`
    : "—";

  const trio = top5.length >= 3
    ? `${top5.slice(0, 3).map(r => r.horseNumber).join("-")}（3連複1点）`
    : "—";

  const quinella = honmei && taikou
    ? `${honmei.horseNumber}-${taikou.horseNumber}`
    : "—";

  const wide = top5.length >= 3
    ? `${top5.slice(0, 3).map(r => r.horseNumber).join("-")}（ワイド3点）`
    : "—";

  const reasoning: string[] = [];
  if (honmei) {
    reasoning.push(`◎${honmei.horseName}（${honmei.horseNumber}番）: スコア${honmei.score.toFixed(1)}で最上位。${honmei.jockey ? `${honmei.jockey}騎乗` : ""}${honmei.odds ? `（単勝${honmei.odds}倍）` : ""}`);
  }
  if (taikou) {
    reasoning.push(`○${taikou.horseName}（${taikou.horseNumber}番）: スコア${taikou.score.toFixed(1)}。${taikou.breakdown.jockeyBonus > 5 ? "騎手力が強み" : ""}${taikou.breakdown.bloodlineScore > 3 ? "血統適性◎" : ""}`);
  }
  if (tanana) {
    reasoning.push(`▲${tanana.horseName}（${tanana.horseNumber}番）: スコア${tanana.score.toFixed(1)}。${tanana.breakdown.oddsScore > 5 ? "穴馬候補（過小評価）" : "実力馬"}`);
  }

  const trifectaCount = trifecta === "—" ? 0 : 1;
  const trioCount = trio === "—" ? 0 : 1;
  const quinellaCount = quinella === "—" ? 0 : 1;
  const wideCount = wide === "—" ? 0 : 3;
  return { trifecta, trio, quinella, wide, trifectaCount, trioCount, quinellaCount, wideCount, totalBets: trifectaCount + trioCount + quinellaCount + wideCount, reasoning };
}

/** 保存済みの出走馬が1〜2頭だけの時に、実在馬だけで返す暫定出力。 */
export function generatePartialBettingRecommendation(results: PredictionResult[]) {
  const recommendation = generateLegacyBettingRecommendation(results);
  const availableCount = results.length;
  const unavailable = `保存済み出走馬が${availableCount}頭のため、3連単・3連複は対象外です。未取得の馬名や馬番を追加して買い目を作成しません。`;
  const wide = availableCount >= 2
    ? `${results[0]!.horseNumber}-${results[1]!.horseNumber}（ワイド1点）`
    : "対象外（出走馬データ不足）";
  return {
    ...recommendation,
    trifecta: "対象外（出走馬データ不足）",
    trio: "対象外（出走馬データ不足）",
    trifectaCount: 0,
    trioCount: 0,
    wide,
    wideCount: availableCount >= 2 ? 1 : 0,
    totalBets: recommendation.quinellaCount + (availableCount >= 2 ? 1 : 0),
    referenceOnly: false,
    referenceNotice: "暫定個別予想：出走馬の取込途中のため、保存済みの実在馬だけを評価しています。",
    formationCaution: unavailable,
    riskWarning: "公式オッズ・組合せオッズが未取得のため、EVとトリガミ判定は未算出です。",
    reasoning: [...recommendation.reasoning, unavailable, "穴馬軸は出走馬全体と予想オッズが揃うまで暫定判定とし、無理な3連系買い目は出しません。"],
  };
}

function buildScoreFirstSideBets(formation: {
  axis: number;
  first: number[];
  second: number[];
  trioPartners: number[];
}) {
  const axes = formation.first.length > 0 ? formation.first : [formation.axis];
  const partners = Array.from(new Set([...formation.second, ...formation.trioPartners]))
    .filter((horseNumber) => !axes.includes(horseNumber))
    .slice(0, 3);
  const pairs = Array.from(new Set(
    axes.flatMap((axis) => partners
      .filter((partner) => partner !== axis)
      .map((partner) => [axis, partner].sort((left, right) => left - right).join("-"))),
  ));

  return {
    quinella: pairs.length > 0 ? pairs.join(",") : "対象外",
    wide: pairs.length > 0 ? `${pairs.join(",")}（ワイド${pairs.length}点）` : "対象外",
    quinellaCount: pairs.length,
    wideCount: pairs.length,
  };
}

export function generateBettingRecommendation(results: PredictionResult[], options: { oddsMode?: "official" | "predicted" } = {}): {
  trifecta: string;
  trio: string;
  quinella: string;
  wide: string;
  trifectaCount: number;
  trioCount: number;
  quinellaCount: number;
  wideCount: number;
  totalBets: number;
  riskWarning?: string;
  formationCaution?: string;
  formation?: { axis: number; first?: number[]; second: number[]; third: number[]; trioPartners: number[] };
  referenceOnly?: boolean;
  referenceNotice?: string;
  reasoning: string[];
} {
  const selection = selectValueCandidates(results, 0, 6);
  const scoreRanked = [...results]
    .filter((candidate) => Number.isInteger(candidate.horseNumber) && candidate.horseNumber > 0)
    .sort((left, right) => right.score - left.score);
  const createReferenceFormation = (reason: string) => {
    const formation = buildScoreFirstFormation(scoreRanked.map(candidate => ({ horseNumber: candidate.horseNumber, score: candidate.score })));
    if (!formation) return null;
    const axis = scoreRanked[0]!;
    const totalBets = formation.trifectaCount + formation.trioCount;
    const referenceNotice = "購入推奨なし：期待値または補助根拠が不足しているため、スコア順位だけを使った参考フォーメーションです。実際の購入・精算・実績集計の対象にはなりません。";
    return {
      trifecta: `参考フォーメーション: 1着${formation.first.join(",")} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`,
      trio: formation.trioCount > 0 ? `参考カバー: ${formation.first.length > 1 ? `1着候補${formation.first.join(",")}を含む ${formation.trioPartners.join(",")}` : `${formation.axis} - ${formation.trioPartners.join(",")}`}（${formation.first.length > 1 ? "分散カバー" : "1頭軸流し"}・${formation.trioCount}点）` : "対象外",
      quinella: "対象外",
      wide: "対象外",
      trifectaCount: formation.trifectaCount,
      trioCount: formation.trioCount,
      quinellaCount: 0,
      wideCount: 0,
      totalBets,
      riskWarning: formation.trigamiWarning,
      formationCaution: referenceNotice,
      formation: { axis: formation.axis, first: formation.first, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
      referenceOnly: true,
      referenceNotice,
      reasoning: [
        `通常買い目は見送り：${reason}`,
        `◎${axis.horseName}（スコア1位）を軸に、スコア上位だけで参考フォーメーションを表示`,
        referenceNotice,
      ],
    };
  };
  if (selection.skipped) {
    if (options.oddsMode === "predicted") {
      const formation = buildScoreFirstFormation(scoreRanked.map(candidate => ({ horseNumber: candidate.horseNumber, score: candidate.score })));
      if (formation) {
        const axis = scoreRanked[0]!;
        const sideBets = buildScoreFirstSideBets(formation);
        const totalBets = formation.trifectaCount + formation.trioCount + sideBets.quinellaCount + sideBets.wideCount;
        return {
          trifecta: `スコア順本線: 1着${formation.first.join(",")} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`,
          trio: formation.trioCount > 0 ? `スコア順カバー: ${formation.first.length > 1 ? `1着候補${formation.first.join(",")}を含む ${formation.trioPartners.join(",")}` : `${formation.axis} - ${formation.trioPartners.join(",")}`}（${formation.first.length > 1 ? "分散カバー" : "1頭軸流し"}・${formation.trioCount}点）` : "対象外",
          quinella: sideBets.quinella,
          wide: sideBets.wide,
          trifectaCount: formation.trifectaCount,
          trioCount: formation.trioCount,
          quinellaCount: sideBets.quinellaCount,
          wideCount: sideBets.wideCount,
          totalBets,
          riskWarning: "公式組合せオッズが未取得のため、トリガミ判定はできません。予想オッズは市場で成立した実オッズではありません。",
          formationCaution: formation.caution ?? undefined,
          formation: { axis: formation.axis, first: formation.first, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
          reasoning: [
            "公式オッズ未取得のため、能力スコア順位だけで通常フォーメーションを構成",
            formation.first.length > 1 ? `能力1・2位の差が${formation.scoreGap}点のため、${formation.first.join("・")}を1着候補へ分散し、1位不発時をカバー` : `◎${axis.horseName}（スコア1位）を1着軸に固定し、スコア2〜4位を2着、スコア2〜5位を3着候補に採用`,
            `3連単${formation.trifectaCount}点・3連複${formation.trioCount}点、合計${totalBets}点。予想オッズは市場実勢とは異なり、的中・収益を保証しません。`,
            ...(formation.caution ? [formation.caution] : []),
          ],
        };
      }
    }
    const reference = createReferenceFormation(selection.reason);
    if (reference) return reference;
    return {
      trifecta: "見送り",
      trio: "見送り",
      quinella: "対象外",
      wide: "対象外",
      trifectaCount: 0,
      trioCount: 0,
      quinellaCount: 0,
      wideCount: 0,
      totalBets: 0,
      reasoning: [selection.reason, "相対期待値が不足するレースでは、低期待値の組合せを補って購入しません"],
    };
  }

  const hasRecordedBreakdown = selection.candidates.some((candidate) => {
    const breakdown = candidate.breakdown as Partial<ScoreBreakdown>;
    return ["jockeyBonus", "gateScore", "bloodlineScore", "weightScore", "ageScore"].some((key) => typeof breakdown[key as keyof ScoreBreakdown] === "number");
  });
  const candidates = [...selection.candidates]
    .filter((candidate) => {
      if (!hasRecordedBreakdown) return true;
      const breakdown = candidate.breakdown as Partial<ScoreBreakdown>;
      // オッズや市場急変だけでなく、馬ごとに異なる補助根拠を少なくとも1つ確認する。
      return (breakdown.jockeyBonus ?? 0) > 0
        || (breakdown.gateScore ?? 0) > 0
        || (breakdown.bloodlineScore ?? 0) > 0
        || (breakdown.weightScore ?? 0) > 0
        || (breakdown.ageScore ?? 0) > 0;
    })
    .sort((a, b) => b.score - a.score);
  if (candidates.length < 3) {
    const reference = createReferenceFormation("独自ロジックによる補助根拠を確認できる候補が3頭未満");
    if (reference) return reference;
    return {
      trifecta: "見送り",
      trio: "見送り",
      quinella: "対象外",
      wide: "対象外",
      trifectaCount: 0,
      trioCount: 0,
      quinellaCount: 0,
      wideCount: 0,
      totalBets: 0,
      reasoning: [
        selection.reason,
        "市場情報だけに依存した買い目を避けるため、独自ロジックによる補助根拠を確認できる候補が3頭未満のレースは見送ります",
      ],
    };
  }
  const formation = buildScoreFirstFormation(candidates.map(candidate => ({ horseNumber: candidate.horseNumber, score: candidate.score })));
  if (!formation) {
    return {
      trifecta: "見送り", trio: "見送り", quinella: "対象外", wide: "対象外",
      trifectaCount: 0, trioCount: 0, quinellaCount: 0, wideCount: 0, totalBets: 0,
      reasoning: [selection.reason, "フォーメーションを組むための候補が不足しています"],
    };
  }
  const axis = candidates[0]!;
  const sideBets = buildScoreFirstSideBets(formation);
  const totalBets = formation.trifectaCount + formation.trioCount + sideBets.quinellaCount + sideBets.wideCount;

  return {
    trifecta: `スコア順本線: 1着${formation.first.join(",")} / 2着${formation.second.join(",")} / 3着${formation.third.join(",")}（${formation.trifectaCount}点）`,
    trio: formation.trioCount > 0 ? `スコア順カバー: ${formation.first.length > 1 ? `1着候補${formation.first.join(",")}を含む ${formation.trioPartners.join(",")}` : `${formation.axis} - ${formation.trioPartners.join(",")}`}（${formation.first.length > 1 ? "分散カバー" : "1頭軸流し"}・${formation.trioCount}点）` : "対象外",
    quinella: sideBets.quinella,
    wide: sideBets.wide,
    trifectaCount: formation.trifectaCount,
    trioCount: formation.trioCount,
    quinellaCount: sideBets.quinellaCount,
    wideCount: sideBets.wideCount,
    totalBets,
    riskWarning: formation.trigamiWarning,
    formationCaution: formation.caution ?? undefined,
    formation: { axis: formation.axis, first: formation.first, second: formation.second, third: formation.third, trioPartners: formation.trioPartners },
    reasoning: [
      selection.reason,
      formation.first.length > 1 ? `能力1・2位の差が${formation.scoreGap}点のため、${formation.first.join("・")}を1着候補へ分散し、1位不発時をカバー` : `◎${axis.horseName}（スコア1位）を1着軸に固定し、スコア2〜4位を2着、スコア2〜5位を3着候補に採用`,
      `堅実パターンは3連単${formation.trifectaCount}点・3連複${formation.trioCount}点、合計${totalBets}点・想定投資額${totalBets * 100}円（1点100円換算）。重複組合せと追加券種は不採用`,
      ...(formation.caution ? [formation.caution] : []),
      formation.trigamiWarning,
    ],
  };
}

// ==========================================
// ルーター定義
// ==========================================

export const predictionRouter = router({
  /**
   * 今週末の予想可能レースを取得
   */
  getUpcomingRaces: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstNow.toISOString().split("T")[0]!;
    const nextWeek = new Date(jstNow.getTime() + 7 * 86400000).toISOString().split("T")[0]!;

    // race_schedulesから今週末のレースを取得
    const schedules = await db
      .select()
      .from(raceSchedules)
      .where(and(
        gte(raceSchedules.raceDate, today),
        lte(raceSchedules.raceDate, nextWeek),
        sql`${raceSchedules.raceNumber} > 0`
      ))
      .orderBy(asc(raceSchedules.raceDate), asc(raceSchedules.venue), asc(raceSchedules.raceNumber));

    // racesテーブルにデータがあるか確認（出走馬確定済み）
    const racesList = await db
      .select()
      .from(races)
      .where(and(gte(races.raceDate, today), lte(races.raceDate, nextWeek)));

    const raceIdsWithEntries = racesList.map(race => race.raceId).filter(Boolean);
    const entryCountRows = raceIdsWithEntries.length > 0
      ? await db.select({ raceId: entries.raceId, entryCount: sql<number>`count(*)` })
        .from(entries)
        .where(inArray(entries.raceId, raceIdsWithEntries))
        .groupBy(entries.raceId)
      : [];
    const entryCountByRaceId = new Map(entryCountRows.map(row => [row.raceId, Number(row.entryCount)]));

    const racesMap = new Map(racesList.map(r => [`${r.raceDate}_${r.venueName}_${r.raceNumber}`, r]));

    // 予想済みレースIDを取得
    const allRaceIds = racesList.map(r => r.raceId).filter(Boolean);
    const netkeibaIds = schedules.map(s => s.netkeibaRaceId).filter(Boolean) as string[];
    const allPossibleIds = [...allRaceIds, ...netkeibaIds];
    let predictedRaceIds = new Set<string>();
    if (allPossibleIds.length > 0) {
      try {
        const existingPredictions = await db.select({ raceId: predictions.raceId })
          .from(predictions)
          .where(inArray(predictions.raceId, allPossibleIds));
        predictedRaceIds = new Set(existingPredictions.map(p => p.raceId));
      } catch (e) {
        // DBエラーは無視
      }
    }

    const scheduleKeys = new Set(schedules.map(schedule => `${schedule.raceDate}_${schedule.venue}_${schedule.raceNumber}`));
    const scheduledRaces = schedules.map(s => {
      const key = `${s.raceDate}_${s.venue}_${s.raceNumber}`;
      const raceData = racesMap.get(key);
      const raceId = raceData?.raceId ?? s.netkeibaRaceId ?? null;
      const availability = getPredictionAvailability(raceData ? entryCountByRaceId.get(raceData.raceId) : 0);
      return {
        ...s,
        hasEntries: availability.canPredict,
        entryCount: availability.entryCount,
        predictionAvailability: availability,
        raceId,
        status: availability.canPredict ? "entries_confirmed" : "entries_pending",
        hasPrediction: raceId ? predictedRaceIds.has(raceId) : false,
      };
    });

    // 公式CSVで取り込まれたJRAレースは、race_schedules未登録でも予想一覧へ表示する。
    const importedOnlyRaces = racesList
      .filter(race => race.organizer === "JRA" && !scheduleKeys.has(`${race.raceDate}_${race.venueName}_${race.raceNumber}`))
      .map(race => {
        const availability = getPredictionAvailability(entryCountByRaceId.get(race.raceId));
        return {
        id: -race.id,
        raceDate: race.raceDate,
        venue: race.venueName,
        raceNumber: race.raceNumber,
        raceName: race.raceName,
        grade: race.grade,
        distance: race.distance,
        surface: race.surface ?? "turf",
        startTime: race.postTime,
        netkeibaRaceId: race.raceId,
        horseCount: race.headCount,
        weather: race.weather,
        trackCondition: race.trackCondition,
        organizer: "JRA" as const,
        hasEntries: availability.canPredict,
        entryCount: availability.entryCount,
        predictionAvailability: availability,
        raceId: race.raceId,
        status: race.status === "results_confirmed" ? "results_confirmed" : availability.canPredict ? "entries_confirmed" : "entries_pending",
        hasPrediction: predictedRaceIds.has(race.raceId),
      };
      });

    return [...scheduledRaces, ...importedOnlyRaces].sort((a, b) =>
      `${a.raceDate}${a.venue}${String(a.raceNumber).padStart(2, "0")}`.localeCompare(`${b.raceDate}${b.venue}${String(b.raceNumber).padStart(2, "0")}`)
    );
  }),

  /**
   * 指定レースの予想を実行
   */
  runPrediction: premiumProcedure
    .input(z.object({
      raceId: z.string().optional(),
      date: z.string().optional(),
      venue: z.string().optional(),
      raceNumber: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");

      let raceId = input.raceId;
      let raceInfo: any = null;
      let raceEntries: EntryData[] = [];

      // raceIdが指定されている場合はracesテーブルから取得
      if (raceId) {
        const [race] = await db.select().from(races).where(eq(races.raceId, raceId)).limit(1);
        if (!race) throw new Error("レースが見つかりません");
        raceInfo = race;

        const entryRows = await db.select().from(entries).where(eq(entries.raceId, raceId)).orderBy(entries.horseNumber);
        raceEntries = entryRows.map(e => ({
          horseNumber: e.horseNumber,
          horseName: e.horseName,
          jockey: e.jockey,
          odds: e.odds,
          popularity: e.popularity,
          weight: e.weight,
          gateNumber: e.gateNumber,
          age: e.age,
          sex: e.sex,
          sire: e.sire,
          dam: e.dam,
          horseWeight: e.horseWeight,
          horseWeightDiff: e.horseWeightDiff,
          last3f: e.last3f,
        }));
      } else if (input.date && input.venue && input.raceNumber) {
        // スケジュールからレース情報を取得
        const [schedule] = await db.select().from(raceSchedules)
          .where(and(
            eq(raceSchedules.raceDate, input.date),
            eq(raceSchedules.venue, input.venue),
            eq(raceSchedules.raceNumber, input.raceNumber),
          ))
          .limit(1);

        if (!schedule) {
          // raceSchedulesになければracesテーブルも検索（NAR地方競馬のデータはracesテーブルに入っている）
          const [raceFromRaces] = await db.select().from(races)
            .where(and(
              eq(races.raceDate, input.date),
              eq(races.venueName, input.venue),
              eq(races.raceNumber, input.raceNumber),
            ))
            .limit(1);

          if (!raceFromRaces) throw new Error("レーススケジュールが見つかりません");

          raceId = raceFromRaces.raceId;
          raceInfo = raceFromRaces;
          const entryRows = await db.select().from(entries).where(eq(entries.raceId, raceFromRaces.raceId)).orderBy(entries.horseNumber);
          raceEntries = entryRows.map(e => ({
            horseNumber: e.horseNumber,
            horseName: e.horseName,
            jockey: e.jockey,
            odds: e.odds,
            popularity: e.popularity,
            weight: e.weight,
            gateNumber: e.gateNumber,
            age: e.age,
            sex: e.sex,
            sire: e.sire,
            dam: e.dam,
            trainer: e.trainer,
            horseWeight: e.horseWeight,
            horseWeightDiff: e.horseWeightDiff,
            last3f: e.last3f,
          }));
        } else {

        raceInfo = {
          raceId: schedule.netkeibaRaceId ?? `${input.date.replace(/-/g, "")}_${input.venue}_${input.raceNumber}`,
          raceName: schedule.raceName,
          raceDate: schedule.raceDate,
          venueName: schedule.venue,
          raceNumber: schedule.raceNumber,
          surface: schedule.surface,
          distance: schedule.distance,
          grade: schedule.grade,
          postTime: schedule.startTime,
          trackCondition: null,
          headCount: null,
        };

        // racesテーブルにデータがあれば出走馬を取得
        const [existingRace] = await db.select().from(races)
          .where(and(
            eq(races.raceDate, input.date),
            eq(races.venueName, input.venue),
            eq(races.raceNumber, input.raceNumber),
          ))
          .limit(1);

        // racesテーブルになくてもnetkeibaRaceIdがあればraceIdとして使用（予想保存用）
        if (!raceId && schedule.netkeibaRaceId) {
          raceId = schedule.netkeibaRaceId;
        }

        if (existingRace) {
          raceId = existingRace.raceId;
          raceInfo = existingRace;
          const entryRows = await db.select().from(entries).where(eq(entries.raceId, existingRace.raceId)).orderBy(entries.horseNumber);
          raceEntries = entryRows.map(e => ({
            horseNumber: e.horseNumber,
            horseName: e.horseName,
            jockey: e.jockey,
            odds: e.odds,
            popularity: e.popularity,
            weight: e.weight,
            gateNumber: e.gateNumber,
            age: e.age,
            sex: e.sex,
            sire: e.sire,
            dam: e.dam,
            horseWeight: e.horseWeight,
            horseWeightDiff: e.horseWeightDiff,
            last3f: e.last3f,
          }));
        }
        } // end else (schedule found)
      }

      if (!raceInfo) throw new Error("レース情報が取得できません");

      // 出走馬0頭は停止する。1〜2頭なら保存済みの実在馬だけで暫定個別予想を返す。
      const availability = getPredictionAvailability(raceEntries.length);
      if (!availability.canScore) {
        return {
          race: raceInfo,
          predictions: [],
          recommendation: null,
          availability,
          message: availability.message,
        };
      }

      // 騎手統計を取得
      const jockeyNames = raceEntries.map(e => e.jockey).filter(Boolean) as string[];
      const jockeyRows = jockeyNames.length > 0
        ? await db.select().from(jockeyMaster).where(sql`${jockeyMaster.name} IN (${sql.join(jockeyNames.map(n => sql`${n}`), sql`,`)})`)
        : [];
      const jockeyStats = new Map(jockeyRows.map(j => [j.name, {
        winRate: j.winRate ?? 0,
        placeRate: j.placeRate ?? 0,
        turfWinRate: j.turfWinRate ?? 0,
        dirtWinRate: j.dirtWinRate ?? 0,
        heavyWinRate: j.heavyWinRate ?? 0,
      }]));

      // 公式オッズ取込で蓄積した直近の市場急変シグナルを取得する。
      const oddsMovementScores = await Promise.all(raceEntries.map(entry =>
        getOddsMovementBonus(db, raceId ?? raceInfo.raceId, entry.horseNumber)
      ));

      // スコアリング実行
      let scoredEntries: PredictionResult[] = raceEntries.map((entry, index) => {
        const breakdown = calculateScore(entry, {
          surface: raceInfo.surface,
          distance: raceInfo.distance,
          venueName: raceInfo.venueName,
          trackCondition: raceInfo.trackCondition,
          headCount: raceInfo.headCount ?? raceEntries.length,
        }, jockeyStats);
        breakdown.oddsMovementScore = oddsMovementScores[index] ?? 0;
        breakdown.marketSignalScore = breakdown.oddsScore + breakdown.oddsMovementScore;

        return {
          horseNumber: entry.horseNumber,
          horseName: entry.horseName,
          jockey: entry.jockey,
          odds: entry.odds,
          // 推定勝率・期待値は市場要因を混ぜない能力スコアから算出する。
          score: breakdown.abilityScore,
          winProbability: 0,
          expectedValue: null,
          breakdown,
          rating: "", // 後で割り当て
        };
      });

      scoredEntries = applyPredictionMetrics(scoredEntries);
      const raceAnalysis = analyzeRaceDiagnostics(scoredEntries.map(entry => ({ score: entry.score, odds: null })));

      // スコア順にソート
      scoredEntries.sort((a, b) => b.score - a.score);

      // 発走前バッチが保存した構造化予想を最優先で採用する。
      // 未生成・失敗時は既存の決定論的スコアリングへ安全にフォールバックする。
      const structuredPrediction = raceId ? await getSavedStructuredPrediction(db, raceId) : null;
      if (structuredPrediction) {
        const selected = [structuredPrediction.prediction.winCandidate, ...structuredPrediction.prediction.placeCandidates];
        const priority = new Map(selected.map((selection, index) => [selection.horseNumber, index]));
        scoredEntries.sort((a, b) => (priority.get(a.horseNumber) ?? 99) - (priority.get(b.horseNumber) ?? 99) || b.score - a.score);
        const ratingOrder = ["◎", "○", "▲", "△"];
        for (const entry of scoredEntries) entry.rating = priority.has(entry.horseNumber) ? ratingOrder[priority.get(entry.horseNumber)!] ?? "△" : "☆";
      } else {
        const ratings = assignRatings(scoredEntries);
        for (const entry of scoredEntries) entry.rating = ratings.get(entry.horseNumber) ?? "☆";
      }

      const predictionOnlyEntries = scoredEntries.map(entry => ({ ...entry, odds: null, expectedValue: null }));
      const recommendation = availability.canGenerateCombinationBets
        ? generateBettingRecommendation(predictionOnlyEntries, { oddsMode: "predicted" })
        : generatePartialBettingRecommendation(predictionOnlyEntries);
      if (structuredPrediction) {
        recommendation.reasoning.unshift(
          "保存済みの構造化予想をスコア表示へ反映し、買い目は共通フォーメーション基準で再構成",
          structuredPrediction.prediction.summary,
          ...selectedReasoning(structuredPrediction.prediction),
          ...structuredPrediction.prediction.riskNotes,
        );
      }
      const scoreRankedHorseNumbers = [...scoredEntries]
        .sort((left, right) => right.score - left.score)
        .map(entry => entry.horseNumber);
      const predictedOddsByHorseNumber = new Map(scoredEntries.map(entry => [entry.horseNumber, entry.predictedOdds ?? null]));
      const longshotRecommendation = availability.canGenerateCombinationBets ? buildAnaBettingRecommendationForRace({
        entries: raceEntries.map(entry => ({
          ...entry,
          odds: predictedOddsByHorseNumber.get(entry.horseNumber) ?? null,
          popularity: null,
        })),
        venue: raceInfo.venueName,
        surface: raceInfo.surface,
        distance: raceInfo.distance,
        trackCondition: raceInfo.trackCondition,
        organizer: "JRA",
        scoreRankedHorseNumbers,
        oddsMode: "predicted",
      }) : {
        ...recommendation,
        reasoning: ["穴馬軸：出走馬全体と予想オッズが揃うまでは暫定判定です。", ...recommendation.reasoning],
      };

      // DBに予想を保存
      if (raceId) {
        const top3 = scoredEntries.slice(0, 3);
        const renkaNumbers = scoredEntries.slice(3, 5).map(e => e.horseNumber);
        await db.insert(predictions).values({
          raceId,
          honmei: top3[0]?.horseNumber ?? 0,
          taikou: top3[1]?.horseNumber ?? 0,
          tanana: top3[2]?.horseNumber ?? 0,
          renka: JSON.stringify(renkaNumbers),
          recommendedBets: JSON.stringify(recommendation),
          investAmount: recommendation.referenceOnly ? 0 : recommendation.totalBets * 100,
          reasoning: recommendation.reasoning.join("\n"),
        });
        const [savedPrediction] = await db
          .select({ id: predictions.id })
          .from(predictions)
          .where(eq(predictions.raceId, raceId))
          .orderBy(desc(predictions.predictedAt), desc(predictions.id))
          .limit(1);
        if (savedPrediction) {
          await savePredictionTicketSets(db, {
            predictionId: savedPrediction.id,
            raceId,
            sets: [
              { strategy: "score", ticketData: recommendation, investAmount: recommendation.referenceOnly ? 0 : recommendation.totalBets * 100 },
              { strategy: "longshot", ticketData: longshotRecommendation, investAmount: longshotRecommendation.totalBets * 100 },
            ],
          });
        }
      }

      const publicPredictions = scoredEntries.map(entry => ({
        ...entry,
        odds: entry.predictedOdds ?? null,
        expectedValue: null,
        oddsSource: "predicted" as const,
        breakdown: {
          ...entry.breakdown,
          oddsScore: 0,
          oddsMovementScore: 0,
          marketSignalScore: 0,
        },
      }));

      return {
        race: { ...raceInfo, raceId },
        availability,
        predictions: publicPredictions,
        recommendation,
        longshotRecommendation,
        raceAnalysis,
        structuredPrediction: structuredPrediction ? { ...structuredPrediction.prediction, model: structuredPrediction.model, generatedAt: structuredPrediction.generatedAt } : null,
        predictionSource: structuredPrediction ? "scheduled_structured" : "deterministic_fallback",
        message: null,
      };
    }),

  /**
   * 指定日・会場・レース番号で既存の予想結果を取得
   */
  getExistingPrediction: premiumProcedure
    .input(z.object({
      date: z.string(),
      venue: z.string(),
      raceNumber: z.number(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      // racesテーブルからraceIdを特定
      const [race] = await db.select().from(races)
        .where(and(
          eq(races.raceDate, input.date),
          eq(races.venueName, input.venue),
          eq(races.raceNumber, input.raceNumber),
        ))
        .limit(1);

      if (!race) return null;

      // 既存の予想を取得
      const [prediction] = await db.select().from(predictions)
        .where(eq(predictions.raceId, race.raceId))
        .orderBy(desc(predictions.predictedAt))
        .limit(1);

      if (!prediction) return null;

      // 出走馬データも取得
      const [entryRows, ticketSets] = await Promise.all([
        db.select().from(entries).where(eq(entries.raceId, race.raceId)).orderBy(entries.horseNumber),
        db.select().from(predictionTicketSets).where(eq(predictionTicketSets.predictionId, prediction.id)),
      ]);

      // 出馬表データの最終更新時刻を取得
      let entriesUpdatedAt: Date | null = null;
      if (entryRows.length > 0) {
        entriesUpdatedAt = entryRows.reduce((latest, e) => {
          return e.updatedAt > latest ? e.updatedAt : latest;
        }, entryRows[0].updatedAt);
      }

      return {
        race,
        prediction,
        ticketSets,
        entries: entryRows,
        entriesUpdatedAt,
      };
    }),
});

function selectedReasoning(prediction: { winCandidate: { horseName: string; rationale: string }; placeCandidates: Array<{ horseName: string; rationale: string }> }) {
  return [prediction.winCandidate, ...prediction.placeCandidates].map(selection => `${selection.horseName}: ${selection.rationale}`);
}

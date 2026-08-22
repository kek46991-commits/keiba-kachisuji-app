/**
 * 総合予想ダッシュボードRouter
 * AI・予想屋・調教師の3視点分析と体調スコアを統合
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { calculateShenConditionScore, generateShenDiagnosis } from "./paddockShenEngine.ts";
import { getDb } from "./db";
import { combinationOdds, entries, raceOdds, races, structuredPredictions } from "../drizzle/schema";
import { count, eq, isNotNull, max, sql } from "drizzle-orm";
import { buildDataQualityMetrics } from "./dataQualityPanel";
import { buildOrganizerDataCoverage, buildVenueDataCoverage } from "./dataCoverage";

/**
 * 3視点スコアの計算
 * 
 * 1. AI視点: 統計・データドリブン（ベーススコア・血統・馬場・展開予測）
 * 2. 予想屋視点: オッズ・人気・妙味・期待値
 * 3. 調教師視点: 体調・仕上がり・パドック・ローテーション
 */
interface ThreeViewScore {
  ai: {
    total: number; // 0-100
    components: {
      baseAbility: number;   // 基礎能力（過去成績）
      bloodline: number;     // 血統適性
      courseAffinity: number; // コース適性
      pacePredict: number;   // 展開予測
      classLevel: number;    // クラス補正
    };
    comment: string;
  };
  tipster: {
    total: number; // 0-100
    components: {
      oddsValue: number;     // オッズ妙味
      popularity: number;    // 人気信頼度
      expectedValue: number; // 期待値
      jockeyFactor: number;  // 騎手力
      gateFactor: number;    // 枠順有利
    };
    comment: string;
  };
  trainer: {
    total: number; // 0-100
    components: {
      condition: number;     // 体調（Shen AI）
      rotation: number;      // ローテーション
      weightTrend: number;   // 馬体重推移
      ageFitness: number;    // 年齢適性
      mentalState: number;   // 精神状態
    };
    comment: string;
  };
  overall: {
    total: number; // 0-100
    confidence: "S" | "A" | "B" | "C" | "D";
    verdict: string;
    riskFactors: string[];
    strongPoints: string[];
  };
}

export type ThreeViewAnalysisInput = {
  horseNumber: number;
  horseName: string;
  jockey: string;
  rating: string;
  odds: number | null;
  popularity: number | null;
  expectedValue: number | null;
  breakdown: any;
};

function calculateAIViewScore(breakdown: any): ThreeViewScore["ai"] {
  // ベーススコアを100点満点に正規化
  const baseAbility = Math.min(100, Math.max(0, (breakdown.base / 30) * 100));
  const bloodline = Math.min(100, Math.max(0, (breakdown.bloodlineScore / 15) * 100));
  const courseAffinity = Math.min(100, Math.max(0, ((breakdown.trackConditionScore + breakdown.gateScore) / 20) * 100));
  const pacePredict = Math.min(100, Math.max(0, ((breakdown.paceScore + 5) / 10) * 100));
  const classLevel = Math.min(100, Math.max(0, ((breakdown.classScore + 5) / 10) * 100));

  const total = Math.round(
    baseAbility * 0.35 +
    bloodline * 0.20 +
    courseAffinity * 0.20 +
    pacePredict * 0.15 +
    classLevel * 0.10
  );

  let comment = "";
  if (total >= 80) comment = "データ上、圧倒的優位。統計的に高い勝率が期待できる。";
  else if (total >= 65) comment = "データ良好。安定した上位入線が見込める。";
  else if (total >= 50) comment = "平均的な能力値。展開次第で浮上の可能性あり。";
  else if (total >= 35) comment = "データ上は苦戦必至。大きな展開利が必要。";
  else comment = "統計的に厳しい。余程の展開利がない限り上位は困難。";

  return { total, components: { baseAbility: Math.round(baseAbility), bloodline: Math.round(bloodline), courseAffinity: Math.round(courseAffinity), pacePredict: Math.round(pacePredict), classLevel: Math.round(classLevel) }, comment };
}

function calculateTipsterViewScore(breakdown: any, odds: number | null, popularity: number | null, expectedValue: number | null): ThreeViewScore["tipster"] {
  // オッズ妙味: 中穴が最も妙味あり
  let oddsValue = 50;
  if (odds) {
    if (odds >= 5 && odds <= 15) oddsValue = 90; // 中穴ゾーン
    else if (odds >= 15 && odds <= 30) oddsValue = 80; // 穴ゾーン
    else if (odds >= 3 && odds < 5) oddsValue = 70; // 中人気
    else if (odds < 3) oddsValue = 50; // 本命すぎる
    else if (odds > 30) oddsValue = 40; // 大穴すぎる
  }

  // 人気信頼度
  let popularityScore = 50;
  if (popularity) {
    if (popularity <= 2) popularityScore = 80;
    else if (popularity <= 4) popularityScore = 70;
    else if (popularity <= 6) popularityScore = 55;
    else popularityScore = 35;
  }

  // 期待値
  let evScore = 50;
  if (expectedValue !== null) {
    if (expectedValue > 30) evScore = 95;
    else if (expectedValue > 15) evScore = 80;
    else if (expectedValue > 0) evScore = 65;
    else if (expectedValue > -15) evScore = 45;
    else evScore = 25;
  }

  // 騎手力
  const jockeyFactor = Math.min(100, Math.max(0, (breakdown.jockeyBonus / 15) * 100));

  // 枠順有利
  const gateFactor = Math.min(100, Math.max(0, ((breakdown.gateScore + 5) / 10) * 100));

  const total = Math.round(
    oddsValue * 0.25 +
    popularityScore * 0.20 +
    evScore * 0.25 +
    jockeyFactor * 0.15 +
    gateFactor * 0.15
  );

  let comment = "";
  if (total >= 80) comment = "妙味十分！期待値が高く、積極的に狙いたい一頭。";
  else if (total >= 65) comment = "買い材料あり。軸候補として検討に値する。";
  else if (total >= 50) comment = "標準的な評価。ヒモとして押さえておきたい。";
  else if (total >= 35) comment = "妙味薄。オッズに対してリスクが高い。";
  else comment = "見送り推奨。過剰人気または能力不足の可能性。";

  return { total, components: { oddsValue: Math.round(oddsValue), popularity: Math.round(popularityScore), expectedValue: Math.round(evScore), jockeyFactor: Math.round(jockeyFactor), gateFactor: Math.round(gateFactor) }, comment };
}

function calculateTrainerViewScore(breakdown: any, paddockData?: any): ThreeViewScore["trainer"] {
  // 体調（Shen AI）
  let condition = 50;
  if (paddockData) {
    condition = calculateShenConditionScore(paddockData);
  } else if (breakdown.paddockScore > 0) {
    condition = Math.min(100, breakdown.paddockScore * 5);
  }

  // ローテーション（出走間隔）
  let rotation = 50;
  const intervalScore = breakdown.intervalScore ?? 0;
  rotation = Math.min(100, Math.max(0, (intervalScore + 5) / 10 * 100));

  // 馬体重推移
  let weightTrend = 50;
  const weightScore = breakdown.weightScore ?? 0;
  weightTrend = Math.min(100, Math.max(0, (weightScore + 5) / 10 * 100));

  // 年齢適性
  let ageFitness = 50;
  const ageScore = breakdown.ageScore ?? 0;
  ageFitness = Math.min(100, Math.max(0, (ageScore / 5) * 100));

  // 精神状態（パドックの集中力・興奮度から）
  let mentalState = 50;
  if (paddockData) {
    const excMap: Record<number, number> = { 1: 40, 2: 85, 3: 100, 4: 60, 5: 20 };
    const concScore = ((paddockData.concentrationLevel ?? 3) - 1) * 25;
    const excScore = excMap[paddockData.excitementLevel ?? 3] ?? 50;
    mentalState = Math.round((concScore + excScore) / 2);
  }

  const total = Math.round(
    condition * 0.35 +
    rotation * 0.20 +
    weightTrend * 0.20 +
    ageFitness * 0.10 +
    mentalState * 0.15
  );

  let comment = "";
  if (total >= 80) comment = "仕上がり絶好調。体調面で大きなアドバンテージ。";
  else if (total >= 65) comment = "順調な仕上がり。体調面に不安なし。";
  else if (total >= 50) comment = "普通の仕上がり。特に問題はないが上積みも少ない。";
  else if (total >= 35) comment = "やや不安あり。体調面でマイナス材料が見られる。";
  else comment = "体調不良の兆候。出走回避も検討すべきレベル。";

  return { total, components: { condition: Math.round(condition), rotation: Math.round(rotation), weightTrend: Math.round(weightTrend), ageFitness: Math.round(ageFitness), mentalState: Math.round(mentalState) }, comment };
}

function calculateOverallScore(ai: ThreeViewScore["ai"], tipster: ThreeViewScore["tipster"], trainer: ThreeViewScore["trainer"]): ThreeViewScore["overall"] {
  // 総合スコア: AI 40% + 予想屋 30% + 調教師 30%
  const total = Math.round(ai.total * 0.40 + tipster.total * 0.30 + trainer.total * 0.30);

  // 信頼度判定
  let confidence: "S" | "A" | "B" | "C" | "D";
  if (total >= 80) confidence = "S";
  else if (total >= 65) confidence = "A";
  else if (total >= 50) confidence = "B";
  else if (total >= 35) confidence = "C";
  else confidence = "D";

  // リスク要因
  const riskFactors: string[] = [];
  if (trainer.components.condition < 40) riskFactors.push("体調不良リスク");
  if (trainer.components.rotation < 30) riskFactors.push("過酷ローテーション");
  if (tipster.components.oddsValue < 40) riskFactors.push("オッズ妙味なし（過剰人気）");
  if (ai.components.pacePredict < 30) riskFactors.push("展開不利の可能性");
  if (trainer.components.weightTrend < 30) riskFactors.push("馬体重異常");
  if (trainer.components.mentalState < 30) riskFactors.push("精神面不安定");

  // 強み
  const strongPoints: string[] = [];
  if (ai.components.baseAbility >= 75) strongPoints.push("基礎能力が高い");
  if (ai.components.bloodline >= 70) strongPoints.push("血統適性◎");
  if (tipster.components.expectedValue >= 75) strongPoints.push("高期待値");
  if (tipster.components.jockeyFactor >= 70) strongPoints.push("騎手力◎");
  if (trainer.components.condition >= 80) strongPoints.push("絶好調");
  if (ai.components.courseAffinity >= 70) strongPoints.push("コース適性◎");

  // 総合判定コメント
  let verdict = "";
  if (confidence === "S") {
    verdict = "3視点すべてが高評価。自信を持って本命視できる一頭。積極的に軸として推奨。";
  } else if (confidence === "A") {
    verdict = "総合力が高く、安定した上位入線が期待できる。軸〜対抗として推奨。";
  } else if (confidence === "B") {
    verdict = "平均以上の評価。ヒモとして押さえておきたい存在。条件次第で浮上も。";
  } else if (confidence === "C") {
    verdict = "課題が多く、上位入線には展開利が必要。押さえ程度の評価。";
  } else {
    verdict = "現状では厳しい評価。大きな変化がない限り見送りが無難。";
  }

  return { total, confidence, verdict, riskFactors, strongPoints };
}

export function calculateThreeViewAnalyses(results: ThreeViewAnalysisInput[], paddockData?: any[]) {
  const analyses: Array<{
    horseNumber: number;
    horseName: string;
    jockey: string;
    rating: string;
    threeView: ThreeViewScore;
    shenDiagnosis: string | null;
  }> = [];

  for (const result of results) {
    const paddock = paddockData?.find(point => point.horseNumber === result.horseNumber);
    const ai = calculateAIViewScore(result.breakdown);
    const tipster = calculateTipsterViewScore(result.breakdown, result.odds, result.popularity, result.expectedValue);
    const trainer = calculateTrainerViewScore(result.breakdown, paddock);
    const overall = calculateOverallScore(ai, tipster, trainer);
    const conditionScore = paddock ? calculateShenConditionScore(paddock) : null;
    analyses.push({
      horseNumber: result.horseNumber,
      horseName: result.horseName,
      jockey: result.jockey,
      rating: result.rating,
      threeView: { ai, tipster, trainer, overall },
      shenDiagnosis: paddock && conditionScore !== null ? generateShenDiagnosis(paddock, conditionScore) : null,
    });
  }

  return analyses.sort((left, right) => right.threeView.overall.total - left.threeView.overall.total);
}

export const dashboardRouter = router({
  getVenueDataCoverage: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("データベースに接続できません。");

    const [raceRows, entryRows, winOddsRows, combinationOddsRows] = await Promise.all([
      db.select({ raceId: races.raceId, organizer: races.organizer, venueName: races.venueName, status: races.status }).from(races),
      db.selectDistinct({ raceId: entries.raceId }).from(entries),
      db.selectDistinct({ raceId: raceOdds.raceId }).from(raceOdds).where(isNotNull(raceOdds.winOdds)),
      db.selectDistinct({ raceId: combinationOdds.raceId }).from(combinationOdds),
    ]);
    const entryRaceIds = new Set(entryRows.map(row => row.raceId));
    const winOddsRaceIds = new Set(winOddsRows.map(row => row.raceId));
    const combinationOddsRaceIds = new Set(combinationOddsRows.map(row => row.raceId));
    const coverageSource = raceRows.map(row => ({
      organizer: row.organizer,
      venueName: row.venueName,
      totalRaces: 1,
      entryRaceCount: entryRaceIds.has(row.raceId) ? 1 : 0,
      winOddsRaceCount: winOddsRaceIds.has(row.raceId) ? 1 : 0,
      combinationOddsRaceCount: combinationOddsRaceIds.has(row.raceId) ? 1 : 0,
      resultsConfirmedCount: row.status === "results_confirmed" ? 1 : 0,
    }));

    return {
      generatedAt: new Date(),
      organizers: buildOrganizerDataCoverage(coverageSource),
      venues: buildVenueDataCoverage(coverageSource),
    };
  }),
  getDataQuality: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("データベースに接続できません。");

    const [[raceSummary], [entrySummary], [oddsSummary], [combinationSummary], [predictionSummary]] = await Promise.all([
      db.select({
        raceCount: count(),
        resultsConfirmedCount: sql<number>`sum(case when ${races.status} = 'results_confirmed' then 1 else 0 end)`,
        narResultsConfirmedCount: sql<number>`sum(case when ${races.status} = 'results_confirmed' and ${races.organizer} = 'NAR' then 1 else 0 end)`,
        latestRaceAt: max(races.updatedAt),
      }).from(races),
      db.select({
        entryCount: count(),
        entryRaceCount: sql<number>`count(distinct ${entries.raceId})`,
        gateCount: sql<number>`sum(case when ${entries.gateNumber} is not null then 1 else 0 end)`,
        jockeyCount: sql<number>`sum(case when ${entries.jockey} is not null and ${entries.jockey} <> '' then 1 else 0 end)`,
        weightCount: sql<number>`sum(case when ${entries.horseWeight} is not null then 1 else 0 end)`,
        latestEntryAt: max(entries.updatedAt),
      }).from(entries),
      db.select({
        winOddsRaceCount: sql<number>`count(distinct ${raceOdds.raceId})`,
        latestWinOddsAt: max(raceOdds.fetchedAt),
      }).from(raceOdds).where(isNotNull(raceOdds.winOdds)),
      db.select({
        combinationOddsRaceCount: sql<number>`count(distinct ${combinationOdds.raceId})`,
        latestCombinationOddsAt: max(combinationOdds.fetchedAt),
      }).from(combinationOdds),
      db.select({
        structuredPredictionCount: count(),
        latestPredictionAt: max(structuredPredictions.updatedAt),
      }).from(structuredPredictions).where(eq(structuredPredictions.status, "succeeded")),
    ]);

    const source = {
      raceCount: Number(raceSummary?.raceCount ?? 0),
      entryRaceCount: Number(entrySummary?.entryRaceCount ?? 0),
      entryCount: Number(entrySummary?.entryCount ?? 0),
      gateCount: Number(entrySummary?.gateCount ?? 0),
      jockeyCount: Number(entrySummary?.jockeyCount ?? 0),
      weightCount: Number(entrySummary?.weightCount ?? 0),
      structuredPredictionCount: Number(predictionSummary?.structuredPredictionCount ?? 0),
      winOddsRaceCount: Number(oddsSummary?.winOddsRaceCount ?? 0),
      combinationOddsRaceCount: Number(combinationSummary?.combinationOddsRaceCount ?? 0),
      resultsConfirmedCount: Number(raceSummary?.resultsConfirmedCount ?? 0),
      narResultsConfirmedCount: Number(raceSummary?.narResultsConfirmedCount ?? 0),
      latestRaceAt: raceSummary?.latestRaceAt ?? null,
      latestEntryAt: entrySummary?.latestEntryAt ?? null,
      latestWinOddsAt: oddsSummary?.latestWinOddsAt ?? null,
      latestCombinationOddsAt: combinationSummary?.latestCombinationOddsAt ?? null,
      latestPredictionAt: predictionSummary?.latestPredictionAt ?? null,
    };

    return { generatedAt: new Date(), metrics: buildDataQualityMetrics(source) };
  }),
  /**
   * 3視点総合分析を実行
   * narPredictionの結果を受け取り、3視点に分解して返す
   */
  getThreeViewAnalysis: publicProcedure
    .input(z.object({
      results: z.array(z.object({
        horseNumber: z.number(),
        horseName: z.string(),
        jockey: z.string(),
        gateNumber: z.number(),
        sex: z.string(),
        age: z.number(),
        weight: z.number(),
        odds: z.number().nullable(),
        popularity: z.number().nullable(),
        totalScore: z.number(),
        expectedValue: z.number().nullable(),
        breakdown: z.object({
          base: z.number(),
          jockeyBonus: z.number(),
          oddsScore: z.number(),
          gateScore: z.number(),
          trackConditionScore: z.number(),
          bloodlineScore: z.number(),
          weightScore: z.number(),
          ageScore: z.number(),
          paddockScore: z.number(),
          intervalScore: z.number(),
          classScore: z.number(),
          paceScore: z.number(),
        }),
        rating: z.string(),
      })),
      paddockData: z.array(z.object({
        horseNumber: z.number(),
        heartRate: z.number().optional(),
        horseWeight: z.number().optional(),
        weightDiff: z.number().optional(),
        sweatLevel: z.number().optional(),
        gaitScore: z.number().optional(),
        eyeBrightness: z.number().optional(),
        excitementLevel: z.number().optional(),
        concentrationLevel: z.number().optional(),
        obedienceLevel: z.number().optional(),
        fatigueLevel: z.number().optional(),
        preEjaculation: z.number().optional(),
        coatSheen: z.number().optional(),
        muscleTone: z.number().optional(),
      })).optional(),
      raceInfo: z.object({
        raceName: z.string(),
        venue: z.string(),
        distance: z.number(),
        trackCondition: z.string().optional(),
      }).optional(),
    }))
    .mutation(({ input }) => {
      const analyses: Array<{
        horseNumber: number;
        horseName: string;
        jockey: string;
        rating: string;
        threeView: ThreeViewScore;
        shenDiagnosis: string | null;
      }> = [];

      for (const result of input.results) {
        const paddock = input.paddockData?.find(p => p.horseNumber === result.horseNumber);

        const ai = calculateAIViewScore(result.breakdown);
        const tipster = calculateTipsterViewScore(result.breakdown, result.odds, result.popularity, result.expectedValue);
        const trainer = calculateTrainerViewScore(result.breakdown, paddock);
        const overall = calculateOverallScore(ai, tipster, trainer);

        let shenDiagnosis: string | null = null;
        if (paddock) {
          const condScore = calculateShenConditionScore(paddock);
          shenDiagnosis = generateShenDiagnosis(paddock, condScore);
        }

        analyses.push({
          horseNumber: result.horseNumber,
          horseName: result.horseName,
          jockey: result.jockey,
          rating: result.rating,
          threeView: { ai, tipster, trainer, overall },
          shenDiagnosis,
        });
      }

      // overall.totalでソート
      analyses.sort((a, b) => b.threeView.overall.total - a.threeView.overall.total);

      return { analyses };
    }),
});

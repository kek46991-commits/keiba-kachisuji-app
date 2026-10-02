/**
 * 総合予想ダッシュボード（AI・予想屋・調教師の3視点分析）の表示用型。
 * スコアはいずれも0〜100で、信頼度はS〜Dランク。
 */
export type ConfidenceLevel = "S" | "A" | "B" | "C" | "D";

export interface AiViewScore {
  total: number;
  comment: string;
  components: {
    baseAbility: number;
    bloodline: number;
    courseAffinity: number;
    pacePredict: number;
    classLevel: number;
  };
}

export interface TipsterViewScore {
  total: number;
  comment: string;
  components: {
    oddsValue: number;
    popularity: number;
    expectedValue: number;
    jockeyFactor: number;
    gateFactor: number;
  };
}

export interface TrainerViewScore {
  total: number;
  comment: string;
  components: {
    condition: number;
    rotation: number;
    weightTrend: number;
    ageFitness: number;
    mentalState: number;
  };
}

export interface OverallViewScore {
  total: number;
  confidence: ConfidenceLevel;
  verdict: string;
  strongPoints: string[];
  riskFactors: string[];
}

export interface HorseAnalysis {
  horseNumber: number;
  horseName: string;
  jockey: string;
  /** ◎○▲△☆ の印 */
  rating: string;
  threeView: {
    ai: AiViewScore;
    tipster: TipsterViewScore;
    trainer: TrainerViewScore;
    overall: OverallViewScore;
  };
  /** Shen AI体調診断。診断が無い場合は null */
  shenDiagnosis: string | null;
}

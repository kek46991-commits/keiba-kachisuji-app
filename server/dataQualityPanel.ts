export type DataQualityStatus = "available" | "partial" | "unavailable";

export type DataQualityMetric = {
  key: "entries" | "ability" | "market" | "ev" | "condition" | "combination" | "localBias" | "results";
  label: string;
  status: DataQualityStatus;
  usedInAnalysis: boolean;
  detail: string;
  lastUpdatedAt: Date | null;
};

export type DataQualitySnapshot = {
  raceCount: number;
  entryRaceCount: number;
  entryCount: number;
  gateCount: number;
  jockeyCount: number;
  weightCount: number;
  structuredPredictionCount: number;
  winOddsRaceCount: number;
  combinationOddsRaceCount: number;
  resultsConfirmedCount: number;
  narResultsConfirmedCount: number;
  latestRaceAt: Date | null;
  latestEntryAt: Date | null;
  latestWinOddsAt: Date | null;
  latestCombinationOddsAt: Date | null;
  latestPredictionAt: Date | null;
};

function coverageStatus(covered: number, total: number): DataQualityStatus {
  if (covered <= 0) return "unavailable";
  return total > 0 && covered < total ? "partial" : "available";
}

function fieldStatus(covered: number, total: number): DataQualityStatus {
  if (covered <= 0) return "unavailable";
  return total > 0 && covered < total ? "partial" : "available";
}

export function buildDataQualityMetrics(snapshot: DataQualitySnapshot): DataQualityMetric[] {
  const entryStatus = coverageStatus(snapshot.entryRaceCount, snapshot.raceCount);
  const abilityStatus = coverageStatus(snapshot.structuredPredictionCount, snapshot.raceCount);
  const winOddsStatus = coverageStatus(snapshot.winOddsRaceCount, snapshot.raceCount);
  const evStatus: DataQualityStatus = snapshot.structuredPredictionCount <= 0 || snapshot.winOddsRaceCount <= 0
    ? "unavailable"
    : "partial";
  const conditionStatus = fieldStatus(snapshot.weightCount, snapshot.entryCount);
  const localBiasStatus: DataQualityStatus = snapshot.narResultsConfirmedCount >= 30 ? "available" : "unavailable";

  return [
    { key: "entries", label: "出馬表・枠・騎手", status: entryStatus, usedInAnalysis: entryStatus !== "unavailable", detail: `${snapshot.entryRaceCount}/${snapshot.raceCount}レース、枠 ${snapshot.gateCount}/${snapshot.entryCount}頭、騎手 ${snapshot.jockeyCount}/${snapshot.entryCount}頭`, lastUpdatedAt: snapshot.latestEntryAt },
    { key: "ability", label: "能力評価", status: abilityStatus, usedInAnalysis: abilityStatus !== "unavailable", detail: `構造化予想 ${snapshot.structuredPredictionCount}レースを保存。未生成レースは能力評価を表示しません。`, lastUpdatedAt: snapshot.latestPredictionAt },
    { key: "market", label: "公式単勝オッズ", status: winOddsStatus, usedInAnalysis: winOddsStatus !== "unavailable", detail: `${snapshot.winOddsRaceCount}/${snapshot.raceCount}レースで公式単勝オッズを保存。`, lastUpdatedAt: snapshot.latestWinOddsAt },
    { key: "ev", label: "EV（期待値）", status: evStatus, usedInAnalysis: evStatus !== "unavailable", detail: evStatus === "unavailable" ? "推定勝率または公式単勝オッズが不足しています。" : "推定勝率と公式単勝オッズが揃うレースだけで算出します。", lastUpdatedAt: snapshot.latestWinOddsAt },
    { key: "condition", label: "状態・馬体重", status: conditionStatus, usedInAnalysis: conditionStatus !== "unavailable", detail: `馬体重 ${snapshot.weightCount}/${snapshot.entryCount}頭。未取得分は状態評価へ加算しません。`, lastUpdatedAt: snapshot.latestEntryAt },
    { key: "combination", label: "組合せオッズ", status: coverageStatus(snapshot.combinationOddsRaceCount, snapshot.raceCount), usedInAnalysis: snapshot.combinationOddsRaceCount > 0, detail: snapshot.combinationOddsRaceCount > 0 ? `${snapshot.combinationOddsRaceCount}レースで3連単・3連複オッズを保存。` : "公式組合せオッズが未取込のため、トリガミ判定は保留です。", lastUpdatedAt: snapshot.latestCombinationOddsAt },
    { key: "localBias", label: "地方コース・枠順バイアス", status: localBiasStatus, usedInAnalysis: localBiasStatus === "available", detail: localBiasStatus === "available" ? `地方確定結果 ${snapshot.narResultsConfirmedCount}レースを基に算出。` : `地方確定結果 ${snapshot.narResultsConfirmedCount}レース。必要標本30レース未満のため反映していません。`, lastUpdatedAt: snapshot.latestRaceAt },
    { key: "results", label: "公式確定結果", status: coverageStatus(snapshot.resultsConfirmedCount, snapshot.raceCount), usedInAnalysis: snapshot.resultsConfirmedCount > 0, detail: `${snapshot.resultsConfirmedCount}/${snapshot.raceCount}レースの確定結果を保存。`, lastUpdatedAt: snapshot.latestRaceAt },
  ];
}

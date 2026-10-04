export type PendingRaceExplanationInput = {
  date: string;
  venue: string;
  raceNumber: number;
  entryCount: number;
  minimumEntryCount: number;
};

export type PendingRaceExplanation = {
  title: string;
  status: string;
  availableNow: string[];
  pendingItems: string[];
  notPublished: string[];
};

/**
 * 出馬表が未取込の段階で、公開可能な範囲だけを整理する。
 * 馬名・枠順・騎手・オッズを補完せず、個別の予想や買い目には使わない。
 */
export function buildPendingRaceExplanation(input: PendingRaceExplanationInput): PendingRaceExplanation {
  const missingEntries = Math.max(0, input.minimumEntryCount - input.entryCount);

  return {
    title: `${input.venue} ${input.raceNumber}R｜暫定レース条件の見立て`,
    status: `保存済み出走馬は${input.entryCount}頭です。個別スコアリングには少なくとも${input.minimumEntryCount}頭が必要なため、あと${missingEntries}頭以上の利用可能な出馬表データが必要です。`,
    availableNow: [
      `${input.date}・${input.venue}・${input.raceNumber}Rとして開催単位を確認済みです。`,
      "コース・距離・馬場状態・枠順・騎手・馬体重が揃った後に、能力スコアと穴馬評価を計算します。",
      "公式市場オッズが未連携の間は、利用可能な出馬表があるレースに限り予想オッズモードで表示します。",
    ],
    pendingItems: [
      "出走馬・馬番・騎手の確定情報",
      "距離・コース・馬場状態などのレース条件",
      "枠順、馬体重、公式市場オッズ（連携許諾後）",
    ],
    notPublished: [
      "個別の本命・穴馬・勝率順位",
      "馬名を含むスコア順・穴馬軸の買い目",
      "EV、トリガミ判定、公式オッズを前提とする数値",
    ],
  };
}

export const MINIMUM_ENTRIES_FOR_PREDICTION = 1;
export const MINIMUM_ENTRIES_FOR_COMBINATION_BETS = 3;

export type PredictionAvailability = {
  entryCount: number;
  minimumEntryCount: number;
  canPredict: boolean;
  canScore: boolean;
  canGenerateCombinationBets: boolean;
  isPartialEntryList: boolean;
  message: string;
};

/**
 * 出走馬の氏名・馬番を補完せず、保存済みの出馬表だけで予想できるかを判定する。
 * 1頭以上なら個別の暫定スコアを算出するが、3頭未満では3連系フォーメーションを生成しない。
 */
export function getPredictionAvailability(entryCount: number | null | undefined): PredictionAvailability {
  const normalizedEntryCount = Number.isFinite(entryCount)
    ? Math.max(0, Math.floor(entryCount as number))
    : 0;

  if (normalizedEntryCount >= MINIMUM_ENTRIES_FOR_PREDICTION) {
    const canGenerateCombinationBets = normalizedEntryCount >= MINIMUM_ENTRIES_FOR_COMBINATION_BETS;
    return {
      entryCount: normalizedEntryCount,
      minimumEntryCount: MINIMUM_ENTRIES_FOR_PREDICTION,
      canPredict: true,
      canScore: true,
      canGenerateCombinationBets,
      isPartialEntryList: !canGenerateCombinationBets,
      message: canGenerateCombinationBets
        ? "保存済みの出馬表データを用いて予想できます。"
        : `保存済みの出走馬${normalizedEntryCount}頭だけで暫定個別予想を表示します。3連系の買い目には${MINIMUM_ENTRIES_FOR_COMBINATION_BETS}頭以上が必要です。`,
    };
  }

  return {
    entryCount: normalizedEntryCount,
    minimumEntryCount: MINIMUM_ENTRIES_FOR_PREDICTION,
    canPredict: false,
    canScore: false,
    canGenerateCombinationBets: false,
    isPartialEntryList: false,
    message: normalizedEntryCount === 0
      ? "このレースは、利用可能な出走馬データがまだ保存されていません。出走馬名・馬番を創作して予想や買い目を表示することはしません。"
      : "利用可能な出走馬データを確認できません。",
  };
}

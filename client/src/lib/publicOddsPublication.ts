export type PublicOddsRow = {
  odds: number | null;
  expectedValue: number | null;
};

/**
 * 公開用の公式オッズ連携がない期間は、能力スコア由来の予想オッズだけを表示する。
 * 予想オッズは市場で成立した公式オッズではないため、EVと市場シグナルには利用しない。
 */
export const publicOddsPublicationState = "predicted_until_official_contract" as const;

export const publicOddsPublicationNotice =
  "現在のオッズは能力スコアから算出した予想オッズです。公式オッズではないため、EV・市場シグナル・トリガミ判定は算出しません。";

export function maskUnlicensedPublicOdds<T extends PublicOddsRow>(rows: T[]): T[] {
  return rows.map(row => ({ ...row, expectedValue: null }));
}

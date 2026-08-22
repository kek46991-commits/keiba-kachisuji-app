const PERSONAL_JRA_VAN_FILE_NAME = /(?:target|jra[-_ ]?van|jv[-_ ]?link)/i;
const TARGET_EXPORT_SIGNATURE = /(?:時刻フラグ|出力時刻)/.test.bind(/(?:時刻フラグ|出力時刻)/);

export function assertPublicOddsImportAllowed(content: string, fileName?: string) {
  const looksLikeTargetExport = TARGET_EXPORT_SIGNATURE(content)
    && /(?:レースID|race_id)/i.test(content)
    && /(?:単勝オッズ|win_odds)/i.test(content);

  if (PERSONAL_JRA_VAN_FILE_NAME.test(fileName ?? "") || looksLikeTargetExport) {
    throw new Error("TARGET/Data Lab.の個人分析用CSVは公開サイトへ取り込めません。公開表示が明示的に許可された提供元のファイルだけを使用してください。");
  }
}

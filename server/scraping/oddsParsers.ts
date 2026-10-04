/**
 * 単勝オッズ・人気のパーサー。
 * 中央は netkeiba のオッズAPI（JSON）、地方は地方競馬情報サイト（keiba.go.jp）の出馬表HTMLを解析する。
 * いずれも未発表（0.0や空欄）のときは値を返さず、架空のオッズを作らない。
 */

export type ParsedOdds = {
  horseNumber: number;
  odds: number;
  popularity: number | null;
};

/** 地方競馬情報サイトの場コード（netkeibaの場コード -> keiba.go.jpのk_babaCode） */
export const NAR_BABA_CODE_BY_NETKEIBA_CODE: Record<string, string> = {
  "30": "36", // 門別
  "35": "10", // 盛岡
  "36": "11", // 水沢
  "42": "18", // 浦和
  "43": "19", // 船橋
  "44": "20", // 大井
  "45": "21", // 川崎
  "46": "22", // 金沢
  "47": "23", // 笠松
  "48": "24", // 名古屋
  "50": "27", // 園田
  "51": "28", // 姫路
  "54": "31", // 高知
  "55": "32", // 佐賀
  "65": "3", // 帯広（ばんえい）
};

/**
 * netkeibaオッズAPIのレスポンスから単勝オッズを取り出す。
 * data.odds["1"] が単勝で、キーが馬番（ゼロ埋め）、値が [オッズ, 複勝下限, 人気] の配列。
 */
export function parseNetkeibaOddsApi(body: string): ParsedOdds[] {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return [];
  }
  if (typeof payload !== "object" || payload === null) return [];
  const data = (payload as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return [];
  const oddsRoot = (data as { odds?: unknown }).odds;
  if (typeof oddsRoot !== "object" || oddsRoot === null) return [];
  const win = (oddsRoot as Record<string, unknown>)["1"];
  if (typeof win !== "object" || win === null) return [];

  const parsed: ParsedOdds[] = [];
  for (const [key, value] of Object.entries(win as Record<string, unknown>)) {
    const horseNumber = Number(key);
    if (!Number.isInteger(horseNumber) || horseNumber <= 0) continue;
    if (!Array.isArray(value)) continue;
    const odds = Number(value[0]);
    const popularity = Number(value[2]);
    if (!Number.isFinite(odds) || odds <= 0) continue;
    parsed.push({
      horseNumber,
      odds,
      popularity: Number.isInteger(popularity) && popularity > 0 ? popularity : null,
    });
  }
  return parsed.sort((a, b) => a.horseNumber - b.horseNumber);
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * keiba.go.jp の出馬表HTMLから馬番ごとの単勝オッズ・人気を取り出す。
 * 各馬のブロックに「馬番」セルと `class="odds_weight"` セル（例: `12.3 (4人気)`）が並ぶ。
 */
export function parseNarOfficialOdds(html: string): ParsedOdds[] {
  const rowPattern = /<td[^>]*class="[^"]*\bhorseNum\b[^"]*"[^>]*>([\s\S]*?)<\/td>([\s\S]*?)<td[^>]*class="[^"]*\bodds_weight\b[^"]*"[^>]*>([\s\S]*?)<\/td>/g;
  const parsed: ParsedOdds[] = [];
  const seen = new Set<number>();

  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const horseNumber = Number(stripTags(match[1] ?? ""));
    const oddsCell = stripTags(match[3] ?? "");
    if (!Number.isInteger(horseNumber) || horseNumber <= 0 || seen.has(horseNumber)) continue;

    const oddsMatch = oddsCell.match(/(\d+(?:\.\d+)?)/);
    const popularityMatch = oddsCell.match(/\((\d+)\s*人気\)/);
    const odds = oddsMatch ? Number(oddsMatch[1]) : NaN;
    // 未発表のときは空欄または 0.0 になるため取り込まない
    if (!Number.isFinite(odds) || odds <= 0) continue;

    seen.add(horseNumber);
    parsed.push({
      horseNumber,
      odds,
      popularity: popularityMatch ? Number(popularityMatch[1]) : null,
    });
  }

  return parsed.sort((a, b) => a.horseNumber - b.horseNumber);
}

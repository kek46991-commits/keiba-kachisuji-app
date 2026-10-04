/**
 * 予想データに保存されたダミー馬名（馬A、馬B…）を、出走表マスターの本物の馬名へ
 * 表示時点で解決するための純粋関数群。
 * 保存済みデータは書き換えず、API/表示レイヤーだけで置換する。
 */

export type RaceEntryMasterRow = {
  horseNumber: number;
  horseName: string;
};

export type HorseNameMap = Map<number, string>;

const DUMMY_HORSE_NAME_PATTERN = /^馬[A-Za-z]$|^(?:テスト|ダミー)馬?[0-9A-Za-z]+$/;

/** 出走表マスター行から「馬番 → 本物の馬名」の対応表を作る。 */
export function buildHorseNameMap(rows: readonly RaceEntryMasterRow[]): HorseNameMap {
  const map: HorseNameMap = new Map();
  for (const row of rows) {
    if (!Number.isInteger(row.horseNumber) || row.horseNumber <= 0) continue;
    const name = row.horseName.trim();
    if (!name) continue;
    map.set(row.horseNumber, name);
  }
  return map;
}

/** 馬名がダミー識別子かどうかを判定する。 */
export function isDummyHorseName(horseName: string): boolean {
  return DUMMY_HORSE_NAME_PATTERN.test(horseName.trim());
}

/**
 * 1頭分の表示名を解決する。
 * 馬番で出走表マスターに一致すればその馬名を、無ければ元の馬名をそのまま返す。
 */
export function resolveHorseName(
  entry: { horseNumber: number; horseName: string },
  nameMap: HorseNameMap,
): string {
  return nameMap.get(entry.horseNumber) ?? entry.horseName;
}

/** 予想行の配列に displayName（解決後の馬名）を付与する。 */
export function withResolvedHorseNames<T extends { horseNumber: number; horseName: string }>(
  entries: readonly T[],
  nameMap: HorseNameMap,
): Array<T & { displayName: string }> {
  return entries.map((entry) => ({ ...entry, displayName: resolveHorseName(entry, nameMap) }));
}

/**
 * 予想根拠テキストなど、馬名が文章に埋め込まれた文字列を置換する。
 * 「馬A」→「シャンドゥルール」のように、長いダミー名から順に一括置換する。
 */
export function restoreHorseNamesInText(
  text: string,
  entries: readonly { horseNumber: number; horseName: string }[],
  nameMap: HorseNameMap,
): string {
  const replacements = entries
    .map((entry) => ({ from: entry.horseName.trim(), to: nameMap.get(entry.horseNumber) }))
    .filter((pair): pair is { from: string; to: string } => Boolean(pair.from && pair.to && pair.from !== pair.to))
    .sort((left, right) => right.from.length - left.from.length);
  if (replacements.length === 0) return text;
  const pattern = new RegExp(replacements.map((pair) => escapeRegExp(pair.from)).join("|"), "g");
  const lookup = new Map(replacements.map((pair) => [pair.from, pair.to]));
  return text.replace(pattern, (matched) => lookup.get(matched) ?? matched);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

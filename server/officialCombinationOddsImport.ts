import { parseCsvLine } from "./officialOddsImport";

export type CombinationBetType = "trio" | "trifecta";

export type OfficialCombinationOddsRow = {
  betType: CombinationBetType;
  combination: string;
  odds: number;
};

export type OfficialCombinationOddsPayload = {
  raceId: string;
  odds: OfficialCombinationOddsRow[];
};

const HEADER_ALIASES = {
  raceId: ["race_id", "raceid", "レースid", "レースID", "レースＩＤ"],
  betType: ["bet_type", "bettype", "券種", "賭式", "式別", "bet"],
  combination: ["combination", "組合せ", "組み合わせ", "組番", "買い目"],
  odds: ["odds", "組合せオッズ", "組み合わせオッズ", "オッズ", "倍率"],
} as const;

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function columnIndex(headers: string[], field: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[field].map(normalizeHeader);
  return headers.findIndex(header => aliases.includes(normalizeHeader(header)));
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(String(value).replace(/,/g, "").replace(/倍$/, "").trim());
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeBetType(value: unknown): CombinationBetType | null {
  const normalized = String(value ?? "").replace(/\s+/g, "").toLowerCase();
  if (["trio", "3連複", "三連複"].includes(normalized)) return "trio";
  if (["trifecta", "3連単", "三連単"].includes(normalized)) return "trifecta";
  return null;
}

export function normalizeCombination(value: unknown, betType: CombinationBetType): string {
  const numbers = String(value ?? "").match(/\d+/g)?.map(Number) ?? [];
  if (numbers.length !== 3 || numbers.some(number => !Number.isInteger(number) || number < 1 || number > 18) || new Set(numbers).size !== 3) {
    throw new Error("組合せは重複しない1〜18の馬番3頭で指定してください。");
  }
  return (betType === "trio" ? [...numbers].sort((left, right) => left - right) : numbers).join("-");
}

export function validateCombinationOddsRows(raceId: string, rows: unknown[]): OfficialCombinationOddsPayload {
  if (!/^\d{8,32}$/.test(raceId)) throw new Error("レースIDは8〜32桁の数字で指定してください。");
  if (rows.length === 0) throw new Error("組合せオッズ行が見つかりません。");
  if (rows.length > 10_000) throw new Error("1回に取り込める組合せオッズは10,000行までです。");

  const seen = new Set<string>();
  const odds = rows.map((raw, index) => {
    const row = raw as Record<string, unknown>;
    const betType = normalizeBetType(row.betType ?? row.bet_type ?? row["券種"] ?? row["賭式"]);
    if (!betType) throw new Error(`${index + 1}行目: 券種は3連複または3連単だけを指定してください。`);
    const combination = normalizeCombination(row.combination ?? row["組合せ"] ?? row["組み合わせ"] ?? row["組番"], betType);
    const oddsValue = parseNumber(row.odds ?? row["組合せオッズ"] ?? row["組み合わせオッズ"] ?? row["オッズ"]);
    if (!oddsValue || oddsValue < 1 || oddsValue > 9_999_999) throw new Error(`${index + 1}行目: 組合せオッズは1.0〜9999999.0で指定してください。`);
    const key = `${betType}:${combination}`;
    if (seen.has(key)) throw new Error(`${index + 1}行目: ${betType} ${combination} が重複しています。`);
    seen.add(key);
    return { betType, combination, odds: oddsValue };
  });
  return { raceId, odds };
}

export function parseOfficialCombinationOddsContent(content: string, format: "csv" | "json", fallbackRaceId?: string): OfficialCombinationOddsPayload {
  if (content.length > 2 * 1024 * 1024) throw new Error("ファイルサイズは2MB以下にしてください。");
  if (format === "json") {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rows = Array.isArray(parsed.combinationOdds) ? parsed.combinationOdds : Array.isArray(parsed.odds) ? parsed.odds : Array.isArray(parsed.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
    return validateCombinationOddsRows(String(parsed.raceId ?? parsed.race_id ?? fallbackRaceId ?? ""), rows);
  }

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("ヘッダー行と1行以上の組合せオッズを含むCSVを指定してください。");
  const headers = parseCsvLine(lines[0]!);
  const raceIdColumn = columnIndex(headers, "raceId");
  const betTypeColumn = columnIndex(headers, "betType");
  const combinationColumn = columnIndex(headers, "combination");
  const oddsColumn = columnIndex(headers, "odds");
  if (betTypeColumn < 0 || combinationColumn < 0 || oddsColumn < 0) {
    throw new Error("CSVには「券種」「組合せ」「組合せオッズ」（または bet_type / combination / odds）列が必要です。");
  }
  const rows = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    return { betType: values[betTypeColumn], combination: values[combinationColumn], odds: values[oddsColumn] };
  });
  const raceId = raceIdColumn >= 0 ? String(parseCsvLine(lines[1]!)[raceIdColumn] ?? "") : fallbackRaceId ?? "";
  return validateCombinationOddsRows(raceId, rows);
}

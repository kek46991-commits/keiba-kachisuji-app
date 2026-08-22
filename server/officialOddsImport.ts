export type OfficialOddsRow = {
  horseNumber: number;
  horseName?: string;
  winOdds: number;
  placeOddsMin?: number;
  placeOddsMax?: number;
  popularity?: number;
};

export type OfficialOddsPayload = {
  raceId: string;
  odds: OfficialOddsRow[];
};

const HEADER_ALIASES: Record<keyof OfficialOddsRow | "raceId", string[]> = {
  raceId: ["race_id", "raceid", "レースid", "レースID", "レースＩＤ"],
  horseNumber: ["horse_number", "horsenumber", "馬番"],
  horseName: ["horse_name", "horsename", "馬名"],
  winOdds: ["win_odds", "winodds", "単勝オッズ", "単勝", "odds", "オッズ"],
  placeOddsMin: ["place_odds_min", "placeoddsmin", "複勝下限", "複勝オッズ下限"],
  placeOddsMax: ["place_odds_max", "placeoddsmax", "複勝上限", "複勝オッズ上限"],
  popularity: ["popularity", "人気", "人気順"],
};

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, "").toLowerCase();
}

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(String(value).replace(/,/g, "").replace(/倍$/, "").trim());
  return Number.isFinite(number) ? number : undefined;
}

export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function headerIndex(headers: string[], field: keyof typeof HEADER_ALIASES): number {
  const aliases = HEADER_ALIASES[field].map(normalizeHeader);
  return headers.findIndex(header => aliases.includes(normalizeHeader(header)));
}

export function validateOddsRows(raceId: string, rows: unknown[]): OfficialOddsPayload {
  if (!/^\d{8,32}$/.test(raceId)) {
    throw new Error("レースIDは8〜32桁の数字で指定してください。");
  }
  if (rows.length === 0) throw new Error("オッズ行が見つかりません。");
  if (rows.length > 30) throw new Error("1回に取り込めるのは30頭までです。");

  const seen = new Set<number>();
  const odds: OfficialOddsRow[] = rows.map((raw, index) => {
    const row = raw as Record<string, unknown>;
    const horseNumber = toNumber(row.horseNumber ?? row["馬番"]);
    const winOdds = toNumber(row.winOdds ?? row.win_odds ?? row["単勝オッズ"] ?? row.odds ?? row["オッズ"]);
    if (!horseNumber || !Number.isInteger(horseNumber) || horseNumber < 1 || horseNumber > 18) {
      throw new Error(`${index + 1}行目: 馬番は1〜18の整数で指定してください。`);
    }
    if (seen.has(horseNumber)) throw new Error(`${index + 1}行目: 馬番${horseNumber}が重複しています。`);
    seen.add(horseNumber);
    if (!winOdds || winOdds < 1 || winOdds > 9999) {
      throw new Error(`${index + 1}行目: 単勝オッズは1.0〜9999.0で指定してください。`);
    }
    const placeOddsMin = toNumber(row.placeOddsMin ?? row.place_odds_min ?? row["複勝下限"]);
    const placeOddsMax = toNumber(row.placeOddsMax ?? row.place_odds_max ?? row["複勝上限"]);
    const popularity = toNumber(row.popularity ?? row["人気"] ?? row["人気順"]);
    return {
      horseNumber,
      horseName: typeof (row.horseName ?? row.horse_name ?? row["馬名"]) === "string" ? String(row.horseName ?? row.horse_name ?? row["馬名"]).trim() : undefined,
      winOdds,
      ...(placeOddsMin ? { placeOddsMin } : {}),
      ...(placeOddsMax ? { placeOddsMax } : {}),
      ...(popularity && Number.isInteger(popularity) ? { popularity } : {}),
    };
  });
  return { raceId, odds };
}

export function parseOfficialOddsContent(content: string, format: "csv" | "json", fallbackRaceId?: string): OfficialOddsPayload {
  if (content.length > 2 * 1024 * 1024) throw new Error("ファイルサイズは2MB以下にしてください。");

  if (format === "json") {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    const rows = Array.isArray(parsed.odds) ? parsed.odds : Array.isArray(parsed.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
    return validateOddsRows(String(parsed.raceId ?? parsed.race_id ?? fallbackRaceId ?? ""), rows);
  }

  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("ヘッダー行と1行以上のオッズ行を含むCSVを指定してください。");
  const headers = parseCsvLine(lines[0]!);
  const raceIdColumn = headerIndex(headers, "raceId");
  const horseNumberColumn = headerIndex(headers, "horseNumber");
  const winOddsColumn = headerIndex(headers, "winOdds");
  if (horseNumberColumn < 0 || winOddsColumn < 0) {
    throw new Error("CSVには「馬番」と「単勝オッズ」（または horse_number / win_odds）列が必要です。");
  }
  const rowObjects = lines.slice(1).map(line => {
    const values = parseCsvLine(line);
    const object: Record<string, unknown> = {};
    headers.forEach((header, index) => { object[header] = values[index] ?? ""; });
    object.horseNumber = values[horseNumberColumn];
    object.winOdds = values[winOddsColumn];
    const horseNameColumn = headerIndex(headers, "horseName");
    const placeMinColumn = headerIndex(headers, "placeOddsMin");
    const placeMaxColumn = headerIndex(headers, "placeOddsMax");
    const popularityColumn = headerIndex(headers, "popularity");
    if (horseNameColumn >= 0) object.horseName = values[horseNameColumn];
    if (placeMinColumn >= 0) object.placeOddsMin = values[placeMinColumn];
    if (placeMaxColumn >= 0) object.placeOddsMax = values[placeMaxColumn];
    if (popularityColumn >= 0) object.popularity = values[popularityColumn];
    return object;
  });
  const detectedRaceId = raceIdColumn >= 0 ? String(parseCsvLine(lines[1]!)[raceIdColumn] ?? "") : fallbackRaceId ?? "";
  return validateOddsRows(detectedRaceId, rowObjects);
}

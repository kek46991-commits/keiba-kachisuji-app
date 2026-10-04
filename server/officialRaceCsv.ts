type CsvKind = "race" | "entry" | "payout";

type AliasMap = Record<string, string[]>;

const ALIASES: Record<CsvKind, AliasMap> = {
  race: {
    venue: ["競馬場", "競馬場名", "競走場", "場名", "開催場", "開催競馬場", "venue", "venue_name"],
    date: ["競走年月日", "開催年月日", "開催日", "レース日", "race_date", "date"],
    raceNumber: ["レース番号", "競走番号", "レースNo", "R", "race_number", "race_no"],
    postTime: ["発走時刻", "発走", "start_time", "post_time"],
    raceType: ["競走種類名称", "競走種類", "条件", "race_type"],
    raceName: ["レース名", "競走名", "race_name"],
    surface: ["芝ダート区分", "コース", "馬場種別", "surface"],
    direction: ["回り", "方向", "direction"],
    distance: ["距離", "距離m", "distance"],
    weather: ["天候", "weather"],
    track: ["馬場", "馬場状態", "track_condition", "condition"],
    count: ["頭数", "出走頭数", "horse_count", "head_count"],
    prize: ["賞金", "1着賞金", "prize_money"],
  },
  entry: {
    venue: ["競馬場", "競馬場名", "競走場", "場名", "開催場", "開催競馬場", "venue", "venue_name"],
    date: ["競走年月日", "開催年月日", "開催日", "レース日", "race_date", "date"],
    raceNumber: ["レース番号", "競走番号", "レースNo", "R", "race_number", "race_no"],
    gate: ["枠番", "枠", "gate_number", "gate"],
    horseNumber: ["馬番", "horse_number", "horse_no"],
    horseName: ["馬名", "競走馬名", "horse_name"],
    sex: ["性", "性別", "sex"],
    age: ["齢", "年齢", "age"],
    sire: ["父馬名", "父", "sire"],
    dam: ["母馬名", "母", "dam"],
    jockey: ["騎手名", "騎手", "jockey"],
    weight: ["負担重量", "斤量", "weight"],
    horseWeight: ["馬体重", "horse_weight"],
    horseWeightDiff: ["馬体重増減", "体重増減", "horse_weight_diff"],
    finish: ["着順", "finish_position", "finish"],
    time: ["タイム", "走破タイム", "finish_time"],
    margin: ["着差", "margin"],
    last3f: ["上がり3F", "上がり", "last3f"],
    popularity: ["人気", "人気順", "popularity"],
  },
  payout: {
    venue: ["競馬場", "競馬場名", "競走場", "場名", "開催場", "開催競馬場", "venue", "venue_name"],
    date: ["競走年月日", "開催年月日", "開催日", "レース日", "race_date", "date"],
    raceNumber: ["レース番号", "競走番号", "レースNo", "R", "race_number", "race_no"],
    betType: ["賭式", "券種", "bet_type"],
    combination: ["組番", "組合せ", "組み合わせ", "combination"],
    payout: ["払戻金", "払戻", "payout"],
    popularity: ["人気", "人気順", "popularity"],
  },
};

function normalized(value: string): string {
  return value.trim().replace(/[\s　_\-]/g, "").toLowerCase();
}

function indexOf(headers: string[], aliases: string[]): number {
  const targets = aliases.map(normalized);
  return headers.findIndex(header => targets.includes(normalized(header)));
}

function valueAt(values: string[], headers: string[], aliases: string[]): string {
  const index = indexOf(headers, aliases);
  return index >= 0 ? values[index] ?? "" : "";
}

/**
 * ヘッダー付きのJRA/NAR公式CSVを既存取込処理の位置形式に正規化する。
 * 必須の識別列が見つからない場合は、従来の位置形式としてそのまま返す。
 */
export function normalizeOfficialCsvRows(rows: string[][], hasHeader: boolean, kind: CsvKind): string[][] {
  if (!hasHeader) return rows;
  const [headers, ...data] = rows;
  if (!headers) return [];
  const aliases = ALIASES[kind];
  const hasIdentity = indexOf(headers, aliases.venue) >= 0
    && indexOf(headers, aliases.date) >= 0
    && indexOf(headers, aliases.raceNumber) >= 0;
  if (!hasIdentity) return data;

  return data.map(values => {
    if (kind === "race") {
      return [
        valueAt(values, headers, aliases.venue), valueAt(values, headers, aliases.date), valueAt(values, headers, aliases.raceNumber),
        valueAt(values, headers, aliases.postTime), valueAt(values, headers, aliases.raceType), valueAt(values, headers, aliases.raceName),
        valueAt(values, headers, aliases.surface), valueAt(values, headers, aliases.direction), valueAt(values, headers, aliases.distance),
        valueAt(values, headers, aliases.weather), valueAt(values, headers, aliases.track), valueAt(values, headers, aliases.count), "", valueAt(values, headers, aliases.prize),
      ];
    }
    if (kind === "payout") {
      return [valueAt(values, headers, aliases.venue), valueAt(values, headers, aliases.date), valueAt(values, headers, aliases.raceNumber), valueAt(values, headers, aliases.betType), valueAt(values, headers, aliases.combination), valueAt(values, headers, aliases.payout), valueAt(values, headers, aliases.popularity)];
    }

    const output = new Array<string>(28).fill("");
    output[0] = valueAt(values, headers, aliases.venue);
    output[1] = valueAt(values, headers, aliases.date);
    output[2] = valueAt(values, headers, aliases.raceNumber);
    output[3] = valueAt(values, headers, aliases.gate);
    output[4] = valueAt(values, headers, aliases.horseNumber);
    output[5] = valueAt(values, headers, aliases.horseName);
    output[6] = valueAt(values, headers, aliases.sex);
    output[7] = valueAt(values, headers, aliases.age);
    output[10] = valueAt(values, headers, aliases.sire);
    output[11] = valueAt(values, headers, aliases.dam);
    output[13] = valueAt(values, headers, aliases.jockey);
    output[15] = valueAt(values, headers, aliases.weight);
    output[21] = valueAt(values, headers, aliases.horseWeight);
    output[22] = valueAt(values, headers, aliases.horseWeightDiff);
    output[23] = valueAt(values, headers, aliases.finish);
    output[24] = valueAt(values, headers, aliases.time);
    output[25] = valueAt(values, headers, aliases.margin);
    output[26] = valueAt(values, headers, aliases.last3f);
    output[27] = valueAt(values, headers, aliases.popularity);
    return output;
  });
}

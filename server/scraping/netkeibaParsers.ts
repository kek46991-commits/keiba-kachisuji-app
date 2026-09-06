/**
 * netkeiba（中央: race.netkeiba.com / 地方: nar.netkeiba.com）のHTMLパーサ。
 * DOM構造の変化を検知できるよう、必須要素が取れない場合は parse_error として扱う。
 */
import * as cheerio from "cheerio";
import { ScrapeError } from "./netkeibaHttp";

export type ParsedRaceListItem = {
  netkeibaRaceId: string;
  venueName: string;
  venueCode: string;
  raceNumber: number;
  raceName: string;
  postTime: string | null;
  surface: "turf" | "dirt" | "steeplechase" | null;
  distance: number | null;
  headCount: number | null;
  grade: string | null;
};

export type ParsedEntry = {
  horseNumber: number;
  gateNumber: number | null;
  horseName: string;
  sex: string | null;
  age: number | null;
  weight: number | null;
  jockey: string | null;
  trainer: string | null;
  odds: number | null;
  popularity: number | null;
  horseWeight: number | null;
  horseWeightDiff: number | null;
};

export type ParsedResultRow = {
  finishPosition: number | null;
  horseNumber: number;
  gateNumber: number | null;
  horseName: string;
  finishTime: number | null;
  margin: string | null;
  last3f: number | null;
  cornerPositions: string | null;
  odds: number | null;
  popularity: number | null;
};

export type ParsedPayout = {
  betType: "win" | "place" | "quinella" | "exacta" | "wide" | "trio" | "trifecta";
  combination: string;
  payout: number;
  popularity: number | null;
};

const GRADE_BY_ICON: Record<string, string> = { "1": "G1", "2": "G2", "3": "G3", "4": "重賞", "5": "OP" };

const text = (value: string | undefined | null) => (value ?? "").replace(/\s+/g, " ").trim();
const toInt = (value: string) => {
  const matched = value.replace(/,/g, "").match(/-?\d+/);
  return matched ? Number(matched[0]) : null;
};
const toFloat = (value: string) => {
  const matched = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return matched ? Number(matched[0]) : null;
};

function venueCodeFromRaceId(netkeibaRaceId: string) {
  return netkeibaRaceId.slice(4, 6);
}

function parseSurfaceDistance(raceData: string) {
  const matched = raceData.match(/(芝|ダ|障)\s*(\d{3,4})\s*m/);
  if (!matched) return { surface: null, distance: null } as const;
  const surface = matched[1] === "芝" ? "turf" : matched[1] === "ダ" ? "dirt" : "steeplechase";
  return { surface, distance: Number(matched[2]) } as const;
}

/** レース一覧（race_list_sub.html）を解析する。中央・地方で同じ構造を使う。 */
export function parseRaceList(html: string, url: string): ParsedRaceListItem[] {
  const $ = cheerio.load(html);
  const blocks = $("dl.RaceList_DataList");
  if (blocks.length === 0) {
    // 開催が無い日はレースブロックも開催一覧も存在しない。DOM変化と区別するため一覧要素の有無で判定する。
    if ($(".RaceList_Box, .RaceList_ProviderBox, #RaceTopRace").length === 0) {
      throw new ScrapeError("parse_error", url, "レース一覧要素(dl.RaceList_DataList / .RaceList_Box)が見つかりません");
    }
    return [];
  }

  const items: ParsedRaceListItem[] = [];
  blocks.each((_, block) => {
    const $block = $(block);
    const venueName = text($block.find("p.RaceList_DataTitle").clone().children("small").remove().end().text());
    $block.find("li.RaceList_DataItem").each((__, item) => {
      const $item = $(item);
      const href = $item.find("a").first().attr("href") ?? "";
      const idMatch = href.match(/race_id=(\d{10,14})/);
      if (!idMatch) return;
      const netkeibaRaceId = idMatch[1]!;
      const raceNumber = toInt(text($item.find(".Race_Num").text()));
      if (raceNumber === null) return;
      const raceData = text($item.find(".RaceData").text());
      const { surface, distance } = parseSurfaceDistance(raceData);
      const postTime = raceData.match(/(\d{1,2}:\d{2})/);
      const headCount = raceData.match(/(\d+)\s*頭/);
      const iconClass = $item.find('[class*="Icon_GradeType"]').first().attr("class") ?? "";
      const iconMatch = iconClass.match(/Icon_GradeType(\d+)/);
      items.push({
        netkeibaRaceId,
        venueName: venueName || "不明",
        venueCode: venueCodeFromRaceId(netkeibaRaceId),
        raceNumber,
        raceName: text($item.find(".ItemTitle").first().text()) || `${raceNumber}R`,
        postTime: postTime ? postTime[1]!.padStart(5, "0") : null,
        surface,
        distance,
        headCount: headCount ? Number(headCount[1]) : null,
        grade: iconMatch ? (GRADE_BY_ICON[iconMatch[1]!] ?? null) : null,
      });
    });
  });
  return items;
}

/** 出馬表（shutuba.html）を解析する。未発表の場合は空配列を返す。 */
export function parseShutuba(html: string, url: string): ParsedEntry[] {
  const $ = cheerio.load(html);
  const rows = $("tr.HorseList");
  if (rows.length === 0) {
    if ($(".Shutuba_Table, .ShutubaTable, #All_Race_Table").length === 0) {
      throw new ScrapeError("parse_error", url, "出馬表テーブル(.Shutuba_Table / tr.HorseList)が見つかりません");
    }
    return [];
  }

  const entries: ParsedEntry[] = [];
  rows.each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    const horseNumber = toInt(text($row.find('td[class*="Umaban"]').first().text()));
    const horseName = text($row.find("span.HorseName a").first().text()) || text($row.find("span.HorseName").first().text());
    if (horseNumber === null || horseName === "") return;
    const sexAge = text($row.find("span.Barei").first().text()) || text(cells.eq(4).text());
    const sexAgeMatch = sexAge.match(/(牡|牝|セ|騙)\s*(\d+)/);
    const weightCell = text(cells.eq(5).text());
    const oddsText = text($row.find('td[id^="odds-"], td.Popular_Ninki, span.Odds').first().text()) || text(cells.eq(9).text());
    const popularityText = text($row.find("td.Popular span").first().text()) || text(cells.eq(10).text());
    const horseWeightText = text($row.find("td.Weight").first().text());
    const horseWeightMatch = horseWeightText.match(/(\d+)\s*\(([-+]?\d+)\)/);
    entries.push({
      horseNumber,
      gateNumber: toInt(text($row.find('td[class*="Waku"]').first().text())),
      horseName,
      sex: sexAgeMatch ? sexAgeMatch[1]! : null,
      age: sexAgeMatch ? Number(sexAgeMatch[2]) : null,
      weight: toFloat(weightCell),
      jockey: text($row.find("td.Jockey a").first().text()) || null,
      trainer: text($row.find("td.Trainer a").first().text()) || null,
      odds: toFloat(oddsText),
      popularity: toInt(popularityText),
      horseWeight: horseWeightMatch ? Number(horseWeightMatch[1]) : toInt(horseWeightText),
      horseWeightDiff: horseWeightMatch ? Number(horseWeightMatch[2]) : null,
    });
  });
  return entries;
}

/** レース結果（result.html）の全着順テーブルを解析する。未確定なら空配列を返す。 */
export function parseResultRows(html: string, url: string): ParsedResultRow[] {
  const $ = cheerio.load(html);
  // 中央は tr.HorseList、地方は class 無しの tr なので着順セルの有無で判定する
  const rows = $("table#All_Result_Table tr").filter((_, row) => $(row).find("td.Result_Num, div.Rank").length > 0);
  if (rows.length === 0) {
    if ($("#All_Result_Table, .ResultTableWrap, .RaceTable01").length === 0) {
      throw new ScrapeError("parse_error", url, "結果テーブル(#All_Result_Table)が見つかりません");
    }
    return [];
  }

  const results: ParsedResultRow[] = [];
  rows.each((_, row) => {
    const $row = $(row);
    const cells = $row.find("td");
    const horseNumber = toInt(text(cells.eq(2).text()));
    const horseName = text($row.find("span.Horse_Name a").first().text()) || text($row.find("span.Horse_Name").first().text());
    if (horseNumber === null || horseName === "") return;
    const rank = text($row.find("div.Rank").first().text());
    const times = $row.find("span.RaceTime");
    const timeText = text(times.eq(0).text());
    results.push({
      finishPosition: /^\d+$/.test(rank) ? Number(rank) : null,
      horseNumber,
      gateNumber: toInt(text(cells.eq(1).text())),
      horseName,
      finishTime: parseFinishTime(timeText),
      margin: text(times.eq(1).text()) || null,
      last3f: toFloat(text($row.find("td.Time.BgYellow").first().text())),
      cornerPositions: text($row.find("td.PassageRate").first().text()) || null,
      odds: toFloat(text($row.find("span.Odds_Ninki").first().text()) || text($row.find("td.Odds").last().text())),
      popularity: toInt(text($row.find("span.OddsPeople").first().text())),
    });
  });
  return results;
}

function parseFinishTime(value: string) {
  const matched = value.match(/(?:(\d+):)?(\d+(?:\.\d+)?)/);
  if (!matched) return null;
  const minutes = matched[1] ? Number(matched[1]) : 0;
  return minutes * 60 + Number(matched[2]);
}

const PAYOUT_ROW_TYPES: Array<{ rowClass: string; betType: ParsedPayout["betType"]; legs: number }> = [
  { rowClass: "Tansho", betType: "win", legs: 1 },
  { rowClass: "Fukusho", betType: "place", legs: 1 },
  { rowClass: "Umaren", betType: "quinella", legs: 2 },
  { rowClass: "Umatan", betType: "exacta", legs: 2 },
  { rowClass: "Wide", betType: "wide", legs: 2 },
  { rowClass: "Fuku3", betType: "trio", legs: 3 },
  { rowClass: "Tan3", betType: "trifecta", legs: 3 },
];

/** 確定払戻（result.html の払い戻しテーブル）を解析する。 */
export function parsePayouts(html: string, url: string): ParsedPayout[] {
  const $ = cheerio.load(html);
  const tables = $("table.Payout_Detail_Table");
  if (tables.length === 0) return [];

  const payouts: ParsedPayout[] = [];
  for (const { rowClass, betType, legs } of PAYOUT_ROW_TYPES) {
    tables.find(`tr.${rowClass}`).each((_, row) => {
      const $row = $(row);
      const amounts = text($row.find("td.Payout").html()?.replace(/<br\s*\/?>/g, "\n") ?? "")
        .split(/\s/)
        .map((chunk) => toInt(chunk))
        .filter((value): value is number => value !== null && value > 0);
      const popularities = $row
        .find("td.Ninki span")
        .map((__, span) => toInt(text($(span).text())))
        .get();
      const combinations = legs === 1
        ? $row
            .find("td.Result div span")
            .map((__, span) => text($(span).text()))
            .get()
            .filter((value) => value !== "")
        : $row
            .find("td.Result ul")
            .map((__, ul) =>
              $(ul)
                .find("li span")
                .map((___, span) => text($(span).text()))
                .get()
                .filter((value) => value !== "")
                .join("-"),
            )
            .get()
            .filter((value) => value !== "");

      if (combinations.length === 0) {
        throw new ScrapeError("parse_error", url, `払戻(${betType})の組み合わせを解析できません`);
      }
      combinations.forEach((combination, index) => {
        const payout = amounts[index];
        if (payout === undefined) return;
        payouts.push({ betType, combination, payout, popularity: popularities[index] ?? null });
      });
    });
  }
  return payouts;
}

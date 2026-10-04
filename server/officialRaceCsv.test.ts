import { describe, expect, it } from "vitest";
import { normalizeOfficialCsvRows } from "./officialRaceCsv";

describe("normalizeOfficialCsvRows", () => {
  it("日本語ヘッダーのレースCSVを既存取込の位置形式へ変換する", () => {
    const [row] = normalizeOfficialCsvRows([
      ["競馬場", "開催日", "R", "発走時刻", "レース名", "コース", "距離", "天候", "馬場", "頭数"],
      ["園田", "2026/08/12", "10", "19:20", "サンプル特別", "ダート", "1400", "晴", "良", "12"],
    ], true, "race");
    expect(row?.slice(0, 12)).toEqual(["園田", "2026/08/12", "10", "19:20", "", "サンプル特別", "ダート", "", "1400", "晴", "良", "12"]);
  });

  it("日本語ヘッダーの出馬表CSVを馬番・馬名・騎手の位置形式へ変換する", () => {
    const [row] = normalizeOfficialCsvRows([
      ["競馬場", "開催日", "R", "枠番", "馬番", "馬名", "性", "齢", "騎手", "斤量"],
      ["東京", "2026-08-12", "5", "3", "6", "テストホース", "牡", "3", "テスト騎手", "57"],
    ], true, "entry");
    expect(row?.[0]).toBe("東京");
    expect(row?.[4]).toBe("6");
    expect(row?.[5]).toBe("テストホース");
    expect(row?.[13]).toBe("テスト騎手");
  });

  it("地方競馬で使われる競走場・開催年月日・競走番号・競走馬名の見出しを認識する", () => {
    const [row] = normalizeOfficialCsvRows([
      ["競走場", "開催年月日", "競走番号", "枠", "馬番", "競走馬名", "騎手", "斤量", "着順", "人気"],
      ["園田", "2026-08-12", "10", "5", "10", "カネミツエース", "テスト騎手", "56", "1", "9"],
    ], true, "entry");
    expect(row?.[0]).toBe("園田");
    expect(row?.[1]).toBe("2026-08-12");
    expect(row?.[2]).toBe("10");
    expect(row?.[5]).toBe("カネミツエース");
    expect(row?.[23]).toBe("1");
  });
});

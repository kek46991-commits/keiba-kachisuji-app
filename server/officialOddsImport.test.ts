import { describe, expect, it } from "vitest";
import { parseOfficialOddsContent } from "./officialOddsImport";

describe("officialOddsImport", () => {
  it("日本語ヘッダーの公式オッズCSVを検証済みの構造へ変換する", () => {
    const content = "レースID,馬番,馬名,単勝オッズ,複勝下限,複勝上限,人気\n202608120501,1,テストホース,3.4,1.2,1.6,2\n202608120501,2,テストホース2,8.1,2.1,3.2,5";
    expect(parseOfficialOddsContent(content, "csv")).toEqual({
      raceId: "202608120501",
      odds: [
        { horseNumber: 1, horseName: "テストホース", winOdds: 3.4, placeOddsMin: 1.2, placeOddsMax: 1.6, popularity: 2 },
        { horseNumber: 2, horseName: "テストホース2", winOdds: 8.1, placeOddsMin: 2.1, placeOddsMax: 3.2, popularity: 5 },
      ],
    });
  });

  it("TARGET frontier JVの標準オッズCSVヘッダーと追加列を受け付ける", () => {
    const content = "レースID,頭数,時刻フラグ,時刻,馬番,枠番,馬名,単勝オッズ,複勝オッズ下限,複勝オッズ上限,出力時刻\n202608120501,2,1,1200,1,1,テストホース,3.4,1.2,1.6,202608121200\n202608120501,2,1,1200,2,2,テストホース2,8.1,2.1,3.2,202608121200";
    expect(parseOfficialOddsContent(content, "csv")).toEqual({
      raceId: "202608120501",
      odds: [
        { horseNumber: 1, horseName: "テストホース", winOdds: 3.4, placeOddsMin: 1.2, placeOddsMax: 1.6 },
        { horseNumber: 2, horseName: "テストホース2", winOdds: 8.1, placeOddsMin: 2.1, placeOddsMax: 3.2 },
      ],
    });
  });

  it("CSVに必須列がない場合は保存前に拒否する", () => {
    expect(() => parseOfficialOddsContent("レースID,馬名\n202608120501,テスト", "csv")).toThrow("馬番");
  });

  it("JSONファイルをフォールバックのレースIDで受け付ける", () => {
    const content = JSON.stringify({ odds: [{ horseNumber: 1, winOdds: 2.8 }] });
    expect(parseOfficialOddsContent(content, "json", "202608120501")).toMatchObject({
      raceId: "202608120501",
      odds: [{ horseNumber: 1, winOdds: 2.8 }],
    });
  });
});

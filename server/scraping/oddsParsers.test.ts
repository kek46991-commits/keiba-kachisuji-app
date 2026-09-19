import { describe, expect, it } from "vitest";
import { parseNarOfficialOdds, parseNetkeibaOddsApi } from "./oddsParsers";

describe("parseNetkeibaOddsApi", () => {
  it("単勝オッズと人気を馬番順に返す", () => {
    const body = JSON.stringify({
      status: "middle",
      data: {
        official_datetime: "2026-09-20 07:55:07",
        odds: {
          "1": { "01": ["24.7", "0", "6"], "02": ["5.4", "0", "2"], "03": ["1.6", "0", "1"] },
          "2": { "01": ["3.3", "13.1", "6"] },
        },
      },
    });

    expect(parseNetkeibaOddsApi(body)).toEqual([
      { horseNumber: 1, odds: 24.7, popularity: 6 },
      { horseNumber: 2, odds: 5.4, popularity: 2 },
      { horseNumber: 3, odds: 1.6, popularity: 1 },
    ]);
  });

  it("オッズ未発売のレスポンスでは空配列を返す", () => {
    expect(parseNetkeibaOddsApi(JSON.stringify({ status: "NG", data: "", reason: "empty free odds schedule" }))).toEqual([]);
    expect(parseNetkeibaOddsApi("<html>error</html>")).toEqual([]);
  });
});

describe("parseNarOfficialOdds", () => {
  const html = `
    <tr class="tBorder">
      <td rowspan="5" class="courseNum course_01"> 1</td>
      <td rowspan="5" class="horseNum">1</td>
      <td colspan="3"><a class="horseName">リケアルンバ</a></td>
      <td class="odds_weight" rowspan="2"> 12.3 <br>(4人気)</td>
    </tr>
    <tr class="tBorder">
      <td rowspan="5" class="courseNum course_02"> 2</td>
      <td rowspan="5" class="horseNum">2</td>
      <td colspan="3"><a class="horseName">テストホース</a></td>
      <td class="odds_weight" rowspan="2"> 1.8 <br>(1人気)</td>
    </tr>
  `;

  it("馬番ごとの単勝オッズと人気を取り出す", () => {
    expect(parseNarOfficialOdds(html)).toEqual([
      { horseNumber: 1, odds: 12.3, popularity: 4 },
      { horseNumber: 2, odds: 1.8, popularity: 1 },
    ]);
  });

  it("未発表（空欄や0.0）は取り込まない", () => {
    const pending = `
      <tr><td class="horseNum">1</td><td class="odds_weight"> </td></tr>
      <tr><td class="horseNum">2</td><td class="odds_weight">0.0 (1人気)</td></tr>
    `;
    expect(parseNarOfficialOdds(pending)).toEqual([]);
  });
});

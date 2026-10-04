import { describe, expect, it } from "vitest";
import { ScrapeError } from "./netkeibaHttp";
import { parseRaceList, parsePayouts, parseResultRows } from "./netkeibaParsers";

const raceListHtml = `
<dl class="RaceList_DataList">
  <dt><p class="RaceList_DataTitle"><small>4回</small> 中山 <small>2日目</small></p></dt>
  <dd>
    <ul>
      <li class="RaceList_DataItem">
        <a href="../race/shutuba.html?race_id=202606050101">
          <div class="Race_Num"><span>1</span>R</div>
          <span class="ItemTitle">2歳未勝利</span>
          <span class="RaceData">09:55 / ダ1200m / 天候:晴 / 12頭</span>
        </a>
      </li>
    </ul>
  </dd>
</dl>`;

const narResultHtml = `
<div class="ResultTableWrap">
<table id="All_Result_Table">
<tbody>
<tr class="Header"><th class="Result_Num">着順</th></tr>
<tr>
  <td class="Result_Num"><div class="Rank">1</div></td>
  <td class="Num Waku1"><div>3</div></td>
  <td class="Num Waku"><div>4</div></td>
  <td class="Horse_Info"><span class="Horse_Name"><a href="#">ナインスマイル</a></span></td>
  <td class="Time"><span class="RaceTime">1:28.8</span></td>
  <td class="Time"><span class="RaceTime">クビ</span></td>
  <td class="Odds Txt_C"><span class="OddsPeople">6</span></td>
  <td class="Odds Txt_R"><span>25.3</span></td>
</tr>
</tbody>
</table>
</div>
<table class="Payout_Detail_Table">
<tbody>
<tr class="Tansho"><td class="Result"><div><span>4</span></div></td><td class="Payout"><span>2,530円</span></td><td class="Ninki"><span>6人気</span></td></tr>
<tr class="Tan3"><td class="Result"><ul><li><span>4</span></li><li><span>5</span></li><li><span>6</span></li></ul></td><td class="Payout"><span>21,830円</span></td><td class="Ninki"><span>65人気</span></td></tr>
</tbody>
</table>`;

describe("parseRaceList", () => {
  it("開催場・レース番号・netkeibaレースIDを抽出する", () => {
    const [item] = parseRaceList(raceListHtml, "https://race.netkeiba.com/top/race_list_sub.html");
    expect(item).toMatchObject({
      netkeibaRaceId: "202606050101",
      venueName: "中山",
      venueCode: "06",
      raceNumber: 1,
      raceName: "2歳未勝利",
      postTime: "09:55",
      surface: "dirt",
      distance: 1200,
      headCount: 12,
    });
  });

  it("一覧の構造が見つからない場合は parse_error を投げる", () => {
    expect(() => parseRaceList("<html><body>maintenance</body></html>", "https://example.com")).toThrowError(ScrapeError);
  });
});

describe("parseResultRows", () => {
  it("class を持たない地方競馬の着順行も解析する", () => {
    const rows = parseResultRows(narResultHtml, "https://nar.netkeiba.com/race/result.html");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      finishPosition: 1,
      horseNumber: 4,
      gateNumber: 3,
      horseName: "ナインスマイル",
      odds: 25.3,
      popularity: 6,
    });
  });

  it("着順が未確定のページでは空配列を返す", () => {
    expect(parseResultRows('<div class="ResultTableWrap"><table id="All_Result_Table"></table></div>', "https://example.com")).toEqual([]);
  });
});

describe("parsePayouts", () => {
  it("単勝・3連単の確定払戻を抽出する", () => {
    expect(parsePayouts(narResultHtml, "https://nar.netkeiba.com/race/result.html")).toEqual([
      { betType: "win", combination: "4", payout: 2530, popularity: 6 },
      { betType: "trifecta", combination: "4-5-6", payout: 21830, popularity: 65 },
    ]);
  });

  it("払戻テーブルが無い場合は空配列を返す", () => {
    expect(parsePayouts("<html></html>", "https://example.com")).toEqual([]);
  });
});

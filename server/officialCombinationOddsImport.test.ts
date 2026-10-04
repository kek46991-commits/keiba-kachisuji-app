import { describe, expect, it } from "vitest";
import { parseOfficialCombinationOddsContent } from "./officialCombinationOddsImport";

describe("officialCombinationOddsImport", () => {
  it("公式CSVの3連単・3連複組合せオッズを正規化して取り込む", () => {
    const content = "レースID,券種,組合せ,組合せオッズ\n202608160501,3連複,5-1-3,24.6\n202608160501,3連単,5-1-3,180.4";
    expect(parseOfficialCombinationOddsContent(content, "csv")).toEqual({
      raceId: "202608160501",
      odds: [
        { betType: "trio", combination: "1-3-5", odds: 24.6 },
        { betType: "trifecta", combination: "5-1-3", odds: 180.4 },
      ],
    });
  });

  it("対象外券種と重複組合せを保存前に拒否する", () => {
    expect(() => parseOfficialCombinationOddsContent("レースID,券種,組合せ,組合せオッズ\n202608160501,馬連,1-2,5.1", "csv")).toThrow("3連複または3連単");
    expect(() => parseOfficialCombinationOddsContent("レースID,券種,組合せ,組合せオッズ\n202608160501,3連複,1-2-3,12\n202608160501,3連複,3-2-1,14", "csv")).toThrow("重複");
  });
});

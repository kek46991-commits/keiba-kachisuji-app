import { describe, expect, it } from "vitest";
import { evaluateTrigamiRisk, expandFormationTickets } from "./combinationOddsRisk";

const formation = { axis: 1, second: [2, 3], third: [2, 3, 4], trioPartners: [2, 3] };

describe("combinationOddsRisk", () => {
  it("フォーメーションを重複のない3連単・3連複組合せへ展開する", () => {
    expect(expandFormationTickets(formation)).toEqual(expect.arrayContaining([
      { betType: "trifecta", combination: "1-2-3" },
      { betType: "trifecta", combination: "1-2-4" },
      { betType: "trifecta", combination: "1-3-2" },
      { betType: "trio", combination: "1-2-3" },
    ]));
    expect(expandFormationTickets(formation)).toHaveLength(5);
  });

  it("全組合せの最低想定払戻が投資を下回る場合にトリガミリスクを返す", () => {
    const tickets = expandFormationTickets(formation);
    const quotes = tickets.map(ticket => ({ ...ticket, odds: 3 }));
    const evaluation = evaluateTrigamiRisk(formation, quotes);
    expect(evaluation).toMatchObject({ status: "risk", totalTickets: 5, totalInvest: 500, minimumPayout: 300, missingTickets: 0 });
  });

  it("組合せオッズが不足する場合は安全と断定せず判定保留を返す", () => {
    const evaluation = evaluateTrigamiRisk(formation, [{ betType: "trifecta", combination: "1-2-3", odds: 20 }]);
    expect(evaluation).toMatchObject({ status: "partial", coveredTickets: 1, missingTickets: 4 });
    expect(evaluation.message).toContain("保留");
  });
});

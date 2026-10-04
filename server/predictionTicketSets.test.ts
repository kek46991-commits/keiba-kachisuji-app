import { describe, expect, it } from "vitest";
import { readTicketSelections, ticketStrategyLabels } from "./predictionTicketSets";

describe("prediction ticket-set strategy labels", () => {
  it("keeps score and longshot ticket sets distinct", () => {
    expect(ticketStrategyLabels.score).toBe("スコア順買い目");
    expect(ticketStrategyLabels.longshot).toBe("穴馬買い目");
    expect(ticketStrategyLabels.score).not.toBe(ticketStrategyLabels.longshot);
  });

  it("reads only recorded ticket selections for detailed history display", () => {
    expect(readTicketSelections(JSON.stringify({
      trifecta: "1着1 / 2着2,3 / 3着2,3,4",
      wide: "1-4, 2-4",
      totalBets: 8,
    }))).toEqual([
      { betType: "trifecta", label: "3連単", selection: "1着1 / 2着2,3 / 3着2,3,4" },
      { betType: "wide", label: "ワイド", selection: "1-4, 2-4" },
    ]);
    expect(readTicketSelections(null)).toEqual([]);
  });

  it("does not expose purchase-disabled reference formations as recorded tickets", () => {
    expect(readTicketSelections(JSON.stringify({
      referenceOnly: true,
      totalBets: 12,
      trifecta: "参考フォーメーション: 1着1 / 2着2,3,4 / 3着2,3,4,5",
    }))).toEqual([]);
  });
});

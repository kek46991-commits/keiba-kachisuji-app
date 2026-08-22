import { describe, expect, it } from "vitest";
import { buildRaceDetailReconciliation } from "./raceDetailReconciliation";

describe("過去レース詳細の予想・公式結果照合", () => {
  it("保存済み買い目と公式払戻から券種別の的中・払戻・収支を構成する", () => {
    const detail = buildRaceDetailReconciliation({
      prediction: {
        recommendedBets: JSON.stringify({ totalBets: 2, trifecta: "1着1 / 2着2 / 3着3（1点）", wide: "1-2（補助1点）" }),
        investAmount: 200,
        returnAmount: 1380,
        isHit: true,
      },
      officialPayouts: [
        { betType: "trifecta", combination: "1-2-3", payout: 1200 },
        { betType: "wide", combination: "1-2", payout: 180 },
      ],
      entries: [
        { horseNumber: 1, finishPosition: 1 },
        { horseNumber: 2, finishPosition: 2 },
        { horseNumber: 3, finishPosition: 3 },
      ],
    });

    expect(detail.state).toBe("settled");
    expect(detail.topThree).toEqual([{ position: 1, horseNumber: 1 }, { position: 2, horseNumber: 2 }, { position: 3, horseNumber: 3 }]);
    expect(detail.profitAmount).toBe(1180);
    expect(detail.tickets).toEqual(expect.arrayContaining([
      expect.objectContaining({ betType: "trifecta", isHit: true, returnAmount: 1200 }),
      expect.objectContaining({ betType: "wide", isHit: true, returnAmount: 180 }),
    ]));
  });

  it("公式払戻が不足する場合は未精算理由を返す", () => {
    const detail = buildRaceDetailReconciliation({
      prediction: { recommendedBets: JSON.stringify({ totalBets: 1, wide: "1-2（補助1点）" }), investAmount: 100, returnAmount: null, isHit: null },
      officialPayouts: [],
      entries: [{ horseNumber: 1, finishPosition: 1 }, { horseNumber: 2, finishPosition: 2 }, { horseNumber: 3, finishPosition: 3 }],
    });

    expect(detail.state).toBe("pending_payouts");
    expect(detail.stateLabel).toBe("払戻取込待ち");
    expect(detail.tickets[0]).toEqual(expect.objectContaining({ betType: "wide", isHit: null, returnAmount: null }));
  });
});

import { describe, expect, it } from "vitest";
import { buildSavedScoreReferenceTicket } from "./referenceTicket";

describe("buildSavedScoreReferenceTicket", () => {
  it("保存済みの見送りを予想印に基づく購入非推奨の参考フォーメーションへ変換する", () => {
    const ticket = buildSavedScoreReferenceTicket({
      trifecta: "見送り",
      trio: "見送り",
      trifectaCount: 0,
      trioCount: 0,
      totalBets: 0,
    }, { honmei: 1, taikou: 2, tanana: 3, renka: "[4,5]" });

    expect(ticket).toMatchObject({ referenceOnly: true, trifectaCount: 9, trioCount: 3, totalBets: 12 });
    expect(ticket?.trifecta).toContain("参考フォーメーション: 1着1");
  });

  it("すでに購入対象の買い目や予想印が不足する見送りは変更しない", () => {
    const recorded = { trifecta: "1着1 / 2着2,3 / 3着2,3,4", trio: "1-2,3", trifectaCount: 4, trioCount: 1, totalBets: 5 };
    expect(buildSavedScoreReferenceTicket(recorded, { honmei: 1, taikou: 2, tanana: 3 })).toEqual(recorded);
    expect(buildSavedScoreReferenceTicket({ ...recorded, trifecta: "見送り", totalBets: 0 }, { honmei: 1, taikou: 2 })).toMatchObject({ trifecta: "見送り", totalBets: 0 });
  });
});

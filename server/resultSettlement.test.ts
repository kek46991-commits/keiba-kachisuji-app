import { describe, expect, it } from "vitest";
import { calculatePredictionSettlement, summarizeRaceReconciliation } from "./resultSettlement";

describe("公式結果による予想精算", () => {
  it("現行形式のフォーメーションを公式払戻へ照合して回収額を合算する", () => {
    const result = calculatePredictionSettlement(JSON.stringify({
      totalBets: 3,
      trifecta: "厳選本線: 1着1 / 2着2,3 / 3着1,2,3（2点）",
      trio: "厳選本線: 1 - 2,3（1頭軸流し・1点）",
      wide: "1-2（補助1点）",
    }), [
      { betType: "trifecta", combination: "1-2-3", payout: 1200 },
      { betType: "trio", combination: "1-2-3", payout: 300 },
      { betType: "wide", combination: "1-2", payout: 180 },
    ]);
    expect(result).toEqual({ state: "settled", isHit: true, returnAmount: 1680 });
  });

  it("取りこぼし抑制フォーメーションの3連単12点・3連複6点も精算できる", () => {
    const result = calculatePredictionSettlement(JSON.stringify({
      totalBets: 18,
      trifecta: "フォーメーション: 1着1 / 2着2,3,4,5 / 3着2,3,4,5（12点）",
      trio: "カバー: 1 - 2,3,4,5（1頭軸流し・6点）",
    }), [
      { betType: "trifecta", combination: "1-2-5", payout: 4500 },
      { betType: "trio", combination: "1-2-5", payout: 820 },
    ]);
    expect(result).toEqual({ state: "settled", isHit: true, returnAmount: 5320 });
  });

  it("必要な券種の公式払戻が揃うまで、予想を未精算のまま保持する", () => {
    const result = calculatePredictionSettlement(JSON.stringify({ totalBets: 1, wide: "1-2（補助1点）" }), []);
    expect(result).toEqual({ state: "pending_payouts", isHit: null, returnAmount: null });
  });

  it("点数未記録の旧形式は的中率へ混入させず、精算対象外にする", () => {
    const result = calculatePredictionSettlement(JSON.stringify({ trifecta: "1→2→3" }), [{ betType: "trifecta", combination: "1-2-3", payout: 1000 }]);
    expect(result).toEqual({ state: "pending_ticket_data", isHit: null, returnAmount: null });
  });
});

describe("公式結果取込の精算サマリー", () => {
  it("確定・精算・着順待ち・払戻待ちを区別して集計する", () => {
    expect(summarizeRaceReconciliation([
      { raceId: "r1", state: "settled", settledPredictions: 2, pendingPredictions: 0, hitPredictions: 1, investmentAmount: 500, returnAmount: 1200 },
      { raceId: "r2", state: "pending_payouts", settledPredictions: 0, pendingPredictions: 1, hitPredictions: 0, investmentAmount: 0, returnAmount: 0 },
      { raceId: "r3", state: "pending_entries", settledPredictions: 0, pendingPredictions: 3, hitPredictions: 0, investmentAmount: 0, returnAmount: 0 },
    ])).toEqual({
      confirmedRaces: 1,
      settledPredictions: 2,
      pendingPredictions: 4,
      pendingEntryRaces: 1,
      pendingPayoutRaces: 1,
      hitPredictions: 1,
      investmentAmount: 500,
      returnAmount: 1200,
      profitAmount: 700,
    });
  });
});

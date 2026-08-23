import { describe, expect, it } from "vitest";
import { buildHorseNameMap } from "../shared/horseNameMapping";
import { buildTopThree } from "../shared/raceResultSummary";
import { calculateRecoveryRate, formatRecoveryRate, formatSignedYen, hitStatusLabel } from "../shared/settlementDisplay";
import { buildRaceSettlementSummary, type RaceSettlementInput } from "./raceSettlementSummary";

const nameMap = buildHorseNameMap([
  { raceKey: "r1", horseNumber: 1, horseName: "シャンドゥルール" },
  { raceKey: "r1", horseNumber: 4, horseName: "ロードオールライト" },
  { raceKey: "r1", horseNumber: 5, horseName: "キャネル" },
]);

const raceEntries = [
  { horseNumber: 1, horseName: "馬A", finishPosition: 2 },
  { horseNumber: 4, horseName: "馬D", finishPosition: 1 },
  { horseNumber: 5, horseName: "馬E", finishPosition: 3 },
  { horseNumber: 6, horseName: "馬F", finishPosition: 8 },
];

function baseInput(overrides: Partial<RaceSettlementInput> = {}): RaceSettlementInput {
  return {
    raceId: "r1",
    resultsConfirmed: true,
    entries: raceEntries,
    nameMap,
    officialPayouts: [{ betType: "trifecta", combination: "4-1-5", payout: 12340 }],
    prediction: {
      recommendedBets: JSON.stringify({ totalBets: 1, trifecta: "1着4 / 2着1 / 3着5（1点）" }),
      investAmount: 1000,
      returnAmount: null,
      isHit: null,
    },
    ...overrides,
  };
}

describe("buildTopThree", () => {
  it("1着から3着のみを実名で昇順に返す", () => {
    expect(buildTopThree(raceEntries, nameMap)).toEqual([
      { position: 1, horseNumber: 4, horseName: "ロードオールライト" },
      { position: 2, horseNumber: 1, horseName: "シャンドゥルール" },
      { position: 3, horseNumber: 5, horseName: "キャネル" },
    ]);
  });

  it("マスター未登録なら保存値の馬名を保持する", () => {
    expect(buildTopThree([{ horseNumber: 9, horseName: "馬Z", finishPosition: 1 }], nameMap)).toEqual([
      { position: 1, horseNumber: 9, horseName: "馬Z" },
    ]);
  });

  it("着順未確定は除外する", () => {
    expect(buildTopThree([{ horseNumber: 3, horseName: "馬C", finishPosition: null }], nameMap)).toEqual([]);
  });
});

describe("calculateRecoveryRate", () => {
  it("回収率を小数第1位で計算する", () => {
    expect(calculateRecoveryRate(1000, 12340)).toBe(1234);
    expect(calculateRecoveryRate(1200, 900)).toBe(75);
  });

  it("投資額が0以下や欠損なら計算しない", () => {
    expect(calculateRecoveryRate(0, 1000)).toBeNull();
    expect(calculateRecoveryRate(null, 1000)).toBeNull();
    expect(calculateRecoveryRate(1000, null)).toBeNull();
  });
});

describe("表示フォーマット", () => {
  it("的中・不的中・未精算のラベルを返す", () => {
    expect(hitStatusLabel(true)).toBe("的中 🎯");
    expect(hitStatusLabel(false)).toBe("不的中");
    expect(hitStatusLabel(null)).toBe("未精算");
  });

  it("収支と回収率を整形する", () => {
    expect(formatSignedYen(11340)).toBe("+¥11,340");
    expect(formatSignedYen(-1000)).toBe("−¥1,000");
    expect(formatRecoveryRate(1234)).toBe("1234.0%");
    expect(formatRecoveryRate(null)).toBe("—");
  });
});

describe("buildRaceSettlementSummary", () => {
  it("公式払戻から的中・回収金額・回収率を算出する", () => {
    const summary = buildRaceSettlementSummary(baseInput());
    expect(summary.settlementState).toBe("settled");
    expect(summary.isHit).toBe(true);
    expect(summary.hitStatus).toBe("hit");
    expect(summary.returnAmount).toBe(12340);
    expect(summary.profitAmount).toBe(11340);
    expect(summary.recoveryRate).toBe(1234);
    expect(summary.topThree[0]).toEqual({ position: 1, horseNumber: 4, horseName: "ロードオールライト" });
  });

  it("買い目が外れなら不的中で回収0とする", () => {
    const summary = buildRaceSettlementSummary(
      baseInput({
        prediction: {
          recommendedBets: JSON.stringify({ totalBets: 1, trifecta: "1着1 / 2着4 / 3着5（1点）" }),
          investAmount: 1000,
          returnAmount: null,
          isHit: null,
        },
      }),
    );
    expect(summary.settlementState).toBe("settled");
    expect(summary.isHit).toBe(false);
    expect(summary.returnAmount).toBe(0);
    expect(summary.recoveryRate).toBe(0);
  });

  it("予想が無い場合は判定しない", () => {
    const summary = buildRaceSettlementSummary(baseInput({ prediction: null }));
    expect(summary.hasPrediction).toBe(false);
    expect(summary.settlementState).toBe("no_prediction");
    expect(summary.hitStatus).toBe("pending");
    expect(summary.recoveryRate).toBeNull();
    expect(summary.topThree).toHaveLength(3);
  });

  it("払戻未取得なら保存値を維持して未精算とする", () => {
    const summary = buildRaceSettlementSummary(baseInput({ officialPayouts: [] }));
    expect(summary.settlementState).toBe("pending_payouts");
    expect(summary.isHit).toBeNull();
    expect(summary.returnAmount).toBeNull();
  });

  it("買い目データが無ければ未精算とする", () => {
    const summary = buildRaceSettlementSummary(
      baseInput({ prediction: { recommendedBets: null, investAmount: 1000, returnAmount: null, isHit: null } }),
    );
    expect(summary.settlementState).toBe("pending_ticket_data");
    expect(summary.isHit).toBeNull();
  });
});

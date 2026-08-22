import { describe, expect, it } from "vitest";
import { analyzeRaceDiagnostics } from "./raceAnalysisDiagnostics";

describe("analyzeRaceDiagnostics", () => {
  it("能力差と低オッズ本命が明確な場合は堅めの1頭軸候補にする", () => {
    const result = analyzeRaceDiagnostics([{ score: 80, odds: 2.1 }, { score: 68, odds: 5.2 }, { score: 61, odds: 12 }]);
    expect(result).toMatchObject({ volatility: "A", axisPolicy: "single", scoreGap: 12, oddsAvailable: true });
  });

  it("能力差が僅差または本命不在ならW軸検討にする", () => {
    const result = analyzeRaceDiagnostics([{ score: 80, odds: 8.2 }, { score: 78, odds: 8.8 }, { score: 76, odds: 9.1 }]);
    expect(result).toMatchObject({ volatility: "D", axisPolicy: "dual", scoreGap: 2 });
  });

  it("公式オッズが欠ける場合は波乱度を推測しない", () => {
    const result = analyzeRaceDiagnostics([{ score: 80, odds: 2.1 }, { score: 76, odds: null }, { score: 71, odds: 9.4 }]);
    expect(result).toMatchObject({ volatility: "unknown", oddsAvailable: false });
    expect(result.missingDataNotice).toContain("公式オッズ未取得");
  });
});

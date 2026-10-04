import { describe, expect, it } from "vitest";
import { MINIMUM_ENTRIES_FOR_COMBINATION_BETS, MINIMUM_ENTRIES_FOR_PREDICTION, getPredictionAvailability } from "./predictionAvailability";

describe("getPredictionAvailability", () => {
  it("出走馬が未保存なら予想を停止し、創作しない状態を返す", () => {
    const result = getPredictionAvailability(0);
    expect(result.canPredict).toBe(false);
    expect(result.canScore).toBe(false);
    expect(result.entryCount).toBe(0);
    expect(result.message).toContain("創作して予想や買い目を表示することはしません");
  });

  it("1頭以上なら暫定個別予想を許可し、3連系は3頭以上に限定する", () => {
    const partial = getPredictionAvailability(MINIMUM_ENTRIES_FOR_PREDICTION);
    expect(partial.canPredict).toBe(true);
    expect(partial.isPartialEntryList).toBe(true);
    expect(partial.canGenerateCombinationBets).toBe(false);

    const complete = getPredictionAvailability(MINIMUM_ENTRIES_FOR_COMBINATION_BETS);
    expect(complete.canPredict).toBe(true);
    expect(complete.isPartialEntryList).toBe(false);
    expect(complete.canGenerateCombinationBets).toBe(true);
  });
});

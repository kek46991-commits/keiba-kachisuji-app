import { describe, expect, it } from "vitest";
import { buildDataQualityMetrics } from "./dataQualityPanel";

const snapshot = {
  raceCount: 10, entryRaceCount: 10, entryCount: 100, gateCount: 100, jockeyCount: 100, weightCount: 55,
  structuredPredictionCount: 2, winOddsRaceCount: 5, combinationOddsRaceCount: 0, resultsConfirmedCount: 4, narResultsConfirmedCount: 0,
  latestRaceAt: null, latestEntryAt: null, latestWinOddsAt: null, latestCombinationOddsAt: null, latestPredictionAt: null,
};

describe("buildDataQualityMetrics", () => {
  it("欠損を補完せず、部分利用と未利用を区別する", () => {
    const metrics = buildDataQualityMetrics(snapshot);
    expect(metrics.find(metric => metric.key === "entries")?.status).toBe("available");
    expect(metrics.find(metric => metric.key === "ability")?.status).toBe("partial");
    expect(metrics.find(metric => metric.key === "condition")?.status).toBe("partial");
    expect(metrics.find(metric => metric.key === "combination")?.status).toBe("unavailable");
    expect(metrics.find(metric => metric.key === "localBias")?.usedInAnalysis).toBe(false);
  });
});

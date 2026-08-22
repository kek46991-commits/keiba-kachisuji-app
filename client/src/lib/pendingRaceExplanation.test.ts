import { describe, expect, it } from "vitest";
import { buildPendingRaceExplanation } from "./pendingRaceExplanation";

describe("buildPendingRaceExplanation", () => {
  it("未取込の出馬表を補完せず、公開可能な解説と非公開項目を分ける", () => {
    const explanation = buildPendingRaceExplanation({
      date: "2026-08-22",
      venue: "新潟",
      raceNumber: 3,
      entryCount: 0,
      minimumEntryCount: 3,
    });

    expect(explanation.title).toContain("新潟 3R");
    expect(explanation.status).toContain("あと3頭以上");
    expect(explanation.availableNow.join(" ")).toContain("予想オッズモード");
    expect(explanation.notPublished.join(" ")).toContain("穴馬軸");
    expect(explanation.notPublished.join(" ")).not.toContain("特定馬名");
  });
});

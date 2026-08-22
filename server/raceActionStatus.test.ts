import { describe, expect, it } from "vitest";
import { getRaceActionStatus } from "./raceActionStatus";

describe("getRaceActionStatus", () => {
  const now = new Date("2026-08-12T08:00:00.000Z"); // JST 17:00

  it("結果が確定済みなら発走時刻にかかわらず結果表示にする", () => {
    expect(getRaceActionStatus({ raceDate: "2026-08-12", startTime: "18:00", resultsConfirmed: true, now })).toBe("result");
  });

  it("当日の発走前レースは予想へ誘導する", () => {
    expect(getRaceActionStatus({ raceDate: "2026-08-12", startTime: "18:00", resultsConfirmed: false, now })).toBe("predict");
  });

  it("発走済みで結果未確定なら結果待ちにする", () => {
    expect(getRaceActionStatus({ raceDate: "2026-08-12", startTime: "16:59", resultsConfirmed: false, now })).toBe("waiting");
  });

  it("過去日で公式結果が未取込の場合は未取込として明示する", () => {
    expect(getRaceActionStatus({ raceDate: "2026-08-11", startTime: "16:00", resultsConfirmed: false, now })).toBe("missing_result");
  });
});

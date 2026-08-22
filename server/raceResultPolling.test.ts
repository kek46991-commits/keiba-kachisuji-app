import { describe, expect, it } from "vitest";
import { getResultWaitingRefetchInterval, RESULT_WAITING_REFETCH_MS } from "../client/src/lib/raceResultPolling";

describe("getResultWaitingRefetchInterval", () => {
  it("結果待ちのレースがある場合だけ30秒の再取得間隔を返す", () => {
    expect(getResultWaitingRefetchInterval([{ actionStatus: "predict" }, { actionStatus: "waiting" }]))
      .toBe(RESULT_WAITING_REFETCH_MS);
  });

  it("結果待ちがない場合は自動再取得を停止する", () => {
    expect(getResultWaitingRefetchInterval([{ actionStatus: "predict" }, { actionStatus: "result" }])).toBe(false);
    expect(getResultWaitingRefetchInterval(undefined)).toBe(false);
  });
});

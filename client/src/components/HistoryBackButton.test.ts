import { describe, expect, it } from "vitest";
import { shouldUseBrowserHistory } from "./HistoryBackButton";

describe("shouldUseBrowserHistory", () => {
  it("前画面がある場合だけブラウザ履歴を使う", () => {
    expect(shouldUseBrowserHistory(2)).toBe(true);
  });

  it("直リンクなど履歴がない場合はフォールバックを使う", () => {
    expect(shouldUseBrowserHistory(1)).toBe(false);
    expect(shouldUseBrowserHistory(0)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { assertPublicOddsImportAllowed } from "./publicOddsImportGuard";

describe("assertPublicOddsImportAllowed", () => {
  it("TARGETのファイル名を公開取込から拒否する", () => {
    expect(() => assertPublicOddsImportAllowed("レースID,馬番,単勝オッズ\n202608120501,1,3.4", "target_odds.csv"))
      .toThrow("個人分析用CSV");
  });

  it("TARGET標準出力の時刻列を検出して拒否する", () => {
    expect(() => assertPublicOddsImportAllowed("レースID,時刻フラグ,時刻,馬番,単勝オッズ,出力時刻\n202608120501,1,1200,1,3.4,202608121200", "odds.csv"))
      .toThrow("個人分析用CSV");
  });

  it("許諾済み提供元の一般形式CSVは検証を通す", () => {
    expect(() => assertPublicOddsImportAllowed("race_id,horse_number,win_odds\n202608120501,1,3.4", "licensed-provider.csv"))
      .not.toThrow();
  });
});

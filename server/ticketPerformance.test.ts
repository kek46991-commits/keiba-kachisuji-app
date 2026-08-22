import { describe, expect, it } from "vitest";
import { aggregateTicketPerformance, hasAuditableRecordedBets, parseRecordedTicketCount, ticketBandFor } from "./ticketPerformance";

describe("ticket performance aggregation", () => {
  it("保存済みtotalBetsだけを点数帯へ集計し、未記録の履歴は除外数として明示する", () => {
    const report = aggregateTicketPerformance([
      { recommendedBets: JSON.stringify({ totalBets: 24 }), investAmount: 2400, returnAmount: 3600, isHit: true },
      { recommendedBets: JSON.stringify({ totalBets: 55 }), investAmount: 5500, returnAmount: 0, isHit: false },
      { recommendedBets: JSON.stringify({ box: [1, 2, 3] }), investAmount: 3000, returnAmount: 0, isHit: false },
    ]);
    expect(report.bands.find(row => row.band === "16-30")).toMatchObject({ records: 1, hits: 1, roi: 150 });
    expect(report.bands.find(row => row.band === "46-60")).toMatchObject({ records: 1, hits: 0, roi: 0 });
    expect(report.unclassifiedCount).toBe(1);
  });

  it("不正なJSONや未記録の点数を推測しない", () => {
    expect(parseRecordedTicketCount('{bad')).toBeNull();
    expect(parseRecordedTicketCount(JSON.stringify({ totalBets: 0 }))).toBeNull();
    expect(ticketBandFor(60)).toBe("46-60");
  });

  it("点数未記録の旧形式は成績の実測対象にしない", () => {
    expect(hasAuditableRecordedBets(JSON.stringify({ totalBets: 6 }))).toBe(true);
    expect(hasAuditableRecordedBets(JSON.stringify({ box: [1, 2, 3, 4, 5] }))).toBe(false);
    expect(hasAuditableRecordedBets(null)).toBe(false);
  });

  it("購入推奨なしの参考フォーメーションは実績集計から除外する", () => {
    expect(hasAuditableRecordedBets(JSON.stringify({ totalBets: 12, referenceOnly: true }))).toBe(false);
  });
});

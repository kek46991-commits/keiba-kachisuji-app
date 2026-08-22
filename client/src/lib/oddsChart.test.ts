import { describe, expect, it } from "vitest";
import { filterOddsHistoryByWindow, getClosestOddsHistoryIndex, getOddsChartBounds, getOddsChartCoordinate, getOddsChartPoints } from "./oddsChart";

describe("getClosestOddsHistoryIndex", () => {
  const history = [
    { fetchedAt: "2026-08-13T03:00:00.000Z" },
    { fetchedAt: "2026-08-13T03:05:00.000Z" },
    { fetchedAt: "2026-08-13T03:10:00.000Z" },
  ];

  it("急変検知時刻に最も近いオッズ取得地点を選ぶ", () => {
    expect(getClosestOddsHistoryIndex(history, "2026-08-13T03:06:30.000Z")).toBe(1);
  });

  it("無効な日時または空履歴ではマーカーを描画しない", () => {
    expect(getClosestOddsHistoryIndex(history, "invalid")).toBeNull();
    expect(getClosestOddsHistoryIndex([], "2026-08-13T03:06:30.000Z")).toBeNull();
  });

  it("複数馬の推移を同じ時刻・オッズ軸へ配置する", () => {
    const seriesA = [
      { fetchedAt: "2026-08-13T03:00:00.000Z", winOdds: 3.0 },
      { fetchedAt: "2026-08-13T03:10:00.000Z", winOdds: 2.0 },
    ];
    const seriesB = [
      { fetchedAt: "2026-08-13T03:00:00.000Z", winOdds: 8.0 },
      { fetchedAt: "2026-08-13T03:10:00.000Z", winOdds: 10.0 },
    ];
    const bounds = getOddsChartBounds([seriesA, seriesB]);

    expect(bounds).not.toBeNull();
    expect(getOddsChartCoordinate(seriesA[0]!, bounds!)?.x).toBeCloseTo(4);
    expect(getOddsChartCoordinate(seriesB[1]!, bounds!)?.x).toBeCloseTo(96);
    expect(getOddsChartPoints(seriesA, bounds!)).toContain(",");
  });

  it("最新の取得時刻を基準に直近時間帯へ履歴を絞り込む", () => {
    const series = [[
      { fetchedAt: "2026-08-13T03:00:00.000Z", winOdds: 3.0 },
      { fetchedAt: "2026-08-13T03:30:00.000Z", winOdds: 2.8 },
      { fetchedAt: "2026-08-13T04:00:00.000Z", winOdds: 2.6 },
    ]];

    expect(filterOddsHistoryByWindow(series, 30)[0]).toHaveLength(2);
    expect(filterOddsHistoryByWindow(series, 60)[0]).toHaveLength(3);
    expect(filterOddsHistoryByWindow(series, "all")[0]).toHaveLength(3);
  });
});

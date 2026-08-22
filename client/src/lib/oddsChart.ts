export type OddsHistoryTimestamp = {
  fetchedAt: Date | string | number | null | undefined;
};

export type OddsChartPoint = OddsHistoryTimestamp & {
  winOdds: number | null;
};

export type OddsChartBounds = {
  startAt: number;
  endAt: number;
  minOdds: number;
  maxOdds: number;
};

export type OddsHistoryWindowMinutes = 30 | 60 | "all";

function toTimestamp(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isChartPoint(point: OddsChartPoint): point is OddsChartPoint & { winOdds: number } {
  return point.winOdds !== null && toTimestamp(point.fetchedAt) !== null;
}

/**
 * 取得済み履歴の最新時刻を基準に、直近の指定時間帯だけを残す。
 * 過去レースの履歴でも再現できるよう、現在時刻ではなく最新スナップショットを基準にする。
 */
export function filterOddsHistoryByWindow(
  seriesList: OddsChartPoint[][],
  windowMinutes: OddsHistoryWindowMinutes,
): OddsChartPoint[][] {
  if (windowMinutes === "all") return seriesList;

  const timestamps = seriesList.flat()
    .map(point => toTimestamp(point.fetchedAt))
    .filter((timestamp): timestamp is number => timestamp !== null);
  if (timestamps.length === 0) return seriesList.map(() => []);

  const cutoff = Math.max(...timestamps) - windowMinutes * 60_000;
  return seriesList.map(history => history.filter(point => {
    const timestamp = toTimestamp(point.fetchedAt);
    return timestamp !== null && timestamp >= cutoff;
  }));
}

/** 同一の時間軸・オッズ軸で複数馬を描くための描画範囲を求める。 */
export function getOddsChartBounds(seriesList: OddsChartPoint[][]): OddsChartBounds | null {
  const points = seriesList.flat().filter(isChartPoint);
  if (points.length < 2) return null;

  const timestamps = points.map(point => toTimestamp(point.fetchedAt)!);
  const odds = points.map(point => point.winOdds);
  const startAt = Math.min(...timestamps);
  const endAt = Math.max(...timestamps);
  if (startAt === endAt) return null;

  const lowestOdds = Math.min(...odds);
  const highestOdds = Math.max(...odds);
  const padding = highestOdds === lowestOdds
    ? Math.max(0.5, Math.abs(lowestOdds) * 0.08)
    : (highestOdds - lowestOdds) * 0.08;

  return {
    startAt,
    endAt,
    minOdds: Math.max(0, lowestOdds - padding),
    maxOdds: highestOdds + padding,
  };
}

/** viewBox 100×100 の共通時間軸上にオッズ取得地点を配置する。 */
export function getOddsChartCoordinate(point: OddsChartPoint, bounds: OddsChartBounds): { x: number; y: number } | null {
  if (!isChartPoint(point)) return null;
  const timestamp = toTimestamp(point.fetchedAt)!;
  const x = 4 + ((timestamp - bounds.startAt) / (bounds.endAt - bounds.startAt)) * 92;
  const y = 90 - ((point.winOdds - bounds.minOdds) / (bounds.maxOdds - bounds.minOdds)) * 74;
  return { x, y };
}

/** 有効なオッズ取得地点のみを共通時間軸のpolyline形式へ変換する。 */
export function getOddsChartPoints(history: OddsChartPoint[], bounds: OddsChartBounds): string {
  const coordinates = history
    .map(point => getOddsChartCoordinate(point, bounds))
    .filter((point): point is { x: number; y: number } => point !== null);
  return coordinates.length > 1 ? coordinates.map(point => `${point.x},${point.y}`).join(" ") : "";
}

/**
 * 急変検知時刻に最も近い、グラフ描画対象のオッズ取得地点を返す。
 * 無効な日時や空の履歴は描画対象にしない。
 */
export function getClosestOddsHistoryIndex(
  history: OddsHistoryTimestamp[],
  detectedAt: Date | string | number | null | undefined,
): number | null {
  const detectedTimestamp = toTimestamp(detectedAt);
  if (detectedTimestamp === null || history.length === 0) return null;

  let closestIndex: number | null = null;
  let smallestDifference = Number.POSITIVE_INFINITY;

  history.forEach((point, index) => {
    const fetchedTimestamp = toTimestamp(point.fetchedAt);
    if (fetchedTimestamp === null) return;

    const difference = Math.abs(fetchedTimestamp - detectedTimestamp);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      closestIndex = index;
    }
  });

  return closestIndex;
}

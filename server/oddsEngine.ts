import { and, desc, eq, gte } from "drizzle-orm";
import {
  horseJockeyCompatibility,
  jockeyStats,
  oddsMovementAlerts,
  raceOdds,
} from "../drizzle/schema";

type DbClient = any;

export type OddsMovementSignal = {
  horseNumber: number;
  horseName: string | null;
  previousOdds: number;
  currentOdds: number;
  changePct: number;
  bonusScore: number;
  alertType: "large_bet" | "abnormal";
};

export type NARScoreEnhancement = {
  jockeyStatsScore: number;
  compatibilityScore: number;
  oddsMovementScore: number;
  jockeySampleSize: number;
  compatibilityRides: number;
};

const toNumber = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
};

export function getDistanceRange(distance: number): "sprint" | "mile" | "middle" | "long" {
  if (distance <= 1400) return "sprint";
  if (distance <= 1800) return "mile";
  if (distance <= 2200) return "middle";
  return "long";
}

/**
 * 騎手の条件別成績を、既存スコアに加算する最大8点のボーナスへ正規化する。
 * 全体的な騎手名ランキングではなく、競馬場・馬場・距離帯の実績を優先する。
 */
export function calculateJockeyStatsBonus(stat?: {
  winRate?: unknown;
  placeRate?: unknown;
  showRate?: unknown;
  totalRides?: number;
} | null): number {
  if (!stat || (stat.totalRides ?? 0) < 10) return 0;
  const performanceIndex =
    toNumber(stat.winRate) * 0.5 +
    toNumber(stat.placeRate) * 0.3 +
    toNumber(stat.showRate) * 0.2;
  return Math.max(-2, Math.min(8, Math.round(((performanceIndex - 25) / 5) * 10) / 10));
}

/** 馬×騎手コンビ実績を最大6点のボーナスへ正規化する。 */
export function calculateCompatibilityBonus(stat?: {
  comboRides?: number;
  comboWins?: number;
  comboPlaces?: number;
  styleMatchScore?: unknown;
} | null): number {
  if (!stat || (stat.comboRides ?? 0) < 2) return 0;
  const rides = stat.comboRides ?? 0;
  const winRate = rides ? ((stat.comboWins ?? 0) / rides) * 100 : 0;
  const placeRate = rides ? ((stat.comboPlaces ?? 0) / rides) * 100 : 0;
  const styleMatch = toNumber(stat.styleMatchScore) || 0.5;
  const compatibility = winRate * 0.3 + placeRate * 0.4 + styleMatch * 30;
  return Math.max(-1, Math.min(6, Math.round(((compatibility - 25) / 8) * 10) / 10));
}

/** オッズ急落を、事実断定ではなく市場変動シグナルとして評価する。 */
export function calculateOddsMovementSignal(previousOdds: number, currentOdds: number): Omit<OddsMovementSignal, "horseNumber" | "horseName"> | null {
  if (previousOdds <= 0 || currentOdds <= 0) return null;
  const changePct = Math.round(((currentOdds - previousOdds) / previousOdds) * 1000) / 10;
  if (changePct > -20) return null;

  if (changePct <= -40) {
    return { previousOdds, currentOdds, changePct, bonusScore: 8, alertType: "large_bet" };
  }
  if (changePct <= -30) {
    return { previousOdds, currentOdds, changePct, bonusScore: 6, alertType: "large_bet" };
  }
  return { previousOdds, currentOdds, changePct, bonusScore: 4, alertType: "abnormal" };
}

export async function recordOddsSnapshots(
  db: DbClient,
  input: {
    raceId: string;
    minutesToStart: number;
    odds: Array<{ horseNumber: number; horseName: string; winOdds: number; placeOddsMin?: number | null; placeOddsMax?: number | null }>;
  }
): Promise<OddsMovementSignal[]> {
  const signals: OddsMovementSignal[] = [];

  for (const item of input.odds) {
    if (!Number.isFinite(item.winOdds) || item.winOdds <= 0) continue;

    const [previous] = await db
      .select({ id: raceOdds.id, winOdds: raceOdds.winOdds })
      .from(raceOdds)
      .where(and(eq(raceOdds.raceId, input.raceId), eq(raceOdds.horseNumber, item.horseNumber)))
      .orderBy(desc(raceOdds.fetchedAt), desc(raceOdds.id))
      .limit(1);

    await db.insert(raceOdds).values({
      raceId: input.raceId,
      horseNumber: item.horseNumber,
      horseName: item.horseName,
      winOdds: item.winOdds.toFixed(1),
      placeOddsMin: item.placeOddsMin?.toFixed(1),
      placeOddsMax: item.placeOddsMax?.toFixed(1),
      minutesToStart: input.minutesToStart,
    });

    const signal = calculateOddsMovementSignal(toNumber(previous?.winOdds), item.winOdds);
    if (!signal) continue;

    // 同じ馬・同一変動を直近2分内に重複記録しない。
    const recentSince = new Date(Date.now() - 2 * 60 * 1000);
    const existing = await db
      .select({ id: oddsMovementAlerts.id })
      .from(oddsMovementAlerts)
      .where(and(
        eq(oddsMovementAlerts.raceId, input.raceId),
        eq(oddsMovementAlerts.horseNumber, item.horseNumber),
        gte(oddsMovementAlerts.detectedAt, recentSince),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(oddsMovementAlerts).values({
      raceId: input.raceId,
      horseNumber: item.horseNumber,
      horseName: item.horseName,
      oddsBefore: signal.previousOdds.toFixed(1),
      oddsAfter: signal.currentOdds.toFixed(1),
      changePct: signal.changePct.toFixed(1),
      alertType: signal.alertType,
      bonusScore: signal.bonusScore.toFixed(1),
    });
    signals.push({ horseNumber: item.horseNumber, horseName: item.horseName, ...signal });
  }

  return signals;
}

export async function getNARScoreEnhancement(
  db: DbClient | null,
  input: {
    raceId: string;
    horseNumber: number;
    horseName: string;
    jockeyName: string;
    venue: string;
    surface: string;
    distance: number;
  }
): Promise<NARScoreEnhancement> {
  const defaultResult: NARScoreEnhancement = {
    jockeyStatsScore: 0,
    compatibilityScore: 0,
    oddsMovementScore: 0,
    jockeySampleSize: 0,
    compatibilityRides: 0,
  };
  if (!db) return defaultResult;

  const surface = input.surface === "turf" ? "turf" : "dirt";
  const distanceRange = getDistanceRange(input.distance);
  const [jockey] = await db
    .select()
    .from(jockeyStats)
    .where(and(
      eq(jockeyStats.jockeyName, input.jockeyName),
      eq(jockeyStats.venue, input.venue),
      eq(jockeyStats.surface, surface),
      eq(jockeyStats.distanceRange, distanceRange),
    ))
    .limit(1);
  const [compatibility] = await db
    .select()
    .from(horseJockeyCompatibility)
    .where(and(
      eq(horseJockeyCompatibility.horseName, input.horseName),
      eq(horseJockeyCompatibility.jockeyName, input.jockeyName),
    ))
    .limit(1);
  const alertSince = new Date(Date.now() - 30 * 60 * 1000);
  const recentAlerts = await db
    .select({ bonusScore: oddsMovementAlerts.bonusScore })
    .from(oddsMovementAlerts)
    .where(and(
      eq(oddsMovementAlerts.raceId, input.raceId),
      eq(oddsMovementAlerts.horseNumber, input.horseNumber),
      gte(oddsMovementAlerts.detectedAt, alertSince),
    ));

  return {
    jockeyStatsScore: calculateJockeyStatsBonus(jockey),
    compatibilityScore: calculateCompatibilityBonus(compatibility),
    oddsMovementScore: Math.min(8, recentAlerts.reduce((sum: number, alert: { bonusScore: unknown }) => sum + toNumber(alert.bonusScore), 0)),
    jockeySampleSize: jockey?.totalRides ?? 0,
    compatibilityRides: compatibility?.comboRides ?? 0,
  };
}

/** JRA/NAR共通で、直近30分に記録された市場急変シグナルのボーナスを取得する。 */
export async function getOddsMovementBonus(
  db: DbClient | null,
  raceId: string,
  horseNumber: number,
): Promise<number> {
  if (!db) return 0;
  const alertSince = new Date(Date.now() - 30 * 60 * 1000);
  const alerts = await db
    .select({ bonusScore: oddsMovementAlerts.bonusScore })
    .from(oddsMovementAlerts)
    .where(and(
      eq(oddsMovementAlerts.raceId, raceId),
      eq(oddsMovementAlerts.horseNumber, horseNumber),
      gte(oddsMovementAlerts.detectedAt, alertSince),
    ));
  return Math.min(8, alerts.reduce((sum: number, alert: { bonusScore: unknown }) => sum + toNumber(alert.bonusScore), 0));
}

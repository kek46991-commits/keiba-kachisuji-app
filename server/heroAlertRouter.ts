import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { oddsMovementAlerts, raceOdds, races } from "../drizzle/schema";
import { getDb } from "./db";
import { getMinutesUntilJstStart, selectComparisonHorseNumbers, selectHeroAlert, type HeroAlertCandidate } from "./heroAlertLogic";
import { publicProcedure, router } from "./_core/trpc";
import { z } from "zod";

const NAR_VENUES = new Set(["帯広", "門別", "盛岡", "水沢", "浦和", "船橋", "大井", "川崎", "金沢", "笠松", "名古屋", "園田", "姫路", "高知", "佐賀"]);
const isImportantRace = (name: string) => /(G[1-3]|Jpn[1-3]|重賞|グランプリ|ダービー)/i.test(name);

function hrefForRace(race: { raceDate: string; venueName: string; raceNumber: number; raceId: string }) {
  if (NAR_VENUES.has(race.venueName)) {
    return `/nar-predictions?date=${encodeURIComponent(race.raceDate)}&venue=${encodeURIComponent(race.venueName)}&race=${race.raceNumber}`;
  }
  return `/predictions?raceId=${encodeURIComponent(race.raceId)}`;
}

export const heroAlertRouter = router({
  getActive: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;

    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const tomorrow = new Date(Date.now() + 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
    const scheduled = await db.select().from(races)
      .where(and(gte(races.raceDate, today), lte(races.raceDate, tomorrow)));
    const raceById = new Map(scheduled.map(race => [race.raceId, race]));
    const candidates: HeroAlertCandidate[] = [];

    const recentSince = new Date(Date.now() - 30 * 60_000);
    const movements = await db.select().from(oddsMovementAlerts)
      .where(gte(oddsMovementAlerts.detectedAt, recentSince))
      .orderBy(desc(oddsMovementAlerts.detectedAt))
      .limit(12);

    for (const movement of movements) {
      const race = raceById.get(movement.raceId);
      if (!race) continue;
      const minutesToStart = getMinutesUntilJstStart(race.raceDate, race.postTime);
      if (minutesToStart === null || minutesToStart < -5 || minutesToStart > 60) continue;
      const change = Number(movement.changePct ?? 0);
      candidates.push({
        kind: "odds",
        urgency: "high",
        title: `速報｜${race.venueName}${race.raceNumber}R 市場急変`,
        detail: `${movement.horseName ?? `${movement.horseNumber}番`}の単勝オッズが${Math.abs(change).toFixed(1)}%下落。発走${Math.max(0, minutesToStart)}分前`,
        href: hrefForRace(race),
        score: 100 + Math.abs(change),
        raceId: race.raceId,
        horseNumber: movement.horseNumber,
        oddsBefore: movement.oddsBefore ? Number(movement.oddsBefore) : null,
        oddsAfter: movement.oddsAfter ? Number(movement.oddsAfter) : null,
        changePct: movement.changePct ? Number(movement.changePct) : null,
      });
    }

    for (const race of scheduled) {
      const minutesToStart = getMinutesUntilJstStart(race.raceDate, race.postTime);
      if (minutesToStart === null || minutesToStart < 0 || minutesToStart > 60 || !isImportantRace(race.raceName)) continue;
      candidates.push({
        kind: "important_race",
        urgency: "medium",
        title: `注目レース｜${race.venueName}${race.raceNumber}R ${race.raceName}`,
        detail: `${race.surface === "turf" ? "芝" : "ダート"}${race.distance ?? "—"}m・発走${minutesToStart}分前`,
        href: hrefForRace(race),
        score: 50 - minutesToStart / 60,
        raceId: race.raceId,
      });
    }

    return selectHeroAlert(candidates);
  }),

  getDetail: publicProcedure
    .input(z.object({ raceId: z.string().min(1), horseNumber: z.number().int().positive().nullable().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [race] = await db.select().from(races).where(eq(races.raceId, input.raceId)).limit(1);
      if (!race) return null;

      const oddsCondition = input.horseNumber
        ? and(eq(raceOdds.raceId, input.raceId), eq(raceOdds.horseNumber, input.horseNumber))
        : eq(raceOdds.raceId, input.raceId);
      const oddsHistory = await db.select().from(raceOdds)
        .where(oddsCondition)
        .orderBy(asc(raceOdds.fetchedAt))
        .limit(48);

      // 直近のスナップショットから、急変対象を含む最大4頭分を比較用に抽出する。
      const recentRaceOdds = await db.select().from(raceOdds)
        .where(eq(raceOdds.raceId, input.raceId))
        .orderBy(desc(raceOdds.fetchedAt))
        .limit(192);
      const comparisonHorseNumbers = selectComparisonHorseNumbers(
        recentRaceOdds.map(row => ({ horseNumber: row.horseNumber, winOdds: row.winOdds ? Number(row.winOdds) : null })),
        input.horseNumber,
      );
      const comparisonOddsHistory = comparisonHorseNumbers.map(horseNumber => {
        const history = recentRaceOdds
          .filter(row => row.horseNumber === horseNumber)
          .slice(0, 48)
          .reverse()
          .map(row => ({
            horseName: row.horseName,
            horseNumber: row.horseNumber,
            winOdds: row.winOdds ? Number(row.winOdds) : null,
            fetchedAt: row.fetchedAt,
          }));
        return { horseNumber, horseName: history.find(point => point.horseName)?.horseName ?? null, history };
      }).filter(series => series.history.some(point => point.winOdds !== null));

      const [latestMovement] = input.horseNumber
        ? await db.select().from(oddsMovementAlerts)
          .where(and(eq(oddsMovementAlerts.raceId, input.raceId), eq(oddsMovementAlerts.horseNumber, input.horseNumber)))
          .orderBy(desc(oddsMovementAlerts.detectedAt))
          .limit(1)
        : [];

      return {
        race: {
          raceId: race.raceId,
          raceName: race.raceName,
          raceDate: race.raceDate,
          venueName: race.venueName,
          raceNumber: race.raceNumber,
          postTime: race.postTime,
          distance: race.distance,
          surface: race.surface,
        },
        movement: latestMovement ? {
          horseName: latestMovement.horseName,
          horseNumber: latestMovement.horseNumber,
          oddsBefore: latestMovement.oddsBefore ? Number(latestMovement.oddsBefore) : null,
          oddsAfter: latestMovement.oddsAfter ? Number(latestMovement.oddsAfter) : null,
          changePct: latestMovement.changePct ? Number(latestMovement.changePct) : null,
          detectedAt: latestMovement.detectedAt,
        } : null,
        oddsHistory: oddsHistory.map(row => ({
          horseName: row.horseName,
          horseNumber: row.horseNumber,
          winOdds: row.winOdds ? Number(row.winOdds) : null,
          fetchedAt: row.fetchedAt,
          minutesToStart: row.minutesToStart,
        })),
        comparisonOddsHistory,
      };
    }),
});

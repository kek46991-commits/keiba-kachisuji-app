/**
 * レーススケジュールルーター
 * DBに保存されたJRAスケジュールデータを返す（クレジット節約のためスクレイピングせずDBから読み込み）
 */
import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { raceSchedules, races } from "../drizzle/schema";
import { and, gte, lte, eq, asc } from "drizzle-orm";
import { getRaceActionStatus } from "./raceActionStatus";

export const scheduleRouter = router({
  /**
   * 今週のレーススケジュールを取得（DBから）
   */
  getThisWeek: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];

    // JST基準で今日〜7日後
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstNow.toISOString().split("T")[0]!;
    const nextWeek = new Date(jstNow.getTime() + 7 * 86400000).toISOString().split("T")[0]!;

    const result = await db
      .select()
      .from(raceSchedules)
      .where(and(gte(raceSchedules.raceDate, today), lte(raceSchedules.raceDate, nextWeek)))
      .orderBy(asc(raceSchedules.raceDate), asc(raceSchedules.venue), asc(raceSchedules.raceNumber));

    return result;
  }),

  /**
   * 指定日のレーススケジュールを取得（DBから）
   * raceSchedulesテーブル + racesテーブル（NAR個別レース）を統合して返す
   */
  getByDate: publicProcedure
    .input(z.object({ date: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      // raceSchedulesテーブルからJRA + NAR開催情報を取得
      const scheduleResult = await db
        .select()
        .from(raceSchedules)
        .where(eq(raceSchedules.raceDate, input.date))
        .orderBy(asc(raceSchedules.venue), asc(raceSchedules.raceNumber));

      // racesテーブルを正規の結果状態ソースとして取得する。
      // JRA/NARとも、結果確定済みのレースだけを「結果を見る」対象にする。
      const canonicalRaces = await db
        .select()
        .from(races)
        .where(eq(races.raceDate, input.date))
        .orderBy(asc(races.venueName), asc(races.raceNumber));

      const canonicalByVenueAndNumber = new Map(
        canonicalRaces.map(race => [`${race.venueName}:${race.raceNumber}`, race])
      );
      const narRaces = canonicalRaces.filter(race => race.organizer === "NAR");

      const getActionStatus = (raceDate: string, startTime: string | null, canonical?: typeof races.$inferSelect) => {
        return getRaceActionStatus({
          raceDate,
          startTime,
          resultsConfirmed: canonical?.status === "results_confirmed",
        });
      };

      // NAR個別レースデータをraceSchedules形式に変換して統合
      const narRacesMapped = narRaces.map(r => ({
        id: r.id + 100000, // IDが重複しないようにオフセット
        raceDate: r.raceDate,
        venue: r.venueName,
        raceNumber: r.raceNumber,
        raceName: r.raceName,
        grade: r.grade,
        distance: r.distance,
        surface: (r.surface === "turf" ? "turf" : "dirt") as "turf" | "dirt",
        startTime: r.postTime,
        netkeibaRaceId: r.raceId,
        horseCount: r.headCount,
        weather: r.weather,
        trackCondition: r.trackCondition,
        organizer: "NAR" as const,
        actionStatus: getActionStatus(r.raceDate, r.postTime, r),
        hasConfirmedResult: r.status === "results_confirmed",
        createdAt: r.createdAt,
        updatedAt: r.createdAt, // racesテーブルにupdatedAtがないためcreatedAtを使用
      }));

      // raceSchedulesのNAR raceNumber=0（開催情報のみ）を除外し、
      // 代わりにracesテーブルの個別レースデータがある場合はそちらを使う
      const narVenuesWithRaces = new Set(narRacesMapped.map(r => r.venue));
      const filteredSchedules = scheduleResult.filter(s => {
        // NARの開催情報（raceNumber=0）は、個別レースデータがある場合は除外
        if (s.organizer === "NAR" && s.raceNumber === 0 && narVenuesWithRaces.has(s.venue)) {
          return false;
        }
        // NARの個別レースデータがracesテーブルにある場合、raceSchedulesのNARデータは除外
        if (s.organizer === "NAR" && s.raceNumber > 0 && narVenuesWithRaces.has(s.venue)) {
          return false;
        }
        return true;
      });

      // JRAスケジュールにも、同日・同競馬場・同Rの正規レース状態を付与する。
      const schedulesWithAction = filteredSchedules.map(schedule => {
        const canonical = canonicalByVenueAndNumber.get(`${schedule.venue}:${schedule.raceNumber}`);
        return {
          ...schedule,
          actionStatus: getActionStatus(schedule.raceDate, schedule.startTime, canonical),
          hasConfirmedResult: canonical?.status === "results_confirmed",
        };
      });

      // 統合して返す
      const combined = [...schedulesWithAction, ...narRacesMapped];
      combined.sort((a, b) => {
        if (a.venue < b.venue) return -1;
        if (a.venue > b.venue) return 1;
        return a.raceNumber - b.raceNumber;
      });

      return combined;
    }),

  /**
   * 月間スケジュール取得（カレンダー表示用）
   * 各開催日の競馬場名・グレードレースを返す
   */
  getMonthSchedule: publicProcedure
    .input(z.object({
      year: z.number(),
      month: z.number().min(1).max(12),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { days: [], gradeRaces: [] };

      const startDate = `${input.year}-${String(input.month).padStart(2, "0")}-01`;
      const endDate = `${input.year}-${String(input.month).padStart(2, "0")}-31`;

      const schedules = await db
        .select()
        .from(raceSchedules)
        .where(and(gte(raceSchedules.raceDate, startDate), lte(raceSchedules.raceDate, endDate)))
        .orderBy(asc(raceSchedules.raceDate), asc(raceSchedules.venue), asc(raceSchedules.raceNumber));

      // racesテーブルからもNAR開催情報を取得
      const narRacesInMonth = await db
        .select({
          raceDate: races.raceDate,
          venueName: races.venueName,
          grade: races.grade,
          raceName: races.raceName,
        })
        .from(races)
        .where(and(
          gte(races.raceDate, startDate),
          lte(races.raceDate, endDate),
          eq(races.organizer, "NAR")
        ))
        .orderBy(asc(races.raceDate), asc(races.venueName));

      // 日ごとにグループ化（JRA/NAR区別）
      const dayMap: Record<string, { jraVenues: string[]; narVenues: string[]; gradeRaces: Array<{ name: string; grade: string; venue: string; organizer: string }> }> = {};
      for (const s of schedules) {
        if (!dayMap[s.raceDate]) {
          dayMap[s.raceDate] = { jraVenues: [], narVenues: [], gradeRaces: [] };
        }
        const dayData = dayMap[s.raceDate]!;
        if (s.organizer === "NAR") {
          if (!dayData.narVenues.includes(s.venue)) {
            dayData.narVenues.push(s.venue);
          }
        } else {
          if (!dayData.jraVenues.includes(s.venue)) {
            dayData.jraVenues.push(s.venue);
          }
        }
        if (s.grade && s.grade.startsWith("G")) {
          if (!dayData.gradeRaces.some(g => g.name === s.raceName)) {
            dayData.gradeRaces.push({ name: s.raceName, grade: s.grade, venue: s.venue, organizer: s.organizer });
          }
        }
      }

      // racesテーブルのNARデータもカレンダーに反映
      for (const nr of narRacesInMonth) {
        if (!dayMap[nr.raceDate]) {
          dayMap[nr.raceDate] = { jraVenues: [], narVenues: [], gradeRaces: [] };
        }
        const dayData = dayMap[nr.raceDate]!;
        if (!dayData.narVenues.includes(nr.venueName)) {
          dayData.narVenues.push(nr.venueName);
        }
        if (nr.grade && nr.grade.startsWith("G")) {
          if (!dayData.gradeRaces.some(g => g.name === nr.raceName)) {
            dayData.gradeRaces.push({ name: nr.raceName, grade: nr.grade, venue: nr.venueName, organizer: "NAR" });
          }
        }
      }

      const days = Object.entries(dayMap).map(([date, data]) => ({
        date,
        day: parseInt(date.split("-")[2]!),
        jraVenues: data.jraVenues,
        narVenues: data.narVenues,
        venues: [...data.jraVenues, ...data.narVenues], // 後方互換
        gradeRaces: data.gradeRaces,
      }));

      // 全グレードレース
      const gradeRaces = schedules
        .filter(s => s.grade && s.grade.startsWith("G"))
        .map(s => ({
          date: s.raceDate,
          raceName: s.raceName,
          grade: s.grade!,
          venue: s.venue,
          raceNumber: s.raceNumber,
          startTime: s.startTime,
        }));

      // 重複除去
      const uniqueGradeRaces = gradeRaces.filter((race, index, self) =>
        index === self.findIndex(r => r.date === race.date && r.raceName === race.raceName)
      );

      return { days, gradeRaces: uniqueGradeRaces };
    }),

  /**
   * 日付範囲でスケジュール取得
   */
  getByDateRange: publicProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];

      const result = await db
        .select()
        .from(raceSchedules)
        .where(and(gte(raceSchedules.raceDate, input.startDate), lte(raceSchedules.raceDate, input.endDate)))
        .orderBy(asc(raceSchedules.raceDate), asc(raceSchedules.venue), asc(raceSchedules.raceNumber));

      return result;
    }),
});

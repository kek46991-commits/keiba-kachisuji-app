import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { horseMaster, jockeyMaster, entries, paddockObservations, paddockPatterns } from "../drizzle/schema";
import { eq, like, sql, desc, and } from "drizzle-orm";
import { calculateShenConditionScore, generateShenDiagnosis } from "./paddockShenEngine.ts";

export const encyclopediaRouter = router({
  // 馬図鑑一覧
  getHorses: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      affiliation: z.enum(["JRA", "NAR", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { horses: [], total: 0 };

      const conditions = [];
      if (input.search) {
        conditions.push(like(horseMaster.name, `%${input.search}%`));
      }
      if (input.affiliation !== "all") {
        conditions.push(eq(horseMaster.affiliation, input.affiliation));
      }

      const whereClause = conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

      const result = await db
        .select()
        .from(horseMaster)
        .where(whereClause)
        .orderBy(desc(horseMaster.totalEarnings))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(horseMaster)
        .where(whereClause);

      return {
        horses: result,
        total: countResult?.count ?? 0,
      };
    }),

  // 馬詳細
  getHorseDetail: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [horse] = await db
        .select()
        .from(horseMaster)
        .where(eq(horseMaster.id, input.id))
        .limit(1);

      if (!horse) return null;

      // 出走履歴を取得
      const raceHistory = await db
        .select()
        .from(entries)
        .where(like(entries.horseName, `%${horse.name}%`))
        .orderBy(desc(entries.createdAt))
        .limit(20);

      return {
        horse,
        raceHistory,
      };
    }),

  // 騎手一覧
  getJockeys: publicProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      affiliation: z.enum(["JRA", "NAR", "all"]).default("all"),
      sortBy: z.enum(["winRate", "totalWins", "yearWins", "placeRate", "showRate"]).default("totalWins"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { jockeys: [], total: 0 };

      const conditions = [];
      if (input.search) {
        conditions.push(like(jockeyMaster.name, `%${input.search}%`));
      }
      if (input.affiliation !== "all") {
        conditions.push(eq(jockeyMaster.affiliation, input.affiliation));
      }

      const whereClause = conditions.length > 0
        ? sql`${sql.join(conditions, sql` AND `)}`
        : undefined;

      const sortColumn = {
        winRate: jockeyMaster.winRate,
        totalWins: jockeyMaster.totalWins,
        yearWins: jockeyMaster.yearWins,
        placeRate: jockeyMaster.placeRate,
        showRate: jockeyMaster.showRate,
      }[input.sortBy];

      const result = await db
        .select()
        .from(jockeyMaster)
        .where(whereClause)
        .orderBy(desc(sortColumn))
        .limit(input.limit)
        .offset(input.offset);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)` })
        .from(jockeyMaster)
        .where(whereClause);

      return {
        jockeys: result,
        total: countResult?.count ?? 0,
      };
    }),

  // 騎手詳細
  getJockeyDetail: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;

      const [jockey] = await db
        .select()
        .from(jockeyMaster)
        .where(eq(jockeyMaster.id, input.id))
        .limit(1);

      if (!jockey) return null;

      // 騎乗履歴を取得
      const rideHistory = await db
        .select()
        .from(entries)
        .where(like(entries.jockey, `%${jockey.name}%`))
        .orderBy(desc(entries.createdAt))
        .limit(30);

      return {
        jockey,
        rideHistory,
      };
    }),

  // パドック観察記録を保存
  recordPaddockObservation: publicProcedure
    .input(z.object({
      horseName: z.string(),
      raceId: z.string(),
      raceDate: z.string(),
      heartRate: z.number().optional(),
      horseWeight: z.number().optional(),
      weightDiff: z.number().optional(),
      sweatLevel: z.number().min(0).max(3).optional(),
      gaitScore: z.number().min(1).max(5).optional(),
      eyeBrightness: z.number().min(1).max(5).optional(),
      excitementLevel: z.number().min(1).max(5).optional(),
      concentrationLevel: z.number().min(1).max(5).optional(),
      obedienceLevel: z.number().min(1).max(5).optional(),
      fatigueLevel: z.number().min(1).max(5).optional(),
      preEjaculation: z.number().min(0).max(1).optional(),
      coatSheen: z.number().min(1).max(5).optional(),
      muscleTone: z.number().min(1).max(5).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB not available");

      // Shen AI体調スコア計算
      const conditionScore = calculateShenConditionScore(input);
      const diagnosis = generateShenDiagnosis(input, conditionScore);

      await db.insert(paddockObservations).values({
        ...input,
        conditionScore,
      });

      return {
        conditionScore,
        diagnosis,
      };
    }),

  // 馬のパドック履歴を取得
  getHorsePaddockHistory: publicProcedure
    .input(z.object({
      horseName: z.string(),
      limit: z.number().default(10),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { observations: [], pattern: null };

      const observations = await db
        .select()
        .from(paddockObservations)
        .where(eq(paddockObservations.horseName, input.horseName))
        .orderBy(desc(paddockObservations.createdAt))
        .limit(input.limit);

      // パターンも取得
      const patterns = await db
        .select()
        .from(paddockPatterns)
        .where(eq(paddockPatterns.horseName, input.horseName));

      return {
        observations,
        patterns,
      };
    }),

  // Shen AI体調診断（リアルタイム）
  diagnoseCondition: publicProcedure
    .input(z.object({
      horseName: z.string(),
      heartRate: z.number().optional(),
      horseWeight: z.number().optional(),
      weightDiff: z.number().optional(),
      sweatLevel: z.number().optional(),
      gaitScore: z.number().optional(),
      eyeBrightness: z.number().optional(),
      excitementLevel: z.number().optional(),
      concentrationLevel: z.number().optional(),
      obedienceLevel: z.number().optional(),
      fatigueLevel: z.number().optional(),
      preEjaculation: z.number().optional(),
      coatSheen: z.number().optional(),
      muscleTone: z.number().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      // 体調スコア計算
      const conditionScore = calculateShenConditionScore(input);
      const diagnosis = generateShenDiagnosis(input, conditionScore);

      // 過去パターンと照合
      let matchedPattern = null;
      let expectedFinish = null;
      let top3Probability = null;

      if (db) {
        const patterns = await db
          .select()
          .from(paddockPatterns)
          .where(eq(paddockPatterns.horseName, input.horseName));

        if (patterns.length > 0) {
          // スコアに最も近いパターンを探す
          const sortedPatterns = patterns.sort((a, b) => {
            const scoreA = a.sampleCount ?? 0;
            const scoreB = b.sampleCount ?? 0;
            return scoreB - scoreA;
          });
          matchedPattern = sortedPatterns[0];
          expectedFinish = matchedPattern.avgFinish;
          top3Probability = matchedPattern.top3Rate;
        }
      }

      // アラート生成
      const alerts: string[] = [];
      if ((input.excitementLevel ?? 0) >= 5)
        alerts.push("過度の興奮状態 - レースで折り合い不安");
      if ((input.fatigueLevel ?? 0) >= 4)
        alerts.push("疲弊兆候あり - 前走からの回復不足の可能性");
      if (input.preEjaculation === 1)
        alerts.push("射精前兆候 - 集中力低下リスク");
      if ((input.sweatLevel ?? 0) >= 3)
        alerts.push("多量発汗 - 緊張/体調不良の可能性");
      if (input.heartRate && input.heartRate > 50)
        alerts.push("心拍数異常高値 - ストレス/疾患の可能性");
      if ((input.gaitScore ?? 3) <= 2)
        alerts.push("歩様に不安 - 脚元の問題の可能性");

      return {
        conditionScore,
        conditionLabel: conditionScore >= 80 ? "絶好調" :
          conditionScore >= 65 ? "好調" :
          conditionScore >= 45 ? "普通" :
          conditionScore >= 30 ? "不調" : "危険",
        diagnosis,
        matchedPattern: matchedPattern?.patternType ?? null,
        expectedFinish,
        top3Probability,
        alerts,
      };
    }),
});

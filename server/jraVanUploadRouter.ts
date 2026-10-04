import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { combinationOdds, entries, officialDataImports, raceOdds, races } from "../drizzle/schema";
import { getDb } from "./db";
import { recordOddsSnapshots } from "./oddsEngine";
import { parseOfficialOddsContent } from "./officialOddsImport";
import { parseOfficialCombinationOddsContent } from "./officialCombinationOddsImport";
import { getMinutesToRaceStart } from "./scheduled/fetchNarOdds";
import { evaluateTrigamiRisk, getLatestCombinationOddsQuotes } from "./combinationOddsRisk";
import { assertPublicOddsImportAllowed } from "./publicOddsImportGuard";

/**
 * Windows JV-Linkを要求しないWeb完結の公式データ取込口。
 * 利用キーは一切受け取らず、ユーザーが正規に取得したCSV/JSONだけを検証・保存する。
 */
export const jraVanUploadRouter = router({
  importOddsFile: adminProcedure
    .input(z.object({
      content: z.string().min(1).max(2 * 1024 * 1024),
      format: z.enum(["csv", "json"]),
      fallbackRaceId: z.string().regex(/^\d{8,32}$/).optional(),
      fileName: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPublicOddsImportAllowed(input.content, input.fileName);
      const parsed = parseOfficialOddsContent(input.content, input.format, input.fallbackRaceId);
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");

      const [race] = await db.select({
        raceId: races.raceId,
        organizer: races.organizer,
        raceDate: races.raceDate,
        postTime: races.postTime,
      })
        .from(races)
        .where(eq(races.raceId, parsed.raceId))
        .limit(1);
      if (!race) throw new Error(`レースID ${parsed.raceId} が見つかりません。先に公式レース一覧・出馬表を取り込んでください。`);
      if (race.organizer !== "JRA" && race.organizer !== "NAR") throw new Error("公式オッズ取込はJRAまたはNARレースだけに使用できます。");

      const dbEntries = await db.select({ horseNumber: entries.horseNumber, horseName: entries.horseName })
        .from(entries)
        .where(eq(entries.raceId, parsed.raceId));
      const entryByNumber = new Map(dbEntries.map(entry => [entry.horseNumber, entry]));
      const missing = parsed.odds.filter(row => !entryByNumber.has(row.horseNumber));
      if (missing.length > 0) {
        throw new Error(`出馬表に存在しない馬番があります: ${missing.map(row => row.horseNumber).join(", ")}。公式出馬表を先に取り込んでください。`);
      }

      let updated = 0;
      for (const row of parsed.odds) {
        const updateValues: { odds: number; popularity?: number } = { odds: row.winOdds };
        if (row.popularity) updateValues.popularity = row.popularity;
        await db.update(entries)
          .set(updateValues)
          .where(and(eq(entries.raceId, parsed.raceId), eq(entries.horseNumber, row.horseNumber)));
        updated += 1;
      }

      const minutesToStart = getMinutesToRaceStart(race.raceDate, race.postTime);
      const signals = await recordOddsSnapshots(db, {
        raceId: parsed.raceId,
        // 取込時刻を正確に保存し、発走10分前の急変判定・履歴表示に利用する。
        minutesToStart: Math.max(0, minutesToStart ?? 0),
        odds: parsed.odds.map(row => ({
          horseNumber: row.horseNumber,
          horseName: entryByNumber.get(row.horseNumber)?.horseName ?? row.horseName ?? "",
          winOdds: row.winOdds,
          placeOddsMin: row.placeOddsMin,
          placeOddsMax: row.placeOddsMax,
        })),
      });

      await db.insert(officialDataImports).values({
        raceId: parsed.raceId,
        source: `${race.organizer}公式オッズファイル`,
        fileName: input.fileName?.trim() || null,
        fileFormat: input.format,
        rowCount: parsed.odds.length,
        importedByOpenId: ctx.user.openId,
      });

      // 必ずSELECTして、反映対象の件数・最新保存時刻を返す。
      const savedOdds = await db.select({
        horseNumber: raceOdds.horseNumber,
        winOdds: raceOdds.winOdds,
        fetchedAt: raceOdds.fetchedAt,
      })
        .from(raceOdds)
        .where(eq(raceOdds.raceId, parsed.raceId))
        .orderBy(desc(raceOdds.fetchedAt), desc(raceOdds.id))
        .limit(parsed.odds.length);

      return {
        raceId: parsed.raceId,
        organizer: race.organizer,
        updated,
        signals,
        verifiedRows: savedOdds.length,
        latestSavedAt: savedOdds[0]?.fetchedAt ?? null,
        minutesToStart,
      };
    }),

  importCombinationOddsFile: adminProcedure
    .input(z.object({
      content: z.string().min(1).max(2 * 1024 * 1024),
      format: z.enum(["csv", "json"]),
      fallbackRaceId: z.string().regex(/^\d{8,32}$/).optional(),
      fileName: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      assertPublicOddsImportAllowed(input.content, input.fileName);
      const parsed = parseOfficialCombinationOddsContent(input.content, input.format, input.fallbackRaceId);
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      const [race] = await db.select({
        raceId: races.raceId,
        organizer: races.organizer,
        raceDate: races.raceDate,
        postTime: races.postTime,
      }).from(races).where(eq(races.raceId, parsed.raceId)).limit(1);
      if (!race) throw new Error(`レースID ${parsed.raceId} が見つかりません。先に公式レース一覧・出馬表を取り込んでください。`);

      const minutesToStart = getMinutesToRaceStart(race.raceDate, race.postTime);
      const fetchedAt = new Date();
      await db.insert(combinationOdds).values(parsed.odds.map(row => ({
        raceId: parsed.raceId,
        betType: row.betType,
        combination: row.combination,
        odds: row.odds.toFixed(1),
        fetchedAt,
        minutesToStart: Math.max(0, minutesToStart ?? 0),
      })));
      await db.insert(officialDataImports).values({
        raceId: parsed.raceId,
        source: `${race.organizer}公式組合せオッズファイル`,
        fileName: input.fileName?.trim() || null,
        fileFormat: input.format,
        rowCount: parsed.odds.length,
        importedByOpenId: ctx.user.openId,
      });

      const saved = await db.select({ id: combinationOdds.id, fetchedAt: combinationOdds.fetchedAt })
        .from(combinationOdds)
        .where(eq(combinationOdds.raceId, parsed.raceId))
        .orderBy(desc(combinationOdds.fetchedAt), desc(combinationOdds.id))
        .limit(parsed.odds.length);
      return {
        raceId: parsed.raceId,
        organizer: race.organizer,
        imported: parsed.odds.length,
        verifiedRows: saved.length,
        latestSavedAt: saved[0]?.fetchedAt ?? null,
        minutesToStart,
      };
    }),

  getTrigamiRisk: publicProcedure
    .input(z.object({
      raceId: z.string().regex(/^\d{8,32}$/),
      formation: z.object({
        axis: z.number().int().min(1).max(18),
        second: z.array(z.number().int().min(1).max(18)).max(10),
        third: z.array(z.number().int().min(1).max(18)).max(10),
        trioPartners: z.array(z.number().int().min(1).max(18)).max(10),
      }),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      const quotes = await getLatestCombinationOddsQuotes(db, input.raceId);
      return evaluateTrigamiRisk(input.formation, quotes);
    }),

  getRaceImportStatus: adminProcedure
    .input(z.object({ raceId: z.string().regex(/^\d{8,32}$/) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      const [latest] = await db.select({ fetchedAt: raceOdds.fetchedAt })
        .from(raceOdds)
        .where(eq(raceOdds.raceId, input.raceId))
        .orderBy(desc(raceOdds.fetchedAt), desc(raceOdds.id))
        .limit(1);
      const [latestCombination] = await db.select({ fetchedAt: combinationOdds.fetchedAt })
        .from(combinationOdds)
        .where(eq(combinationOdds.raceId, input.raceId))
        .orderBy(desc(combinationOdds.fetchedAt), desc(combinationOdds.id))
        .limit(1);
      return {
        raceId: input.raceId,
        lastOddsImportedAt: latest?.fetchedAt ?? null,
        lastCombinationOddsImportedAt: latestCombination?.fetchedAt ?? null,
      };
    }),

  listImportHistory: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      return db.select({
        id: officialDataImports.id,
        raceId: officialDataImports.raceId,
        source: officialDataImports.source,
        fileName: officialDataImports.fileName,
        fileFormat: officialDataImports.fileFormat,
        rowCount: officialDataImports.rowCount,
        importedAt: officialDataImports.importedAt,
        raceName: races.raceName,
        venueName: races.venueName,
        raceDate: races.raceDate,
        raceNumber: races.raceNumber,
      })
        .from(officialDataImports)
        .leftJoin(races, eq(officialDataImports.raceId, races.raceId))
        .orderBy(desc(officialDataImports.importedAt), desc(officialDataImports.id))
        .limit(input?.limit ?? 30);
    }),

  getOddsTimeline: adminProcedure
    .input(z.object({
      raceId: z.string().regex(/^\d{8,32}$/),
      horseNumbers: z.array(z.number().int().min(1).max(18)).max(6).optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      const conditions = [eq(raceOdds.raceId, input.raceId)];
      if (input.horseNumbers?.length) {
        conditions.push(sql`${raceOdds.horseNumber} IN (${sql.join(input.horseNumbers.map(number => sql`${number}`), sql`,`)})`);
      }
      const snapshots = await db.select({
        horseNumber: raceOdds.horseNumber,
        horseName: raceOdds.horseName,
        winOdds: raceOdds.winOdds,
        placeOddsMin: raceOdds.placeOddsMin,
        placeOddsMax: raceOdds.placeOddsMax,
        fetchedAt: raceOdds.fetchedAt,
        minutesToStart: raceOdds.minutesToStart,
      })
        .from(raceOdds)
        .where(and(...conditions))
        .orderBy(raceOdds.fetchedAt, raceOdds.horseNumber);
      const horses = Array.from(new Map(snapshots.map(snapshot => [snapshot.horseNumber, {
        horseNumber: snapshot.horseNumber,
        horseName: snapshot.horseName || `${snapshot.horseNumber}番`,
      }])).values());
      return { raceId: input.raceId, horses, snapshots };
    }),
});

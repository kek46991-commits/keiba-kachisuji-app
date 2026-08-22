import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { syntheticPredictionEntries, syntheticPredictionOutputs, syntheticPredictionRuns } from "../drizzle/schema";
import { formatBetSelectionForDisplay } from "../shared/formationDisplay";
import { type HorseNameMap, restoreHorseNamesInText, withResolvedHorseNames } from "../shared/horseNameMapping";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { getHorseNameMap, listRaceEntryMaster, upsertRaceEntryMaster } from "./raceEntryMaster";
import { SYNTHETIC_RACE_A_RACE_KEY, SYNTHETIC_RACE_A_RACE_NAME, syntheticRaceAEntryMaster } from "./raceEntryMasterSeed";
import { buildSyntheticRaceA, SYNTHETIC_RACE_A_RUN_ID } from "./syntheticPredictionPipeline";

const ticketTextFields = ["trifecta", "trio", "quinella", "wide", "exacta"] as const;

/**
 * 保存済み買い目JSONを表示用に整える。
 * ダミー馬名は出走表マスターの馬名へ置換し、フォーメーション表記は1着ごとの分岐表記へ整形する。
 */
function resolveTicketsForDisplay(
  tickets: Record<string, unknown> | null,
  entries: readonly { horseNumber: number; horseName: string }[],
  nameMap: HorseNameMap,
): Record<string, unknown> | null {
  if (!tickets) return null;
  const resolved: Record<string, unknown> = { ...tickets };
  for (const field of ticketTextFields) {
    const value = resolved[field];
    if (typeof value !== "string") continue;
    resolved[field] = formatBetSelectionForDisplay(restoreHorseNamesInText(value, entries, nameMap));
  }
  if (Array.isArray(resolved.reasoning)) {
    resolved.reasoning = resolved.reasoning.map((line) =>
      typeof line === "string" ? restoreHorseNamesInText(line, entries, nameMap) : line,
    );
  }
  return resolved;
}

function parseTickets(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const syntheticPredictionRouter = router({
  getLatest: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    const [run] = await db.select().from(syntheticPredictionRuns).orderBy(desc(syntheticPredictionRuns.createdAt)).limit(1);
    if (!run) return null;
    const entries = await db.select().from(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, run.runId)).orderBy(syntheticPredictionEntries.horseNumber);
    const [output] = await db.select().from(syntheticPredictionOutputs).where(eq(syntheticPredictionOutputs.runId, run.runId)).limit(1);
    // 保存データは書き換えず、表示時点で馬番から本物の馬名を解決する。
    const nameMap = await getHorseNameMap(db, run.raceKey);
    return {
      run,
      entries: withResolvedHorseNames(entries, nameMap),
      entryMasterCount: nameMap.size,
      scoreTickets: resolveTicketsForDisplay(parseTickets(output?.scoreTickets), entries, nameMap),
      longshotTickets: resolveTicketsForDisplay(parseTickets(output?.longshotTickets), entries, nameMap),
    };
  }),

  /** レースごとの「馬番 → 本物の馬名」を出走表マスターへ登録する。 */
  upsertEntryMaster: adminProcedure
    .input(z.object({
      raceKey: z.string().min(1).max(64),
      raceName: z.string().max(128).optional(),
      entries: z.array(z.object({
        horseNumber: z.number().int().positive(),
        horseName: z.string().min(1).max(64),
        jockey: z.string().max(64).optional(),
        popularity: z.number().int().positive().optional(),
        odds: z.number().positive().optional(),
      })).min(1),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      const saved = await upsertRaceEntryMaster(db, input);
      return { raceKey: input.raceKey, savedEntries: saved };
    }),

  listEntryMaster: publicProcedure
    .input(z.object({ raceKey: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB接続エラー");
      return listRaceEntryMaster(db, input.raceKey);
    }),

  seedRaceA: adminProcedure.input(z.object({ confirmSyntheticOnly: z.literal(true) })).mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    const generated = buildSyntheticRaceA();
    const [existing] = await db.select().from(syntheticPredictionRuns).where(eq(syntheticPredictionRuns.runId, SYNTHETIC_RACE_A_RUN_ID)).limit(1);
    if (existing) {
      await db.delete(syntheticPredictionOutputs).where(eq(syntheticPredictionOutputs.runId, SYNTHETIC_RACE_A_RUN_ID));
      await db.delete(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, SYNTHETIC_RACE_A_RUN_ID));
      await db.update(syntheticPredictionRuns).set({ raceKey: SYNTHETIC_RACE_A_RACE_KEY }).where(eq(syntheticPredictionRuns.runId, SYNTHETIC_RACE_A_RUN_ID));
    } else {
      await db.insert(syntheticPredictionRuns).values({ runId: SYNTHETIC_RACE_A_RUN_ID, label: "架空テストレースA", isSynthetic: true, raceKey: SYNTHETIC_RACE_A_RACE_KEY });
    }
    await db.insert(syntheticPredictionEntries).values(generated.entries.map((entry) => ({
      runId: SYNTHETIC_RACE_A_RUN_ID,
      horseNumber: entry.horseNumber,
      horseName: entry.horseName,
      popularity: entry.popularity,
      odds: entry.odds,
      timeDm: entry.timeDm,
      score: entry.score,
    })));
    await db.insert(syntheticPredictionOutputs).values({
      runId: SYNTHETIC_RACE_A_RUN_ID,
      scoreTickets: JSON.stringify(generated.scoreTickets),
      longshotTickets: JSON.stringify(generated.longshotTickets),
    });
    // 予想データと同じ馬番構成の出走表マスターを用意し、表示時に本物の馬名へ解決できるようにする。
    const savedMaster = await upsertRaceEntryMaster(db, {
      raceKey: SYNTHETIC_RACE_A_RACE_KEY,
      raceName: SYNTHETIC_RACE_A_RACE_NAME,
      entries: syntheticRaceAEntryMaster,
    });
    const verified = await db.select().from(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, SYNTHETIC_RACE_A_RUN_ID));
    return { runId: SYNTHETIC_RACE_A_RUN_ID, verifiedEntries: verified.length, savedEntryMaster: savedMaster };
  }),
});

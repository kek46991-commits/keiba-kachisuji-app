import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { syntheticPredictionEntries, syntheticPredictionOutputs, syntheticPredictionRuns } from "../drizzle/schema";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { buildSyntheticRaceA, SYNTHETIC_RACE_A_RUN_ID } from "./syntheticPredictionPipeline";

export const syntheticPredictionRouter = router({
  getLatest: publicProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    const [run] = await db.select().from(syntheticPredictionRuns).orderBy(desc(syntheticPredictionRuns.createdAt)).limit(1);
    if (!run) return null;
    const entries = await db.select().from(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, run.runId)).orderBy(syntheticPredictionEntries.horseNumber);
    const [output] = await db.select().from(syntheticPredictionOutputs).where(eq(syntheticPredictionOutputs.runId, run.runId)).limit(1);
    return {
      run,
      entries,
      scoreTickets: output ? JSON.parse(output.scoreTickets) : null,
      longshotTickets: output ? JSON.parse(output.longshotTickets) : null,
    };
  }),

  seedRaceA: adminProcedure.input(z.object({ confirmSyntheticOnly: z.literal(true) })).mutation(async () => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    const generated = buildSyntheticRaceA();
    const [existing] = await db.select().from(syntheticPredictionRuns).where(eq(syntheticPredictionRuns.runId, SYNTHETIC_RACE_A_RUN_ID)).limit(1);
    if (existing) {
      await db.delete(syntheticPredictionOutputs).where(eq(syntheticPredictionOutputs.runId, SYNTHETIC_RACE_A_RUN_ID));
      await db.delete(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, SYNTHETIC_RACE_A_RUN_ID));
    } else {
      await db.insert(syntheticPredictionRuns).values({ runId: SYNTHETIC_RACE_A_RUN_ID, label: "架空テストレースA", isSynthetic: true });
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
    const verified = await db.select().from(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, SYNTHETIC_RACE_A_RUN_ID));
    return { runId: SYNTHETIC_RACE_A_RUN_ID, verifiedEntries: verified.length };
  }),
});

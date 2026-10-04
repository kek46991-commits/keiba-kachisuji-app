import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { syntheticPredictionEntries, syntheticPredictionOutputs, syntheticPredictionRuns } from "./drizzle/schema";
import { upsertRaceEntryMaster } from "./server/raceEntryMaster";
import { SYNTHETIC_RACE_A_RACE_KEY, SYNTHETIC_RACE_A_RACE_NAME, syntheticRaceAEntryMaster } from "./server/raceEntryMasterSeed";
import { buildSyntheticRaceA, SYNTHETIC_RACE_A_RUN_ID } from "./server/syntheticPredictionPipeline";

const db = drizzle(process.env.DATABASE_URL!) as never as Parameters<typeof upsertRaceEntryMaster>[0];
const anyDb = db as any;

const generated = buildSyntheticRaceA();
await anyDb.delete(syntheticPredictionOutputs).where(eq(syntheticPredictionOutputs.runId, SYNTHETIC_RACE_A_RUN_ID));
await anyDb.delete(syntheticPredictionEntries).where(eq(syntheticPredictionEntries.runId, SYNTHETIC_RACE_A_RUN_ID));
await anyDb.delete(syntheticPredictionRuns).where(eq(syntheticPredictionRuns.runId, SYNTHETIC_RACE_A_RUN_ID));
await anyDb.insert(syntheticPredictionRuns).values({ runId: SYNTHETIC_RACE_A_RUN_ID, label: "架空テストレースA", isSynthetic: true, raceKey: SYNTHETIC_RACE_A_RACE_KEY });
await anyDb.insert(syntheticPredictionEntries).values(generated.entries.map((entry) => ({ runId: SYNTHETIC_RACE_A_RUN_ID, ...entry })));
await anyDb.insert(syntheticPredictionOutputs).values({ runId: SYNTHETIC_RACE_A_RUN_ID, scoreTickets: JSON.stringify(generated.scoreTickets), longshotTickets: JSON.stringify(generated.longshotTickets) });
await upsertRaceEntryMaster(db, { raceKey: SYNTHETIC_RACE_A_RACE_KEY, raceName: SYNTHETIC_RACE_A_RACE_NAME, entries: syntheticRaceAEntryMaster });
console.log("seeded", JSON.stringify(generated.scoreTickets), JSON.stringify(generated.longshotTickets));
process.exit(0);

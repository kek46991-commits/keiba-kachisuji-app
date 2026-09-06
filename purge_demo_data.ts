/**
 * デモ用シードで投入されたレース・出走馬・払戻・予想を削除する。
 * 本番は JRA/NAR の実データのみを表示するため、起動時に実行される。
 */
import { drizzle } from "drizzle-orm/mysql2";
import { inArray, like, or, sql } from "drizzle-orm";
import { entries, payouts, predictions, raceEntryMaster, races } from "./drizzle/schema";

const db = drizzle(process.env.DATABASE_URL!);
const anyDb = db as any;

const demoRaceIds = ["20260822CHUKYO09", "20260822OOI11"];

const demoRaces: Array<{ raceId: string }> = await anyDb
  .select({ raceId: races.raceId })
  .from(races)
  .where(or(inArray(races.raceId, demoRaceIds), like(races.raceName, "%デモ%")));

const targetIds = Array.from(new Set([...demoRaceIds, ...demoRaces.map((r) => r.raceId)]));

await anyDb.delete(payouts).where(inArray(payouts.raceId, targetIds));
await anyDb.delete(entries).where(inArray(entries.raceId, targetIds));
await anyDb.delete(predictions).where(inArray(predictions.raceId, targetIds));
await anyDb.delete(raceEntryMaster).where(inArray(raceEntryMaster.raceKey, targetIds));
await anyDb.delete(races).where(inArray(races.raceId, targetIds));

console.log(`[purge_demo_data] removed ${targetIds.length} demo races: ${targetIds.join(", ")}`);

// 旧取込ロジックが独自の競馬場コードでraceIdを組み立てていたため、
// netkeibaのレースIDと整合しない行が重複して残る。実データのみを表示するため削除する。
const legacy: Array<{ raceId: string }> = await anyDb.execute(
  sql`select raceId from races
      where (netkeibaRaceId is not null and venueCode <> substring(netkeibaRaceId, 5, 2))
         or (organizer = 'JRA' and cast(venueCode as unsigned) > 10)
         or (organizer = 'NAR' and cast(venueCode as unsigned) <= 10)`,
).then((rows: unknown) => (Array.isArray(rows) ? (rows[0] as Array<{ raceId: string }>) : []));
const legacyIds = legacy.map((row) => row.raceId);

if (legacyIds.length > 0) {
  await anyDb.delete(payouts).where(inArray(payouts.raceId, legacyIds));
  await anyDb.delete(entries).where(inArray(entries.raceId, legacyIds));
  await anyDb.delete(predictions).where(inArray(predictions.raceId, legacyIds));
  await anyDb.delete(raceEntryMaster).where(inArray(raceEntryMaster.raceKey, legacyIds));
  await anyDb.delete(races).where(inArray(races.raceId, legacyIds));
}
console.log(`[purge_demo_data] removed ${legacyIds.length} legacy races with inconsistent raceId`);
process.exit(0);

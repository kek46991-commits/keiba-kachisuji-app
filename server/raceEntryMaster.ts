import { asc, eq } from "drizzle-orm";
import { raceEntryMaster } from "../drizzle/schema";
import { buildHorseNameMap, type HorseNameMap } from "../shared/horseNameMapping";
import { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type RaceEntryMasterInput = {
  horseNumber: number;
  horseName: string;
  jockey?: string | null;
  popularity?: number | null;
  odds?: number | null;
};

/** 出走表マスターへレース単位で登録・更新する。既存の馬番は上書きする。 */
export async function upsertRaceEntryMaster(
  db: Db,
  input: { raceKey: string; raceName?: string | null; entries: RaceEntryMasterInput[] },
): Promise<number> {
  const rows = input.entries.filter((entry) => Number.isInteger(entry.horseNumber) && entry.horseNumber > 0 && entry.horseName.trim());
  if (rows.length === 0) return 0;
  for (const entry of rows) {
    const values = {
      raceKey: input.raceKey,
      raceName: input.raceName ?? null,
      horseNumber: entry.horseNumber,
      horseName: entry.horseName.trim(),
      jockey: entry.jockey ?? null,
      popularity: entry.popularity ?? null,
      odds: entry.odds ?? null,
    };
    await db
      .insert(raceEntryMaster)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          raceName: values.raceName,
          horseName: values.horseName,
          jockey: values.jockey,
          popularity: values.popularity,
          odds: values.odds,
          updatedAt: new Date(),
        },
      });
  }
  return rows.length;
}

/** レースキーに対応する出走表マスター行を馬番順に取得する。 */
export async function listRaceEntryMaster(db: Db, raceKey: string) {
  return db
    .select()
    .from(raceEntryMaster)
    .where(eq(raceEntryMaster.raceKey, raceKey))
    .orderBy(asc(raceEntryMaster.horseNumber));
}

/** 「馬番 → 本物の馬名」の対応表を取得する。マスター未登録なら空の対応表を返す。 */
export async function getHorseNameMap(db: Db, raceKey: string | null | undefined): Promise<HorseNameMap> {
  if (!raceKey) return new Map();
  const rows = await listRaceEntryMaster(db, raceKey);
  return buildHorseNameMap(rows);
}

import { and, eq, or } from "drizzle-orm";
import { races } from "../drizzle/schema";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type NarRaceRequestContext = {
  raceId: string;
  venue?: string;
  raceDate?: string;
  raceNumber?: number;
  raceName?: string;
  surface?: string;
  distance?: number;
  trackCondition?: string | null;
};

export type NarRaceValidation = {
  canonicalRaceId: string | null;
  venue: string | null;
  surface: string | null;
  distance: number | null;
  trackCondition: string | null;
  warnings: string[];
};

/**
 * NARレースを保存済みスケジュールへ厳密に結び付ける。
 * 日付のみ・レース番号±1のような曖昧な一致は許可しない。
 */
export async function resolveValidatedNarRace(db: Db | null, request: NarRaceRequestContext): Promise<NarRaceValidation> {
  if (!db) {
    return { canonicalRaceId: null, venue: null, surface: null, distance: null, trackCondition: null, warnings: ["DBに接続できないためレース条件を検証できません"] };
  }

  let race = (await db.select().from(races)
    .where(or(eq(races.raceId, request.raceId), eq(races.netkeibaRaceId, request.raceId)))
    .limit(1))[0];

  // netkeiba IDが未マッピングの場合も、開催日・競馬場・R番の三条件が全一致した時だけ採用する。
  if (!race && request.raceDate && request.venue && request.raceNumber) {
    race = (await db.select().from(races)
      .where(and(
        eq(races.raceDate, request.raceDate),
        eq(races.venueName, request.venue),
        eq(races.raceNumber, request.raceNumber),
        eq(races.organizer, "NAR"),
      ))
      .limit(1))[0];
    if (race && !race.netkeibaRaceId) {
      await db.update(races).set({ netkeibaRaceId: request.raceId }).where(eq(races.raceId, race.raceId));
    }
  }

  if (!race) {
    return { canonicalRaceId: null, venue: null, surface: null, distance: null, trackCondition: null, warnings: ["日付・競馬場・レース番号が全一致するレースを確認できません"] };
  }

  const warnings: string[] = [];
  if (request.distance && race.distance && request.distance !== race.distance) {
    warnings.push(`距離不整合を検知: 入力${request.distance}m → 正規データ${race.distance}mを採用`);
  }
  if (request.surface && race.surface && request.surface !== race.surface) {
    warnings.push(`コース不整合を検知: 入力${request.surface} → 正規データ${race.surface}を採用`);
  }
  if (request.venue && race.venueName && request.venue !== race.venueName) {
    warnings.push(`競馬場不整合を検知: 入力${request.venue} → 正規データ${race.venueName}を採用`);
  }
  if (request.raceName && race.raceName) {
    const normalizedInput = request.raceName.replace(/[\s　・☆★()（）]/g, "");
    const normalizedCanonical = race.raceName.replace(/[\s　・☆★()（）]/g, "");
    if (!normalizedInput.includes(normalizedCanonical) && !normalizedCanonical.includes(normalizedInput)) {
      warnings.push(`レース名不整合を検知: 入力「${request.raceName}」→ 正規データ「${race.raceName}」を採用`);
    }
  }

  return {
    canonicalRaceId: race.raceId,
    venue: race.venueName,
    surface: race.surface,
    distance: race.distance,
    trackCondition: race.trackCondition,
    warnings,
  };
}

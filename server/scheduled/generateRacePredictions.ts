import { and, eq, inArray } from "drizzle-orm";
import type { Request, Response } from "express";
import { races } from "../../drizzle/schema";
import { getDb } from "../db";
import { sdk } from "../_core/sdk";
import { generateStructuredPrediction, jstPostTimeToUtc } from "../structuredPredictionService";

/**
 * 発走約10分前の未生成レースだけを処理するHeartbeat。
 * 予想は保存済みなら再生成せず、閲覧時のLLM呼出を避ける。
 */
export async function generateRacePredictionsHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB not available" });
    const now = new Date();
    const candidates = await db.select().from(races).where(and(
      inArray(races.status, ["upcoming", "entries_confirmed"]),
      inArray(races.organizer, ["JRA", "NAR"]),
    ));
    const due = candidates.filter(race => {
      const start = jstPostTimeToUtc(race.raceDate, race.postTime);
      if (!start) return false;
      const minutes = (start.getTime() - now.getTime()) / 60000;
      return minutes >= 9 && minutes <= 11;
    });
    const results = [] as Array<{ raceId: string; state: string; error?: string }>;
    for (const race of due) {
      try {
        const result = await generateStructuredPrediction(db, race.raceId);
        results.push({ raceId: race.raceId, state: result.state });
      } catch (error) {
        console.error("[generateRacePredictions] failed", race.raceId, error);
        results.push({ raceId: race.raceId, state: "failed", error: String(error) });
      }
    }
    return res.json({ ok: true, model: "gpt-5-mini", checked: candidates.length, due: due.length, results });
  } catch (error) {
    console.error("[generateRacePredictions] handler failed", error);
    return res.status(500).json({ error: String(error), timestamp: new Date().toISOString() });
  }
}

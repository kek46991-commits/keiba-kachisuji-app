import { and, desc, eq, sql } from "drizzle-orm";
import { entries, raceOdds, races, structuredPredictionLocks, structuredPredictions } from "../drizzle/schema";
import { invokeLLM } from "./_core/llm";

const MODEL = "gpt-5-mini";
const LOCK_TTL_MS = 5 * 60 * 1000;

export type StructuredSelection = {
  horseNumber: number;
  horseName: string;
  confidence: number;
  rationale: string;
};

export type StructuredPredictionPayload = {
  summary: string;
  winCandidate: StructuredSelection;
  placeCandidates: StructuredSelection[];
  riskLevel: "low" | "medium" | "high";
  riskNotes: string[];
  disclaimer: string;
};

type Db = NonNullable<Awaited<ReturnType<typeof import("./db").getDb>>>;

const predictionSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    winCandidate: {
      type: "object",
      properties: {
        horseNumber: { type: "integer" }, horseName: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 }, rationale: { type: "string" },
      },
      required: ["horseNumber", "horseName", "confidence", "rationale"], additionalProperties: false,
    },
    placeCandidates: {
      type: "array", minItems: 2, maxItems: 3,
      items: {
        type: "object",
        properties: {
          horseNumber: { type: "integer" }, horseName: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 }, rationale: { type: "string" },
        },
        required: ["horseNumber", "horseName", "confidence", "rationale"], additionalProperties: false,
      },
    },
    riskLevel: { type: "string", enum: ["low", "medium", "high"] },
    riskNotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 4 },
    disclaimer: { type: "string" },
  },
  required: ["summary", "winCandidate", "placeCandidates", "riskLevel", "riskNotes", "disclaimer"],
  additionalProperties: false,
} as const;

function isPayload(value: unknown): value is StructuredPredictionPayload {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StructuredPredictionPayload>;
  return typeof candidate.summary === "string"
    && !!candidate.winCandidate
    && Array.isArray(candidate.placeCandidates)
    && ["low", "medium", "high"].includes(candidate.riskLevel ?? "")
    && Array.isArray(candidate.riskNotes)
    && typeof candidate.disclaimer === "string";
}

export function validateStructuredPrediction(
  prediction: StructuredPredictionPayload,
  runners: Array<{ horseNumber: number; horseName: string }>,
): StructuredPredictionPayload {
  const runnersByNumber = new Map(runners.map(runner => [runner.horseNumber, runner.horseName]));
  const selections = [prediction.winCandidate, ...prediction.placeCandidates];
  const numbers = selections.map(selection => selection.horseNumber);
  if (new Set(numbers).size !== numbers.length) throw new Error("構造化予想の候補馬番が重複しています");
  for (const selection of selections) {
    if (runnersByNumber.get(selection.horseNumber) !== selection.horseName) {
      throw new Error(`構造化予想に出馬表と一致しない候補が含まれています: ${selection.horseNumber}`);
    }
  }
  return prediction;
}

export async function getSavedStructuredPrediction(db: Db, raceId: string) {
  const [row] = await db.select().from(structuredPredictions)
    .where(and(eq(structuredPredictions.raceId, raceId), eq(structuredPredictions.status, "succeeded")))
    .limit(1);
  if (!row || !isPayload(row.predictionJson)) return null;
  return { ...row, prediction: row.predictionJson };
}

async function acquireLock(db: Db, raceId: string, lockedBy: string) {
  const now = new Date();
  const until = new Date(now.getTime() + LOCK_TTL_MS);
  await db.execute(sql`
    INSERT INTO structured_prediction_locks (race_id, locked_by, locked_until, created_at, updated_at)
    VALUES (${raceId}, ${lockedBy}, ${until}, ${now}, ${now})
    ON DUPLICATE KEY UPDATE
      locked_by = IF(locked_until < ${now}, VALUES(locked_by), locked_by),
      locked_until = IF(locked_until < ${now}, VALUES(locked_until), locked_until),
      updated_at = IF(locked_until < ${now}, VALUES(updated_at), updated_at)
  `);
  const [lock] = await db.select().from(structuredPredictionLocks)
    .where(eq(structuredPredictionLocks.raceId, raceId)).limit(1);
  return !!lock && lock.lockedBy === lockedBy && lock.lockedUntil > now;
}

async function releaseLock(db: Db, raceId: string, lockedBy: string) {
  await db.execute(sql`DELETE FROM structured_prediction_locks WHERE race_id = ${raceId} AND locked_by = ${lockedBy}`);
}

async function buildSnapshot(db: Db, raceId: string) {
  const [race] = await db.select().from(races).where(eq(races.raceId, raceId)).limit(1);
  if (!race) throw new Error("対象レースが見つかりません");
  const runnerRows = await db.select().from(entries).where(eq(entries.raceId, raceId)).orderBy(entries.horseNumber);
  if (runnerRows.length < 2) throw new Error("構造化予想には2頭以上の確定出走馬が必要です");
  const latestOddsRows = await db.select().from(raceOdds)
    .where(eq(raceOdds.raceId, raceId)).orderBy(desc(raceOdds.fetchedAt));
  const latestOdds = new Map<number, number>();
  for (const odds of latestOddsRows) {
    if (!latestOdds.has(odds.horseNumber) && odds.winOdds !== null) latestOdds.set(odds.horseNumber, Number(odds.winOdds));
  }
  return {
    race: {
      raceId: race.raceId, raceName: race.raceName, date: race.raceDate, postTime: race.postTime,
      venue: race.venueName, surface: race.surface, distance: race.distance,
      weather: race.weather, trackCondition: race.trackCondition,
    },
    runners: runnerRows.map(entry => ({
      horseNumber: entry.horseNumber, horseName: entry.horseName, gateNumber: entry.gateNumber,
      sex: entry.sex, age: entry.age, carriedWeight: entry.weight, jockey: entry.jockey,
      trainer: entry.trainer, winOdds: latestOdds.get(entry.horseNumber) ?? entry.odds,
      popularity: entry.popularity, horseWeight: entry.horseWeight, horseWeightDiff: entry.horseWeightDiff,
      sire: entry.sire,
    })),
  };
}

export async function generateStructuredPrediction(db: Db, raceId: string) {
  const existing = await getSavedStructuredPrediction(db, raceId);
  if (existing) return { state: "existing" as const, prediction: existing };

  const lockedBy = `heartbeat-${crypto.randomUUID()}`;
  if (!await acquireLock(db, raceId, lockedBy)) return { state: "locked" as const, prediction: null };
  try {
    const snapshot = await buildSnapshot(db, raceId);
    const response = await invokeLLM({
      model: MODEL,
      maxTokens: 1800,
      messages: [
        { role: "system", content: "あなたは競馬データの分析アシスタントです。与えられたJSON以外の事実を使わず、的中や収益を保証しない構造化予想を返してください。" },
        { role: "user", content: `発走前の正規化済みデータです。候補は必ずrunnersに含まれる馬番・馬名と一致させてください。\n${JSON.stringify(snapshot)}` },
      ],
      responseFormat: { type: "json_schema", json_schema: { name: "race_prediction", strict: true, schema: predictionSchema } },
    });
    const content = response.choices[0]?.message.content;
    if (typeof content !== "string") throw new Error("構造化予想の応答本文を取得できませんでした");
    const parsed: unknown = JSON.parse(content);
    if (!isPayload(parsed)) throw new Error("構造化予想の応答形式が不正です");
    const prediction = validateStructuredPrediction(parsed, snapshot.runners);
    const now = new Date();
    await db.insert(structuredPredictions).values({
      raceId, status: "succeeded", model: MODEL, sourceSnapshot: snapshot, predictionJson: prediction, generatedAt: now,
    }).onDuplicateKeyUpdate({
      set: { status: "succeeded", model: MODEL, sourceSnapshot: snapshot, predictionJson: prediction, generatedAt: now, updatedAt: now },
    });
    return { state: "generated" as const, prediction: await getSavedStructuredPrediction(db, raceId) };
  } finally {
    await releaseLock(db, raceId, lockedBy);
  }
}

export function jstPostTimeToUtc(raceDate: string, postTime: string | null) {
  if (!postTime || !/^\d{4}-\d{2}-\d{2}$/.test(raceDate) || !/^\d{1,2}:\d{2}$/.test(postTime)) return null;
  const [hour, minute] = postTime.split(":").map(Number);
  return new Date(Date.UTC(Number(raceDate.slice(0, 4)), Number(raceDate.slice(5, 7)) - 1, Number(raceDate.slice(8, 10)), hour! - 9, minute!));
}

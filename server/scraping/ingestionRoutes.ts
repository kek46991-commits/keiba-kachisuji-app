/**
 * 本番データ取込の手動実行・状態確認エンドポイント。
 * 取得失敗の内容（HTTPステータス / DOM解析失敗 / 開催なし）をレスポンスでも確認できるようにする。
 */
import type { Request, Response } from "express";
import { ingestRaceCards, jstDate, type Organizer } from "./ingestRaceCards";
import { ingestRaceResults } from "./ingestRaceResults";
import { getLastIngestionRun, isIngestionRunning, runIngestion } from "./ingestionScheduler";

function parseOrganizers(value: unknown): Organizer[] {
  if (value === "JRA" || value === "NAR") return [value];
  return ["JRA", "NAR"];
}

function parseDates(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((item) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item))) {
    return value as string[];
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return [value];
  return undefined;
}

export async function ingestRaceCardsHandler(req: Request, res: Response) {
  try {
    const dates = parseDates(req.body?.dates ?? req.body?.date) ?? [jstDate(0), jstDate(1)];
    const withEntries = req.body?.withEntries !== false;
    const results = [];
    for (const organizer of parseOrganizers(req.body?.organizer)) {
      results.push(await ingestRaceCards({ organizer, dates, withEntries }));
    }
    const hasErrors = results.some((item) => item.errors.length > 0);
    return res.status(hasErrors ? 207 : 200).json({ success: !hasErrors, results });
  } catch (error) {
    console.error("[ingestRaceCards] 予期しないエラー:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
}

export async function ingestRaceResultsHandler(req: Request, res: Response) {
  try {
    const raceIds = Array.isArray(req.body?.raceIds) ? (req.body.raceIds as unknown[]).filter((id): id is string => typeof id === "string") : undefined;
    const days = typeof req.body?.days === "number" ? req.body.days : undefined;
    const result = await ingestRaceResults({ raceIds, days });
    return res.status(result.errors.length > 0 ? 207 : 200).json({ success: result.errors.length === 0, result });
  } catch (error) {
    console.error("[ingestRaceResults] 予期しないエラー:", error);
    return res.status(500).json({ success: false, error: String(error) });
  }
}

export async function runIngestionHandler(_req: Request, res: Response) {
  const log = await runIngestion({ trigger: "manual" });
  return res.json({ success: log.error === null, log });
}

export function ingestionStatusHandler(_req: Request, res: Response) {
  return res.json({ running: isIngestionRunning(), lastRun: getLastIngestionRun() });
}

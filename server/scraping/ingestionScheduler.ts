/**
 * アプリ内スケジューラ。外部cronが無い環境（Render等）でも本番データが更新されるように、
 * 起動直後と一定間隔でレースカード取得・結果取得を実行する。
 * DISABLE_DATA_INGESTION=1 で停止できる。
 */
import { ingestRaceCards, jstDate, type IngestRaceCardsResult } from "./ingestRaceCards";
import { ingestRaceResults, type IngestRaceResultsResult } from "./ingestRaceResults";

export type IngestionRunLog = {
  startedAt: string;
  finishedAt: string;
  trigger: "startup" | "interval" | "manual";
  cards: IngestRaceCardsResult[];
  results: IngestRaceResultsResult | null;
  error: string | null;
};

const CARD_INTERVAL_MS = 60 * 60 * 1000;
const RESULT_INTERVAL_MS = 15 * 60 * 1000;
/** 起動時は過去分も取り込み、成績集計（点数帯別回収率）が空にならないようにする。 */
const BACKFILL_DAYS = Number(process.env.INGESTION_BACKFILL_DAYS ?? "7");
/** 予想一覧が空にならないよう、今週末までのレースカードを先読みする。 */
const FORWARD_DAYS = Number(process.env.INGESTION_FORWARD_DAYS ?? "7");

function cardDates(fromOffset: number): string[] {
  const dates: string[] = [];
  for (let offset = fromOffset; offset <= FORWARD_DAYS; offset += 1) {
    dates.push(jstDate(offset));
  }
  return dates;
}

let running = false;
let lastRun: IngestionRunLog | null = null;

export function getLastIngestionRun(): IngestionRunLog | null {
  return lastRun;
}

export function isIngestionRunning(): boolean {
  return running;
}

export async function runIngestion(options: {
  trigger: IngestionRunLog["trigger"];
  cards?: boolean;
  results?: boolean;
}): Promise<IngestionRunLog> {
  const startedAt = new Date().toISOString();
  if (running) {
    return { startedAt, finishedAt: new Date().toISOString(), trigger: options.trigger, cards: [], results: null, error: "別の取込処理が実行中です" };
  }
  running = true;
  const log: IngestionRunLog = { startedAt, finishedAt: startedAt, trigger: options.trigger, cards: [], results: null, error: null };
  try {
    const dates = cardDates(options.trigger === "startup" ? -BACKFILL_DAYS : 0);
    if (options.cards ?? true) {
      log.cards.push(await ingestRaceCards({ organizer: "JRA", dates }));
      log.cards.push(await ingestRaceCards({ organizer: "NAR", dates }));
    }
    if (options.results ?? true) {
      log.results = options.trigger === "startup" && BACKFILL_DAYS > 0
        ? await ingestRaceResults({ days: BACKFILL_DAYS, limit: 400 })
        : await ingestRaceResults({});
    }
  } catch (error) {
    log.error = String(error);
    console.error("[ingestionScheduler] 取込中に例外が発生しました:", error);
  } finally {
    log.finishedAt = new Date().toISOString();
    running = false;
    lastRun = log;
  }
  return log;
}

export function startIngestionScheduler() {
  if (process.env.DISABLE_DATA_INGESTION === "1") {
    console.log("[ingestionScheduler] DISABLE_DATA_INGESTION=1 のため自動取込を行いません");
    return;
  }
  console.log("[ingestionScheduler] 自動取込を開始します（起動時 + カード60分毎 + 結果15分毎）");
  setTimeout(() => {
    void runIngestion({ trigger: "startup" });
  }, 5000);
  setInterval(() => {
    void runIngestion({ trigger: "interval", cards: true, results: false });
  }, CARD_INTERVAL_MS).unref?.();
  setInterval(() => {
    void runIngestion({ trigger: "interval", cards: false, results: true });
  }, RESULT_INTERVAL_MS).unref?.();
}

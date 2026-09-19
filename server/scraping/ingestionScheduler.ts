/**
 * アプリ内スケジューラ。外部cronが無い環境（Render等）でも本番データが更新されるように、
 * 起動直後と一定間隔でレースカード取得・結果取得を実行する。
 * DISABLE_DATA_INGESTION=1 で停止できる。
 */
import { ingestRaceCards, jstDate, type IngestRaceCardsResult } from "./ingestRaceCards";
import { ingestRaceResults, type IngestRaceResultsResult } from "./ingestRaceResults";
import { ingestRaceOdds, type IngestRaceOddsResult } from "./ingestRaceOdds";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "../db";
import { races } from "../../drizzle/schema";

export type IngestionRunLog = {
  startedAt: string;
  finishedAt: string;
  trigger: "startup" | "interval" | "manual";
  /** 段階取込の識別子（起動時のみ設定） */
  stage: StartupStage | null;
  cards: IngestRaceCardsResult[];
  odds: IngestRaceOddsResult | null;
  results: IngestRaceResultsResult | null;
  error: string | null;
};

/**
 * 起動時取込は「当日 → 直近結果 → 先読み → 過去」の順に分割して実行する。
 * 最初の段階が数分で終わるため、全体の取込完了を待たずに当日の予想・結果が表示できる。
 */
export type StartupStage = "today_cards" | "recent_results" | "forward_cards" | "backfill_cards" | "backfill_results";

export type StartupProgress = {
  startedAt: string;
  finishedAt: string | null;
  currentStage: StartupStage | null;
  completedStages: StartupStage[];
};

const CARD_INTERVAL_MS = 60 * 60 * 1000;
const RESULT_INTERVAL_MS = 15 * 60 * 1000;
/** 当日の出走表は締切直前まで変動するため、短い間隔で取り直す。 */
const TODAY_INTERVAL_MS = 20 * 60 * 1000;
/** 単勝オッズは発走直前まで動くため、出走表より短い間隔で取り直す。 */
const ODDS_INTERVAL_MS = 5 * 60 * 1000;
/** 起動時は過去分も取り込み、成績集計（点数帯別回収率）が空にならないようにする。 */
const BACKFILL_DAYS = Number(process.env.INGESTION_BACKFILL_DAYS ?? "7");
/** 予想一覧が空にならないよう、今週末までのレースカードを先読みする。 */
const FORWARD_DAYS = Number(process.env.INGESTION_FORWARD_DAYS ?? "7");
/** 永続DB利用時は過去分が残っているので、この件数以上確定済みなら起動時の過去取込を省く。 */
const BACKFILL_SKIP_THRESHOLD = Number(process.env.INGESTION_BACKFILL_SKIP_THRESHOLD ?? "50");

function cardDates(fromOffset: number): string[] {
  const dates: string[] = [];
  for (let offset = fromOffset; offset <= FORWARD_DAYS; offset += 1) {
    dates.push(jstDate(offset));
  }
  return dates;
}

let running = false;
let lastRun: IngestionRunLog | null = null;
let startupProgress: StartupProgress | null = null;

export function getStartupProgress(): StartupProgress | null {
  return startupProgress;
}

export function getLastIngestionRun(): IngestionRunLog | null {
  return lastRun;
}

export function isIngestionRunning(): boolean {
  return running;
}

export async function runIngestion(options: {
  trigger: IngestionRunLog["trigger"];
  cards?: boolean;
  odds?: boolean;
  results?: boolean;
  /** 当日分のみを取り込む（オッズ更新用） */
  todayOnly?: boolean;
  /** 取り込むレースカードの日付。未指定なら当日〜先読み分。 */
  dates?: string[];
  /** 結果取込の対象日数・件数上限 */
  resultDays?: number;
  resultLimit?: number;
  stage?: StartupStage;
}): Promise<IngestionRunLog> {
  const startedAt = new Date().toISOString();
  if (running) {
    return { startedAt, finishedAt: new Date().toISOString(), trigger: options.trigger, stage: options.stage ?? null, cards: [], odds: null, results: null, error: "別の取込処理が実行中です" };
  }
  running = true;
  const log: IngestionRunLog = { startedAt, finishedAt: startedAt, trigger: options.trigger, stage: options.stage ?? null, cards: [], odds: null, results: null, error: null };
  try {
    const dates = options.dates ?? (options.todayOnly ? [jstDate(0)] : cardDates(0));
    if (options.cards ?? true) {
      log.cards.push(await ingestRaceCards({ organizer: "JRA", dates }));
      log.cards.push(await ingestRaceCards({ organizer: "NAR", dates }));
    }
    if (options.odds ?? false) {
      log.odds = await ingestRaceOdds({ dates: [jstDate(0)] });
    }
    if (options.results ?? true) {
      log.results = await ingestRaceResults({ days: options.resultDays, limit: options.resultLimit });
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

/** 既に過去分の確定レースが十分に保存されているか（永続DBでの再起動判定）。 */
async function hasPopulatedHistory(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const [row] = await db
      .select({ value: count() })
      .from(races)
      .where(and(gte(races.raceDate, jstDate(-BACKFILL_DAYS)), eq(races.status, "results_confirmed")));
    return Number(row?.value ?? 0) >= BACKFILL_SKIP_THRESHOLD;
  } catch (error) {
    console.error("[ingestionScheduler] 過去データの件数確認に失敗しました:", error);
    return false;
  }
}

/** 起動時取込。当日分から順に段階実行し、各段階が終わるたびに画面へ反映される。 */
export async function runStartupIngestion(): Promise<void> {
  const today = jstDate(0);
  const stages: Array<{ stage: StartupStage; run: () => Promise<IngestionRunLog> }> = [
    { stage: "today_cards", run: () => runIngestion({ trigger: "startup", stage: "today_cards", cards: true, odds: true, results: false, dates: [today] }) },
    { stage: "recent_results", run: () => runIngestion({ trigger: "startup", stage: "recent_results", cards: false, results: true, resultDays: 3, resultLimit: 120 }) },
    { stage: "forward_cards", run: () => runIngestion({ trigger: "startup", stage: "forward_cards", cards: true, results: false, dates: cardDates(1) }) },
  ];
  if (BACKFILL_DAYS > 0 && !(await hasPopulatedHistory())) {
    const pastDates: string[] = [];
    for (let offset = -BACKFILL_DAYS; offset <= -1; offset += 1) pastDates.push(jstDate(offset));
    stages.push({ stage: "backfill_cards", run: () => runIngestion({ trigger: "startup", stage: "backfill_cards", cards: true, results: false, dates: pastDates }) });
    stages.push({ stage: "backfill_results", run: () => runIngestion({ trigger: "startup", stage: "backfill_results", cards: false, results: true, resultDays: BACKFILL_DAYS, resultLimit: 400 }) });
  }

  startupProgress = { startedAt: new Date().toISOString(), finishedAt: null, currentStage: null, completedStages: [] };
  for (const { stage, run } of stages) {
    startupProgress = { ...startupProgress, currentStage: stage };
    console.log(`[ingestionScheduler] 起動時取込 ${stage} を開始します`);
    await run();
    startupProgress = { ...startupProgress, currentStage: null, completedStages: [...startupProgress.completedStages, stage] };
  }
  startupProgress = { ...startupProgress, finishedAt: new Date().toISOString() };
  console.log("[ingestionScheduler] 起動時取込がすべて完了しました");
}

export function startIngestionScheduler() {
  if (process.env.DISABLE_DATA_INGESTION === "1") {
    console.log("[ingestionScheduler] DISABLE_DATA_INGESTION=1 のため自動取込を行いません");
    return;
  }
  console.log("[ingestionScheduler] 自動取込を開始します（起動時は当日分から段階実行 + カード60分毎 + 当日出走表20分毎 + 当日オッズ5分毎 + 結果15分毎）");
  setTimeout(() => {
    void runStartupIngestion();
  }, 5000);
  setInterval(() => {
    void runIngestion({ trigger: "interval", cards: true, results: false });
  }, CARD_INTERVAL_MS).unref?.();
  setInterval(() => {
    void runIngestion({ trigger: "interval", cards: false, results: true });
  }, RESULT_INTERVAL_MS).unref?.();
  setInterval(() => {
    void runIngestion({ trigger: "interval", cards: true, odds: true, results: false, todayOnly: true });
  }, TODAY_INTERVAL_MS).unref?.();
  setInterval(() => {
    void runIngestion({ trigger: "interval", cards: false, odds: true, results: false });
  }, ODDS_INTERVAL_MS).unref?.();
}

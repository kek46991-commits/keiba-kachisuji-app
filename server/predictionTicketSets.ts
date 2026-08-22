import { predictionTicketSets } from "../drizzle/schema";
import { getDb } from "./db";

export type TicketStrategy = "score" | "longshot";

export const ticketStrategyLabels: Record<TicketStrategy, string> = {
  score: "スコア順買い目",
  longshot: "穴馬買い目",
};

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type TicketSetInput = {
  strategy: TicketStrategy;
  ticketData: unknown;
  investAmount: number;
};

export type TicketSelection = {
  betType: "trifecta" | "trio" | "quinella" | "exacta" | "wide";
  label: string;
  selection: string;
};

const betTypeLabels: Record<TicketSelection["betType"], string> = {
  trifecta: "3連単",
  trio: "3連複",
  quinella: "馬連",
  exacta: "馬単",
  wide: "ワイド",
};

/** 保存済み買い目を、画面表示・精算共通の券種別リストへ正規化する。 */
export function readTicketSelections(raw: string | null): TicketSelection[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.referenceOnly === true) return [];
    return (Object.keys(betTypeLabels) as TicketSelection["betType"][]).flatMap(betType => {
      const selection = parsed[betType];
      return typeof selection === "string" && selection.trim()
        ? [{ betType, label: betTypeLabels[betType], selection: selection.trim() }]
        : [];
    });
  } catch {
    return [];
  }
}

/**
 * 1つの予想に紐付く戦略別買い目を保存する。
 * 保存時点の買い目を不変の履歴として残し、レース後の再計算で過去予想を改変しない。
 */
export async function savePredictionTicketSets(
  db: Db,
  input: { predictionId: number; raceId: string; sets: TicketSetInput[] },
) {
  for (const set of input.sets) {
    await db
      .insert(predictionTicketSets)
      .values({
        predictionId: input.predictionId,
        raceId: input.raceId,
        strategy: set.strategy,
        ticketData: JSON.stringify(set.ticketData),
        investAmount: set.investAmount,
      })
      .onDuplicateKeyUpdate({
        set: {
          ticketData: JSON.stringify(set.ticketData),
          investAmount: set.investAmount,
          returnAmount: null,
          isHit: null,
          updatedAt: new Date(),
        },
      });
  }
}

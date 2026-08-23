import { and, eq, isNull } from "drizzle-orm";
import { entries, payouts, predictions, predictionTicketSets, races } from "../drizzle/schema";
import { getDb } from "./db";
import { hasAuditableRecordedBets } from "./ticketPerformance";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type SettlementBetType = "trifecta" | "trio" | "quinella" | "exacta" | "wide";
type SettlementPayout = { betType: SettlementBetType; combination: string; payout: number };

export type RaceSettlementResult = {
  raceId: string;
  state: "settled" | "pending_entries" | "pending_payouts" | "pending_ticket_data";
  settledPredictions: number;
  pendingPredictions: number;
  hitPredictions: number;
  investmentAmount: number;
  returnAmount: number;
};

export function summarizeRaceReconciliation(results: RaceSettlementResult[]) {
  return results.reduce((summary, result) => ({
    confirmedRaces: summary.confirmedRaces + (result.state === "settled" ? 1 : 0),
    settledPredictions: summary.settledPredictions + result.settledPredictions,
    pendingPredictions: summary.pendingPredictions + result.pendingPredictions,
    pendingEntryRaces: summary.pendingEntryRaces + (result.state === "pending_entries" ? 1 : 0),
    pendingPayoutRaces: summary.pendingPayoutRaces + (result.state === "pending_payouts" ? 1 : 0),
    hitPredictions: summary.hitPredictions + (result.hitPredictions ?? 0),
    investmentAmount: summary.investmentAmount + (result.investmentAmount ?? 0),
    returnAmount: summary.returnAmount + (result.returnAmount ?? 0),
    profitAmount: summary.profitAmount + (result.returnAmount ?? 0) - (result.investmentAmount ?? 0),
  }), {
    confirmedRaces: 0,
    settledPredictions: 0,
    pendingPredictions: 0,
    pendingEntryRaces: 0,
    pendingPayoutRaces: 0,
    hitPredictions: 0,
    investmentAmount: 0,
    returnAmount: 0,
    profitAmount: 0,
  });
}

export type BetTypeSettlement = {
  betType: SettlementBetType;
  ticketCount: number;
  returnAmount: number;
  isHit: boolean;
};

const unorderedBetTypes = new Set<SettlementBetType>(["trio", "quinella", "wide"]);

function canonicalCombination(betType: SettlementBetType, numbers: number[]) {
  const normalized = unorderedBetTypes.has(betType) ? [...numbers].sort((left, right) => left - right) : numbers;
  return normalized.join("-");
}

function parseNumbers(raw: string) {
  return raw.split(",").map(value => Number(value.trim())).filter(value => Number.isInteger(value) && value > 0);
}

function extractNumbers(raw: string) {
  return (raw.match(/\d+/g) ?? []).map(Number).filter(value => Number.isInteger(value) && value > 0);
}

function combinations(values: number[], count: number): number[][] {
  if (count === 0) return [[]];
  if (values.length < count) return [];
  const [first, ...rest] = values;
  return [
    ...combinations(rest, count - 1).map(group => [first!, ...group]),
    ...combinations(rest, count),
  ];
}

function parseTicketCombinations(raw: string | null): Map<SettlementBetType, Set<string>> | null {
  if (!hasAuditableRecordedBets(raw) || !raw) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const output = new Map<SettlementBetType, Set<string>>();
  const add = (type: SettlementBetType, numberGroups: number[][]) => {
    if (numberGroups.length === 0) return;
    const set = output.get(type) ?? new Set<string>();
    numberGroups.forEach(group => set.add(canonicalCombination(type, group)));
    output.set(type, set);
  };
  const read = (key: SettlementBetType) => typeof parsed[key] === "string" ? String(parsed[key]) : "";

  const trifecta = read("trifecta");
  const trifectaFormation = trifecta.match(/1着([\d,]+)\s*\/\s*2着([\d,]+)\s*\/\s*3着([\d,]+)/);
  if (trifectaFormation) {
    const [first, second, third] = trifectaFormation.slice(1).map(parseNumbers);
    add("trifecta", first.flatMap(a => second.flatMap(b => third.filter(c => a !== b && b !== c && a !== c).map(c => [a, b, c]))));
  } else {
    const direct = trifecta.match(/(\d+)\s*(?:→|-|\s)\s*(\d+)\s*(?:→|-)\s*(\d+)/);
    if (direct) add("trifecta", [direct.slice(1).map(Number)]);
  }

  const trio = read("trio");
  const trioFlow = trio.match(/(\d+)\s*-\s*([\d,]+).*1頭軸流し/);
  if (trioFlow) add("trio", combinations(parseNumbers(trioFlow[2]!).map(Number), 2).map(group => [Number(trioFlow[1]), ...group]));
  else if (trio.includes("BOX")) {
    const direct = trio.match(/[\d,-]+/);
    if (direct) add("trio", combinations(parseNumbers(direct[0]), 3));
  }

  const quinella = read("quinella");
  const quinellaPairs = Array.from(quinella.matchAll(/(\d+)\s*-\s*(\d+)/g)).map(match => [Number(match[1]), Number(match[2])]);
  add("quinella", quinellaPairs);

  const exacta = read("exacta");
  const exactaPairs = Array.from(exacta.matchAll(/(\d+)\s*(?:→|-)\s*(\d+)/g)).map(match => [Number(match[1]), Number(match[2])]);
  add("exacta", exactaPairs);

  const wide = read("wide");
  if (wide.includes("BOX")) {
    const direct = wide.match(/[\d,-]+/);
    if (direct) add("wide", combinations(parseNumbers(direct[0]), 2));
  } else add("wide", Array.from(wide.matchAll(/(\d+)\s*-\s*(\d+)/g)).map(match => [Number(match[1]), Number(match[2])]));

  return output.size > 0 ? output : null;
}

export function calculatePredictionSettlementByType(rawBets: string | null, officialPayouts: SettlementPayout[]) {
  const tickets = parseTicketCombinations(rawBets);
  if (!tickets) return { state: "pending_ticket_data" as const, byType: [] as BetTypeSettlement[] };
  const requiredTypes = Array.from(tickets.keys());
  if (requiredTypes.some(type => !officialPayouts.some(payout => payout.betType === type))) {
    return { state: "pending_payouts" as const, byType: [] as BetTypeSettlement[] };
  }

  const byType = Array.from(tickets.entries()).map(([betType, combinations]) => {
    const returnAmount = officialPayouts
      .filter(payout => payout.betType === betType)
      .reduce((sum, payout) => {
        const canonical = canonicalCombination(betType, extractNumbers(payout.combination));
        return combinations.has(canonical) ? sum + payout.payout : sum;
      }, 0);
    return { betType, ticketCount: combinations.size, returnAmount, isHit: returnAmount > 0 };
  });
  return { state: "settled" as const, byType };
}

export function calculatePredictionSettlement(rawBets: string | null, officialPayouts: SettlementPayout[]) {
  const result = calculatePredictionSettlementByType(rawBets, officialPayouts);
  if (result.state !== "settled") {
    return { state: result.state, isHit: null, returnAmount: null };
  }
  const returnAmount = result.byType.reduce((sum, settlement) => sum + settlement.returnAmount, 0);
  return { state: "settled" as const, isHit: returnAmount > 0, returnAmount };
}

/**
 * 着順確定済みレースのうち、まだ精算されていない予想を公式払戻で精算して永続化する。
 * 成績集計（回収率・日別収支）は predictions.isHit / returnAmount を参照するため、
 * 集計前にこの処理を通して中央・地方の両データを同じ経路で確定させる。
 */
export async function settlePendingConfirmedRaces(db: Db, limit = 50): Promise<string[]> {
  const pending = await db
    .selectDistinct({ raceId: predictions.raceId })
    .from(predictions)
    .innerJoin(races, eq(races.raceId, predictions.raceId))
    .where(and(eq(races.status, "results_confirmed"), isNull(predictions.isHit)))
    .limit(limit);

  const settledRaceIds: string[] = [];
  for (const row of pending) {
    const result = await reconcileRaceResult(db, row.raceId);
    if (result.state === "settled" && result.settledPredictions > 0) settledRaceIds.push(row.raceId);
  }
  return settledRaceIds;
}

/** 公式の着順上位3頭と払戻が揃った場合のみ、レースと未精算予想を確定する。 */
export async function reconcileRaceResult(db: Db, raceId: string): Promise<RaceSettlementResult> {
  const [resultEntries, officialPayouts, pendingPredictions, pendingTicketSets] = await Promise.all([
    db.select({ finishPosition: entries.finishPosition }).from(entries).where(eq(entries.raceId, raceId)),
    db.select({ betType: payouts.betType, combination: payouts.combination, payout: payouts.payout }).from(payouts).where(eq(payouts.raceId, raceId)),
    db.select({ id: predictions.id, recommendedBets: predictions.recommendedBets, investAmount: predictions.investAmount }).from(predictions).where(and(eq(predictions.raceId, raceId), isNull(predictions.isHit))),
    db.select({ id: predictionTicketSets.id, ticketData: predictionTicketSets.ticketData }).from(predictionTicketSets).where(and(eq(predictionTicketSets.raceId, raceId), isNull(predictionTicketSets.isHit))),
  ]);
  const hasTopThree = [1, 2, 3].every(position => resultEntries.some(entry => entry.finishPosition === position));
  if (!hasTopThree) return { raceId, state: "pending_entries", settledPredictions: 0, pendingPredictions: pendingPredictions.length, hitPredictions: 0, investmentAmount: 0, returnAmount: 0 };
  if (officialPayouts.length === 0) return { raceId, state: "pending_payouts", settledPredictions: 0, pendingPredictions: pendingPredictions.length, hitPredictions: 0, investmentAmount: 0, returnAmount: 0 };

  await db.update(races).set({ status: "results_confirmed" }).where(eq(races.raceId, raceId));
  let settledPredictions = 0;
  let unresolved = 0;
  let hitPredictions = 0;
  let investmentAmount = 0;
  let returnAmount = 0;
  for (const prediction of pendingPredictions) {
    const result = calculatePredictionSettlement(prediction.recommendedBets, officialPayouts as SettlementPayout[]);
    if (result.state !== "settled") {
      unresolved++;
      continue;
    }
    await db.update(predictions).set({ isHit: result.isHit, returnAmount: result.returnAmount }).where(eq(predictions.id, prediction.id));
    settledPredictions++;
    hitPredictions += result.isHit ? 1 : 0;
    investmentAmount += prediction.investAmount ?? 0;
    returnAmount += result.returnAmount ?? 0;
  }
  for (const ticketSet of pendingTicketSets) {
    const result = calculatePredictionSettlement(ticketSet.ticketData, officialPayouts as SettlementPayout[]);
    if (result.state !== "settled") continue;
    await db.update(predictionTicketSets).set({ isHit: result.isHit, returnAmount: result.returnAmount }).where(eq(predictionTicketSets.id, ticketSet.id));
  }
  return { raceId, state: "settled", settledPredictions, pendingPredictions: unresolved, hitPredictions, investmentAmount, returnAmount };
}

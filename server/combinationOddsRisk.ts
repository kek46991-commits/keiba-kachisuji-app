import { desc, eq } from "drizzle-orm";
import { combinationOdds } from "../drizzle/schema";
import type { CoverageFormation } from "./valueBetting";

export type CombinationOddsQuote = {
  betType: "trio" | "trifecta";
  combination: string;
  odds: number;
};

export type TrigamiStatus = "safe" | "risk" | "partial" | "unavailable";

export type TrigamiEvaluation = {
  status: TrigamiStatus;
  totalTickets: number;
  coveredTickets: number;
  totalInvest: number;
  breakEvenOdds: number | null;
  minimumOdds: number | null;
  minimumPayout: number | null;
  missingTickets: number;
  message: string;
};

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function expandFormationTickets(formation: Pick<CoverageFormation, "axis" | "second" | "third" | "trioPartners">): Array<{ betType: "trio" | "trifecta"; combination: string }> {
  const trifecta: string[] = [];
  for (const second of formation.second) {
    for (const third of formation.third) {
      if (formation.axis !== second && formation.axis !== third && second !== third) {
        trifecta.push(`${formation.axis}-${second}-${third}`);
      }
    }
  }
  const trio: string[] = [];
  for (let first = 0; first < formation.trioPartners.length; first += 1) {
    for (let second = first + 1; second < formation.trioPartners.length; second += 1) {
      trio.push([formation.axis, formation.trioPartners[first]!, formation.trioPartners[second]!].sort((left, right) => left - right).join("-"));
    }
  }
  return [
    ...unique(trifecta).map(combination => ({ betType: "trifecta" as const, combination })),
    ...unique(trio).map(combination => ({ betType: "trio" as const, combination })),
  ];
}

/**
 * 公式組合せオッズが買い目の全組合せにそろった場合のみ、最低払戻でトリガミを判定する。
 * 一部でも欠ける場合は誤って安全と扱わず「partial」、未取込なら「unavailable」を返す。
 */
export function evaluateTrigamiRisk(
  formation: Pick<CoverageFormation, "axis" | "second" | "third" | "trioPartners">,
  quotes: CombinationOddsQuote[],
  stakePerTicket = 100,
): TrigamiEvaluation {
  const tickets = expandFormationTickets(formation);
  const totalTickets = tickets.length;
  const totalInvest = totalTickets * stakePerTicket;
  if (totalTickets === 0) {
    return { status: "unavailable", totalTickets, coveredTickets: 0, totalInvest, breakEvenOdds: null, minimumOdds: null, minimumPayout: null, missingTickets: 0, message: "買い目がないためトリガミ判定の対象外です。" };
  }
  const quoteByTicket = new Map(quotes.map(quote => [`${quote.betType}:${quote.combination}`, quote.odds]));
  const coveredOdds = tickets
    .map(ticket => quoteByTicket.get(`${ticket.betType}:${ticket.combination}`))
    .filter((odds): odds is number => typeof odds === "number" && Number.isFinite(odds) && odds > 0);
  const coveredTickets = coveredOdds.length;
  const missingTickets = totalTickets - coveredTickets;
  const breakEvenOdds = totalInvest / stakePerTicket;
  if (coveredTickets === 0) {
    return { status: "unavailable", totalTickets, coveredTickets, totalInvest, breakEvenOdds, minimumOdds: null, minimumPayout: null, missingTickets, message: "公式の組合せオッズが未取得のため、トリガミ判定は保留です。" };
  }
  const minimumOdds = Math.min(...coveredOdds);
  const minimumPayout = Math.round(minimumOdds * stakePerTicket);
  if (missingTickets > 0) {
    return { status: "partial", totalTickets, coveredTickets, totalInvest, breakEvenOdds, minimumOdds, minimumPayout, missingTickets, message: `公式組合せオッズは${coveredTickets}/${totalTickets}点のみ取得済みです。未取得${missingTickets}点があるため、トリガミ判定は保留です。` };
  }
  if (minimumPayout < totalInvest) {
    return { status: "risk", totalTickets, coveredTickets, totalInvest, breakEvenOdds, minimumOdds, minimumPayout, missingTickets, message: `最低想定払戻${minimumPayout.toLocaleString()}円が総投資${totalInvest.toLocaleString()}円を下回るため、トリガミの可能性があります。` };
  }
  return { status: "safe", totalTickets, coveredTickets, totalInvest, breakEvenOdds, minimumOdds, minimumPayout, missingTickets, message: `公式組合せオッズの全${totalTickets}点を確認済みです。最低想定払戻${minimumPayout.toLocaleString()}円は総投資${totalInvest.toLocaleString()}円以上です。` };
}

export async function getLatestCombinationOddsQuotes(db: any, raceId: string): Promise<CombinationOddsQuote[]> {
  const rows = await db.select({
    betType: combinationOdds.betType,
    combination: combinationOdds.combination,
    odds: combinationOdds.odds,
  })
    .from(combinationOdds)
    .where(eq(combinationOdds.raceId, raceId))
    .orderBy(desc(combinationOdds.fetchedAt), desc(combinationOdds.id));
  const latest = new Map<string, CombinationOddsQuote>();
  for (const row of rows) {
    const key = `${row.betType}:${row.combination}`;
    if (!latest.has(key)) latest.set(key, { betType: row.betType, combination: row.combination, odds: Number(row.odds) });
  }
  return Array.from(latest.values());
}

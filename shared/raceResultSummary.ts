import { resolveHorseName, type HorseNameMap } from "./horseNameMapping";
import { buildSettlementFigures, resolveHitStatus, type HitStatus, type SettlementFigures } from "./settlementDisplay";

export type ResultEntryInput = {
  horseNumber: number;
  horseName: string;
  finishPosition: number | null;
};

export type FinishedHorse = {
  position: number;
  horseNumber: number;
  /** 出走表マスターで解決した表示用の馬名（マスター未登録なら保存値のまま） */
  horseName: string;
};

/** 公式着順が確定している上位3頭を、実際の馬名付きで返す。 */
export function buildTopThree(
  entries: readonly ResultEntryInput[],
  nameMap: HorseNameMap = new Map(),
): FinishedHorse[] {
  return entries
    .filter(entry => entry.finishPosition !== null && entry.finishPosition >= 1 && entry.finishPosition <= 3)
    .sort((left, right) => (left.finishPosition ?? 99) - (right.finishPosition ?? 99))
    .map(entry => ({
      position: entry.finishPosition!,
      horseNumber: entry.horseNumber,
      horseName: resolveHorseName(entry, nameMap),
    }));
}

export type RaceResultSummary = SettlementFigures & {
  raceId: string;
  resultsConfirmed: boolean;
  topThree: FinishedHorse[];
  isHit: boolean | null;
  hitStatus: HitStatus;
};

export function buildRaceResultSummary({
  raceId,
  resultsConfirmed,
  entries,
  nameMap,
  isHit,
  investAmount,
  returnAmount,
}: {
  raceId: string;
  resultsConfirmed: boolean;
  entries: readonly ResultEntryInput[];
  nameMap?: HorseNameMap;
  isHit: boolean | null;
  investAmount: number | null;
  returnAmount: number | null;
}): RaceResultSummary {
  return {
    raceId,
    resultsConfirmed,
    topThree: buildTopThree(entries, nameMap),
    isHit: isHit ?? null,
    hitStatus: resolveHitStatus(isHit),
    ...buildSettlementFigures(investAmount, returnAmount),
  };
}

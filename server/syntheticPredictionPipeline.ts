import { buildLongshotAxisFormation } from "./valueBetting";
import { generateBettingRecommendation } from "./predictionRouter";

export const SYNTHETIC_RACE_A_RUN_ID = "synthetic-race-a-v1";

const sourceEntries = [
  { horseNumber: 1, horseName: "馬A", popularity: 5, odds: 10.6, timeDm: 40.7 },
  { horseNumber: 2, horseName: "馬B", popularity: 4, odds: 6.6, timeDm: 67.2 },
  { horseNumber: 3, horseName: "馬C", popularity: 2, odds: 3.0, timeDm: 63.3 },
  { horseNumber: 4, horseName: "馬D", popularity: 1, odds: 2.6, timeDm: 64.9 },
  { horseNumber: 5, horseName: "馬E", popularity: 3, odds: 4.2, timeDm: 72.1 },
  { horseNumber: 6, horseName: "馬F", popularity: 6, odds: 14.6, timeDm: 44.7 },
];

export type SyntheticRaceEntry = (typeof sourceEntries)[number] & { score: number };

export function buildSyntheticRaceA() {
  const minimum = Math.min(...sourceEntries.map((entry) => entry.timeDm));
  const maximum = Math.max(...sourceEntries.map((entry) => entry.timeDm));
  const entries: SyntheticRaceEntry[] = sourceEntries.map((entry) => {
    const timeScore = ((entry.timeDm - minimum) / (maximum - minimum)) * 80;
    const popularityScore = ((7 - entry.popularity) / 6) * 20;
    return { ...entry, score: Math.round((timeScore + popularityScore) * 10) / 10 };
  });

  const scoreRanked = [...entries].sort((left, right) => right.score - left.score);
  const predictionRows = scoreRanked.map((entry) => ({
    horseNumber: entry.horseNumber,
    horseName: entry.horseName,
    jockey: "テスト騎手",
    odds: entry.odds,
    score: entry.score,
    winProbability: 0,
    expectedValue: null,
    breakdown: {},
    rating: "",
  }));
  const scoreTickets = generateBettingRecommendation(predictionRows as any, { oddsMode: "predicted" });
  const longshotAxis = scoreRanked.find((entry) => entry.odds >= 6) ?? null;
  const longshotFormation = longshotAxis
    ? buildLongshotAxisFormation({
      axis: longshotAxis.horseNumber,
      scoreRankedHorseNumbers: scoreRanked.map((entry) => entry.horseNumber),
      holePartnerHorseNumbers: scoreRanked.filter((entry) => entry.odds >= 6 && entry.horseNumber !== longshotAxis.horseNumber).map((entry) => entry.horseNumber),
    })
    : null;
  const longshotTickets = longshotFormation ? {
    axisHorseNumber: longshotAxis!.horseNumber,
    trifecta: `穴軸: 1着${longshotFormation.axis} / 2着${longshotFormation.second.join(",")} / 3着${longshotFormation.third.join(",")}（${longshotFormation.trifectaCount}点）`,
    trio: `穴軸カバー: ${longshotFormation.axis} - ${longshotFormation.trioPartners.join(",")}（${longshotFormation.trioCount}点）`,
    quinella: `${longshotFormation.axis}-${longshotFormation.second.slice(0, 3).join(",")}`,
    wide: `${longshotFormation.axis}-${longshotFormation.second.slice(0, 3).join(",")}（ワイド${Math.min(3, longshotFormation.second.length)}点）`,
    trifectaCount: longshotFormation.trifectaCount,
    trioCount: longshotFormation.trioCount,
    quinellaCount: Math.min(3, longshotFormation.second.length),
    wideCount: Math.min(3, longshotFormation.second.length),
  } : null;

  return { entries, scoreTickets, longshotTickets };
}

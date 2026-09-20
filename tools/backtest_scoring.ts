/**
 * 取込済みの確定レースで、能力スコアの並びが実際の着順をどれだけ当てているかを測る検証スクリプト。
 * 市場（単勝オッズ順）をベースラインに置き、スコアの改善案を比較する。
 *
 * 実行: DATABASE_URL=... npx tsx tools/backtest_scoring.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq, inArray } from "drizzle-orm";
import { entries, jockeyMaster, races } from "../drizzle/schema";
import { calculateScore, type EntryData } from "../server/predictionRouter";
import { blendAbilityWithMarket } from "../server/probabilityModel";

type Runner = EntryData & { finishPosition: number | null };

function rankByScore(runners: Runner[], score: (runner: Runner) => number) {
  return [...runners].sort((left, right) => score(right) - score(left));
}

function evaluate(label: string, ranked: Runner[][]) {
  let win = 0;
  let placed = 0;
  let trioHit = 0;
  for (const order of ranked) {
    const top = order[0];
    if (top?.finishPosition === 1) win += 1;
    if (top?.finishPosition && top.finishPosition <= 3) placed += 1;
    const top4 = order.slice(0, 4).map(runner => runner.finishPosition ?? 99);
    const inTop3 = top4.filter(position => position <= 3).length;
    if (inTop3 === 3) trioHit += 1;
  }
  const races = ranked.length || 1;
  const pct = (value: number) => `${((value / races) * 100).toFixed(1)}%`;
  console.log(`${label.padEnd(28)} 単勝的中 ${pct(win)}  ◎複勝圏 ${pct(placed)}  上位4頭BOX3連複 ${pct(trioHit)}`);
}

async function main() {
  const db = drizzle(process.env.DATABASE_URL!);
  const jockeyRows = await db.select().from(jockeyMaster);
  const jockeyStats = new Map(jockeyRows.map(row => [row.name, {
    winRate: row.winRate ?? 0,
    placeRate: row.placeRate ?? 0,
    turfWinRate: row.turfWinRate ?? 0,
    dirtWinRate: row.dirtWinRate ?? 0,
    heavyWinRate: row.heavyWinRate ?? 0,
  }]));

  const raceRows = await db.select().from(races);
  const finishedRaces: Array<{ race: typeof raceRows[number]; runners: Runner[] }> = [];
  for (const race of raceRows) {
    const rows = await db.select().from(entries).where(eq(entries.raceId, race.raceId));
    const runners: Runner[] = rows.map(row => ({
      horseNumber: row.horseNumber,
      horseName: row.horseName,
      jockey: row.jockey,
      odds: row.odds,
      popularity: row.popularity,
      weight: row.weight,
      gateNumber: row.gateNumber,
      age: row.age,
      sex: row.sex,
      sire: row.sire,
      dam: row.dam,
      horseWeight: row.horseWeight,
      horseWeightDiff: row.horseWeightDiff,
      last3f: row.last3f,
      finishPosition: row.finishPosition,
    }));
    const usable = runners.filter(runner => runner.finishPosition !== null);
    const withOdds = runners.filter(runner => (runner.odds ?? 0) > 0);
    if (usable.length >= 5 && withOdds.length >= 5) finishedRaces.push({ race, runners });
  }

  console.log(`対象レース: ${finishedRaces.length}件`);

  const abilityRanked: Runner[][] = [];
  const marketRanked: Runner[][] = [];
  const blendRanked: Runner[][] = [];

  for (const { race, runners } of finishedRaces) {
    const raceInfo = {
      surface: race.surface,
      distance: race.distance,
      venueName: race.venueName,
      trackCondition: race.trackCondition,
      headCount: race.headCount ?? runners.length,
    };
    const abilityByHorse = new Map<number, number>();
    for (const runner of runners) {
      abilityByHorse.set(runner.horseNumber, calculateScore(runner, raceInfo, jockeyStats).abilityScore);
    }

    // 市場の単勝オッズを確率化（控除率を無視した正規化）
    const implied = new Map<number, number>();
    let impliedTotal = 0;
    for (const runner of runners) {
      const value = (runner.odds ?? 0) > 0 ? 1 / runner.odds! : 0;
      implied.set(runner.horseNumber, value);
      impliedTotal += value;
    }
    for (const [horseNumber, value] of implied) implied.set(horseNumber, impliedTotal > 0 ? value / impliedTotal : 0);

    // 能力スコアをレース内softmaxで確率化（現行の推定勝率と同じ温度）
    const maxAbility = Math.max(...abilityByHorse.values());
    const weights = new Map<number, number>();
    let weightTotal = 0;
    for (const [horseNumber, score] of abilityByHorse) {
      const weight = Math.exp((score - maxAbility) / 12);
      weights.set(horseNumber, weight);
      weightTotal += weight;
    }

    abilityRanked.push(rankByScore(runners, runner => abilityByHorse.get(runner.horseNumber) ?? 0));
    marketRanked.push(rankByScore(runners, runner => implied.get(runner.horseNumber) ?? 0));
    blendRanked.push(rankByScore(runners, runner => {
      const market = implied.get(runner.horseNumber) ?? 0;
      const ability = (weights.get(runner.horseNumber) ?? 0) / (weightTotal || 1);
      // 市場を主、能力スコアを従とした対数ブレンド
      return 0.75 * Math.log(Math.max(market, 1e-6)) + 0.25 * Math.log(Math.max(ability, 1e-6));
    }));
  }

  evaluate("現行: 能力スコアのみ", abilityRanked);
  evaluate("市場のみ（人気順）", marketRanked);
  evaluate("ブレンド 市場0.75/能力0.25", blendRanked);

  const shippedRanked: Runner[][] = [];
  for (const { race, runners } of finishedRaces) {
    const raceInfo = {
      surface: race.surface,
      distance: race.distance,
      venueName: race.venueName,
      trackCondition: race.trackCondition,
      headCount: race.headCount ?? runners.length,
    };
    const blended = blendAbilityWithMarket(runners.map(runner => ({
      horseNumber: runner.horseNumber,
      abilityScore: calculateScore(runner, raceInfo, jockeyStats).abilityScore,
      odds: (runner.odds ?? 0) > 0 ? runner.odds : null,
    })));
    const scoreByHorse = new Map(blended.map(item => [item.horseNumber, item.score]));
    shippedRanked.push(rankByScore(runners, runner => scoreByHorse.get(runner.horseNumber) ?? 0));
  }
  evaluate("新実装: 能力×市場の混合", shippedRanked);

  for (const abilityWeight of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4]) {
    const ranked: Runner[][] = [];
    for (const { race, runners } of finishedRaces) {
      const raceInfo = {
        surface: race.surface,
        distance: race.distance,
        venueName: race.venueName,
        trackCondition: race.trackCondition,
        headCount: race.headCount ?? runners.length,
      };
      const abilities = new Map<number, number>();
      for (const runner of runners) {
        abilities.set(runner.horseNumber, calculateScore(runner, raceInfo, jockeyStats).abilityScore);
      }
      const maxAbility = Math.max(...abilities.values());
      let weightTotal = 0;
      const weights = new Map<number, number>();
      for (const [horseNumber, score] of abilities) {
        const weight = Math.exp((score - maxAbility) / 12);
        weights.set(horseNumber, weight);
        weightTotal += weight;
      }
      let impliedTotal = 0;
      const implied = new Map<number, number>();
      for (const runner of runners) {
        const value = (runner.odds ?? 0) > 0 ? 1 / runner.odds! : 0;
        implied.set(runner.horseNumber, value);
        impliedTotal += value;
      }
      ranked.push(rankByScore(runners, runner => {
        const market = (implied.get(runner.horseNumber) ?? 0) / (impliedTotal || 1);
        const ability = (weights.get(runner.horseNumber) ?? 0) / (weightTotal || 1);
        return (1 - abilityWeight) * Math.log(Math.max(market, 1e-6)) + abilityWeight * Math.log(Math.max(ability, 1e-6));
      }));
    }
    evaluate(`ブレンド 能力${abilityWeight}`, ranked);
  }
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

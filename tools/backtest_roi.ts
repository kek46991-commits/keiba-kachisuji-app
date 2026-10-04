/**
 * 取込済みの確定レース（実際の公式払戻）で、買い目生成ロジックの回収率を測る検証スクリプト。
 * 3連単・3連複はアプリと同じフォーメーション/ボックス構成を再現し、100円単位で購入した場合のROIを出す。
 *
 * 実行: DATABASE_URL=... npx tsx tools/backtest_roi.ts
 */
import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { entries, jockeyMaster, payouts, races } from "../drizzle/schema";
import { calculateScore, type EntryData } from "../server/predictionRouter";
import { blendAbilityWithMarket } from "../server/probabilityModel";
import { buildScoreFirstFormation, type CoverageFormation } from "../server/valueBetting";

type Runner = EntryData & { finishPosition: number | null };

type RaceCase = {
  runners: Runner[];
  raceInfo: { surface: string | null; distance: number | null; venueName: string | null; trackCondition: string | null; headCount: number };
  trifectaPayout: number | null;
  trifectaKey: string | null;
  trioPayout: number | null;
  trioKey: string | null;
};

type Bankroll = { bets: number; returned: number; hits: number; best: number; payoutList: number[] };

function trifectaCombos(formation: CoverageFormation): string[] {
  const combos = new Set<string>();
  for (const a of formation.first) for (const b of formation.second) for (const c of formation.third) {
    if (a !== b && b !== c && a !== c) combos.add(`${a}-${b}-${c}`);
  }
  return [...combos];
}

function trioCombos(formation: CoverageFormation): string[] {
  const combos = new Set<string>();
  const sortKey = (horses: number[]) => [...horses].sort((left, right) => left - right).join("-");
  const partners = formation.trioPartners;
  if (formation.strategy === "box" || formation.first.length > 1) {
    for (let i = 0; i < partners.length; i += 1)
      for (let j = i + 1; j < partners.length; j += 1)
        for (let k = j + 1; k < partners.length; k += 1)
          combos.add(sortKey([partners[i]!, partners[j]!, partners[k]!]));
    return [...combos];
  }
  for (let i = 0; i < partners.length; i += 1)
    for (let j = i + 1; j < partners.length; j += 1)
      combos.add(sortKey([formation.axis, partners[i]!, partners[j]!]));
  return [...combos];
}

type RankedHorse = { horseNumber: number; score: number };

function simulateFormations(label: string, cases: RaceCase[], build: (raceCase: RaceCase) => CoverageFormation | null) {
  const trifecta: Bankroll = { bets: 0, returned: 0, hits: 0, best: 0, payoutList: [] };
  const trio: Bankroll = { bets: 0, returned: 0, hits: 0, best: 0, payoutList: [] };
  let purchased = 0;

  for (const raceCase of cases) {
    const formation = build(raceCase);
    if (!formation) continue;
    purchased += 1;

    const trifectaTickets = trifectaCombos(formation);
    trifecta.bets += trifectaTickets.length * 100;
    if (raceCase.trifectaKey && raceCase.trifectaPayout !== null && trifectaTickets.includes(raceCase.trifectaKey)) {
      trifecta.returned += raceCase.trifectaPayout;
      trifecta.best = Math.max(trifecta.best, raceCase.trifectaPayout);
      trifecta.payoutList.push(raceCase.trifectaPayout);
      trifecta.hits += 1;
    }

    const trioTickets = trioCombos(formation);
    trio.bets += trioTickets.length * 100;
    if (raceCase.trioKey && raceCase.trioPayout !== null && trioTickets.includes(raceCase.trioKey)) {
      trio.returned += raceCase.trioPayout;
      trio.best = Math.max(trio.best, raceCase.trioPayout);
      trio.payoutList.push(raceCase.trioPayout);
      trio.hits += 1;
    }
  }

  const roi = (book: Bankroll) => (book.bets > 0 ? `${((book.returned / book.bets) * 100).toFixed(1)}%` : "-");
  // 少数の高配当で回収率が跳ねるため、最大配当を除いた回収率も併記して安定性を見る。
  const trimmedRoi = (book: Bankroll) =>
    book.bets > 0 ? `${(((book.returned - book.best) / book.bets) * 100).toFixed(1)}%` : "-";
  const hitRate = (book: Bankroll) => (purchased > 0 ? `${((book.hits / purchased) * 100).toFixed(1)}%` : "-");
  console.log(`  [内訳] 3連単 平均${(trifecta.bets / 100 / (purchased || 1)).toFixed(1)}点/R 最大配当${trifecta.best}円 的中配当 ${trifecta.payoutList.sort((a, b) => b - a).join(",")}`);
  console.log(
    `${label.padEnd(30)} 購入${String(purchased).padStart(3)}R` +
    `  3連単 的中${hitRate(trifecta).padStart(6)} 回収${roi(trifecta).padStart(7)}（最大配当除く${trimmedRoi(trifecta).padStart(6)}）` +
    `  3連複 的中${hitRate(trio).padStart(6)} 回収${roi(trio).padStart(7)}（同${trimmedRoi(trio).padStart(6)}）`,
  );
}

function simulate(label: string, cases: RaceCase[], rank: (raceCase: RaceCase) => RankedHorse[]) {
  simulateFormations(label, cases, raceCase => buildScoreFirstFormation(rank(raceCase)));
}

/** 混戦判定を正しく再現するため、買い目生成へはスコアの実尺度を渡す。 */
function rankedWithScores(scores: Map<number, number>): RankedHorse[] {
  return [...scores.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([horseNumber, score]) => ({ horseNumber, score }));
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

  const payoutRows = await db.select().from(payouts);
  const payoutByRace = new Map<string, { trifecta?: { key: string; payout: number }; trio?: { key: string; payout: number } }>();
  for (const row of payoutRows) {
    const bucket = payoutByRace.get(row.raceId) ?? {};
    if (row.betType === "trifecta") bucket.trifecta = { key: row.combination.replace(/\s/g, ""), payout: row.payout };
    if (row.betType === "trio") bucket.trio = { key: row.combination.replace(/\s/g, "").split("-").map(Number).sort((a, b) => a - b).join("-"), payout: row.payout };
    payoutByRace.set(row.raceId, bucket);
  }

  const raceRows = await db.select().from(races);
  const cases: RaceCase[] = [];
  for (const race of raceRows) {
    const bucket = payoutByRace.get(race.raceId);
    if (!bucket?.trifecta && !bucket?.trio) continue;
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
    if (runners.filter(runner => (runner.odds ?? 0) > 0).length < 5) continue;
    cases.push({
      runners,
      raceInfo: {
        surface: race.surface,
        distance: race.distance,
        venueName: race.venueName,
        trackCondition: race.trackCondition,
        headCount: race.headCount ?? runners.length,
      },
      trifectaPayout: bucket.trifecta?.payout ?? null,
      trifectaKey: bucket.trifecta?.key ?? null,
      trioPayout: bucket.trio?.payout ?? null,
      trioKey: bucket.trio?.key ?? null,
    });
  }

  console.log(`対象レース: ${cases.length}件（公式払戻あり・単勝オッズ5頭以上）`);

  const abilityCache = new Map<RaceCase, Map<number, number>>();
  const abilityOf = (raceCase: RaceCase) => {
    const cached = abilityCache.get(raceCase);
    if (cached) return cached;
    const scores = new Map<number, number>();
    for (const runner of raceCase.runners) {
      scores.set(runner.horseNumber, calculateScore(runner, raceCase.raceInfo, jockeyStats).abilityScore);
    }
    abilityCache.set(raceCase, scores);
    return scores;
  };

  simulate("能力スコアのみ（改修前）", cases, raceCase => rankedWithScores(abilityOf(raceCase)));

  const blendRank = (raceCase: RaceCase, abilityWeight: number) => {
    const ability = abilityOf(raceCase);
    const blended = blendAbilityWithMarket(raceCase.runners.map(runner => ({
      horseNumber: runner.horseNumber,
      abilityScore: ability.get(runner.horseNumber) ?? 0,
      odds: (runner.odds ?? 0) > 0 ? runner.odds : null,
    })), abilityWeight);
    return rankedWithScores(new Map(blended.map(item => [item.horseNumber, item.score])));
  };

  simulate("市場のみ（公式オッズ順）", cases, raceCase => blendRank(raceCase, 0));
  // 買い方（点数）の影響を切り分けるため、順位だけ変えて常にボックス24点にした場合も測る。
  const forceBox = (ranked: RankedHorse[]) => ranked.map((horse, index) => ({ horseNumber: horse.horseNumber, score: 100 - index }));
  simulate("市場順 + 常にボックス", cases, raceCase => forceBox(blendRank(raceCase, 0)));
  simulate("ブレンド0.2 + 常にボックス", cases, raceCase => forceBox(blendRank(raceCase, 0.2)));
  simulate("能力のみ + 常にフォーメーション", cases, raceCase => {
    const ranked = rankedWithScores(abilityOf(raceCase));
    return ranked.map((horse, index) => ({ horseNumber: horse.horseNumber, score: 100 - index * 10 }));
  });
  simulate("能力×市場ブレンド（現行0.2）", cases, raceCase => blendRank(raceCase, 0.2));
  for (const abilityWeight of [0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6]) {
    simulate(`能力×市場ブレンド（能力${abilityWeight}）`, cases, raceCase => blendRank(raceCase, abilityWeight));
  }

  /**
   * 妙味（オーバーレイ）重視案: 1着軸は混合スコア上位のままにし、
   * 2・3着の相手だけ「推定勝率×公式オッズ」が高い順に採る。
   */
  const overlayFormation = (raceCase: RaceCase, abilityWeight: number, minEv: number) => {
    const ability = abilityOf(raceCase);
    const blended = blendAbilityWithMarket(raceCase.runners.map(runner => ({
      horseNumber: runner.horseNumber,
      abilityScore: ability.get(runner.horseNumber) ?? 0,
      odds: (runner.odds ?? 0) > 0 ? runner.odds : null,
    })), abilityWeight);
    const oddsByHorse = new Map(raceCase.runners.map(runner => [runner.horseNumber, runner.odds]));
    const maxScore = Math.max(...blended.map(item => item.score));
    const weights = blended.map(item => Math.exp((item.score - maxScore) / 12));
    const weightTotal = weights.reduce((sum, value) => sum + value, 0) || 1;
    const rows = blended.map((item, index) => {
      const odds = oddsByHorse.get(item.horseNumber) ?? null;
      const probability = weights[index]! / weightTotal;
      return { horseNumber: item.horseNumber, score: item.score, probability, ev: odds && odds > 0 ? probability * odds : null };
    }).sort((left, right) => right.score - left.score);

    const axis = rows[0];
    if (!axis) return null;
    const partners = rows.slice(1)
      .filter(row => (row.ev ?? 0) >= minEv)
      .sort((left, right) => (right.ev ?? 0) - (left.ev ?? 0));
    const fallback = rows.slice(1);
    const pool = partners.length >= 3 ? partners : fallback;
    const second = pool.slice(0, 3).map(row => row.horseNumber);
    const third = pool.slice(0, 4).map(row => row.horseNumber);
    if (second.length < 2 || third.length < 3) return null;
    const trioPartners = pool.slice(0, 3).map(row => row.horseNumber);
    return {
      strategy: "formation" as const,
      axis: axis.horseNumber,
      first: [axis.horseNumber],
      second,
      third,
      trioPartners,
      trifectaCount: 0,
      trioCount: 0,
      targetReached: true,
      caution: null,
      trigamiWarning: "",
      scoreGap: null,
    } satisfies CoverageFormation;
  };

  for (const minEv of [0.8, 1.0, 1.2]) {
    simulateFormations(`妙味重視 相手EV${minEv}以上（能力0.2）`, cases, raceCase => overlayFormation(raceCase, 0.2, minEv));
  }

  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

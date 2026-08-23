import { drizzle } from "drizzle-orm/mysql2";
import { eq } from "drizzle-orm";
import { entries, payouts, predictions, races } from "./drizzle/schema";
import { upsertRaceEntryMaster } from "./server/raceEntryMaster";

const db = drizzle(process.env.DATABASE_URL!);
const anyDb = db as any;

const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

type DemoRace = {
  raceId: string;
  raceName: string;
  venueCode: string;
  venueName: string;
  raceNumber: number;
  organizer: "JRA" | "NAR";
  master: Array<{ horseNumber: number; horseName: string }>;
  finish: Record<number, number>;
  trifecta: string;
  trifectaPayout: number;
  quinella: string;
  quinellaPayout: number;
  widePayout: number;
  recommendedBets: string;
  investAmount: number;
};

const demoRaces: DemoRace[] = [
  {
    raceId: "20260822CHUKYO09",
    raceName: "中京9R 結果照合デモ",
    venueCode: "07",
    venueName: "中京",
    raceNumber: 9,
    organizer: "JRA",
    master: [
      { horseNumber: 1, horseName: "シャンドゥルール" },
      { horseNumber: 2, horseName: "ジーククローネ" },
      { horseNumber: 3, horseName: "ライラスター" },
      { horseNumber: 4, horseName: "ロードオールライト" },
      { horseNumber: 5, horseName: "キャネル" },
      { horseNumber: 6, horseName: "ヴラディア" },
    ],
    finish: { 5: 1, 4: 2, 2: 3, 1: 4, 3: 5, 6: 6 },
    trifecta: "5-4-2",
    trifectaPayout: 18700,
    quinella: "4-5",
    quinellaPayout: 1450,
    widePayout: 620,
    recommendedBets: JSON.stringify({
      totalBets: 9,
      trifecta: "1着5 / 2着4,2,3 / 3着4,2,3,6（9点）",
      quinella: "4-5",
      wide: "4-5",
    }),
    investAmount: 1100,
  },
  {
    raceId: "20260822OOI11",
    raceName: "大井11R 地方結果照合デモ",
    venueCode: "44",
    venueName: "大井",
    raceNumber: 11,
    organizer: "NAR",
    master: [
      { horseNumber: 1, horseName: "サンライズホープ" },
      { horseNumber: 2, horseName: "ミックファイア" },
      { horseNumber: 3, horseName: "ウシュバテソーロ" },
      { horseNumber: 4, horseName: "テーオーケインズ" },
      { horseNumber: 5, horseName: "メイショウハリオ" },
      { horseNumber: 6, horseName: "ノットゥルノ" },
    ],
    finish: { 3: 1, 6: 2, 1: 3, 2: 4, 4: 5, 5: 6 },
    trifecta: "3-6-1",
    trifectaPayout: 24600,
    quinella: "3-6",
    quinellaPayout: 2180,
    widePayout: 780,
    recommendedBets: JSON.stringify({
      totalBets: 6,
      trifecta: "1着2 / 2着3,6 / 3着1,3,6（4点）",
      quinella: "2-3",
      wide: "2-3",
    }),
    investAmount: 600,
  },
];

for (const race of demoRaces) {
  await anyDb.delete(payouts).where(eq(payouts.raceId, race.raceId));
  await anyDb.delete(predictions).where(eq(predictions.raceId, race.raceId));
  await anyDb.delete(entries).where(eq(entries.raceId, race.raceId));
  await anyDb.delete(races).where(eq(races.raceId, race.raceId));

  await anyDb.insert(races).values({
    raceId: race.raceId,
    raceName: race.raceName,
    raceDate: today,
    postTime: "15:40",
    venueCode: race.venueCode,
    venueName: race.venueName,
    raceNumber: race.raceNumber,
    surface: "dirt",
    distance: 1800,
    headCount: race.master.length,
    status: "results_confirmed",
    organizer: race.organizer,
  });

  // 保存されるデータはManus出力のダミー馬名のまま。実名は出走表マスターで解決する。
  await anyDb.insert(entries).values(
    race.master.map(entry => ({
      raceId: race.raceId,
      horseNumber: entry.horseNumber,
      gateNumber: entry.horseNumber,
      horseName: `馬${String.fromCharCode(64 + entry.horseNumber)}`,
      jockey: `騎手${entry.horseNumber}`,
      finishPosition: race.finish[entry.horseNumber] ?? null,
    })),
  );

  await anyDb.insert(payouts).values([
    { raceId: race.raceId, betType: "trifecta", combination: race.trifecta, payout: race.trifectaPayout },
    { raceId: race.raceId, betType: "quinella", combination: race.quinella, payout: race.quinellaPayout },
    { raceId: race.raceId, betType: "wide", combination: race.quinella, payout: race.widePayout },
  ]);

  await anyDb.insert(predictions).values({
    raceId: race.raceId,
    honmei: race.master[0]!.horseNumber,
    taikou: race.master[1]!.horseNumber,
    tanana: race.master[2]!.horseNumber,
    renka: JSON.stringify([race.master[3]!.horseNumber]),
    recommendedBets: race.recommendedBets,
    reasoning: "馬Aは前走の上がり最速。馬Bは枠有利。",
    investAmount: race.investAmount,
  });

  await upsertRaceEntryMaster(db as never as Parameters<typeof upsertRaceEntryMaster>[0], {
    raceKey: race.raceId,
    raceName: race.raceName,
    entries: race.master,
  });
}

console.log("seeded demo results for", demoRaces.map(race => race.raceId).join(", "), "date", today);
process.exit(0);

import type { RaceEntryMasterInput } from "./raceEntryMaster";

/** テスト予想（馬A〜馬F）と同じ馬番構成を持つ出走表マスターの初期データ。 */
export const SYNTHETIC_RACE_A_RACE_KEY = "20260822-chukyo-9r";
export const SYNTHETIC_RACE_A_RACE_NAME = "中京9R 障害3歳上オープン";

export const syntheticRaceAEntryMaster: RaceEntryMasterInput[] = [
  { horseNumber: 1, horseName: "シャンドゥルール", popularity: 5, odds: 10.6 },
  { horseNumber: 2, horseName: "ジーククローネ", popularity: 4, odds: 6.6 },
  { horseNumber: 3, horseName: "ライラスター", popularity: 2, odds: 3.0 },
  { horseNumber: 4, horseName: "ロードオールライト", popularity: 1, odds: 2.6 },
  { horseNumber: 5, horseName: "キャネル", popularity: 3, odds: 4.2 },
  { horseNumber: 6, horseName: "ヴラディア", popularity: 6, odds: 14.6 },
];

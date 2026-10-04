export type HeroAlertCandidate = {
  kind: "odds" | "important_race";
  urgency: "high" | "medium";
  title: string;
  detail: string;
  href: string;
  score: number;
  raceId: string;
  horseNumber?: number;
  oddsBefore?: number | null;
  oddsAfter?: number | null;
  changePct?: number | null;
};

/** 速報は市場急変を最優先し、次に発走直前の重賞を採用する。 */
export function selectHeroAlert(candidates: HeroAlertCandidate[]): HeroAlertCandidate | null {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => b.score - a.score)[0] ?? null;
}

export function getMinutesUntilJstStart(raceDate: string, postTime: string | null): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raceDate) || !/^\d{2}:\d{2}$/.test(postTime ?? "")) return null;
  const [year, month, day] = raceDate.split("-").map(Number);
  const [hour, minute] = (postTime ?? "").split(":").map(Number);
  const startAt = Date.UTC(year, month - 1, day, hour - 9, minute);
  return Math.floor((startAt - Date.now()) / 60_000);
}

/**
 * 比較グラフに表示する馬番を、急変対象を優先して直近オッズのある順に選ぶ。
 * オッズ未取得の馬は比較線を出せないため対象外にする。
 */
export function selectComparisonHorseNumbers(
  snapshots: Array<{ horseNumber: number; winOdds: number | null }>,
  focusedHorseNumber?: number | null,
  maxHorses = 4,
): number[] {
  const selected: number[] = [];
  const hasOdds = (horseNumber: number) => snapshots.some(snapshot => snapshot.horseNumber === horseNumber && snapshot.winOdds !== null);

  if (focusedHorseNumber && hasOdds(focusedHorseNumber)) selected.push(focusedHorseNumber);

  for (const snapshot of snapshots) {
    if (selected.length >= maxHorses) break;
    if (snapshot.winOdds === null || selected.includes(snapshot.horseNumber)) continue;
    selected.push(snapshot.horseNumber);
  }

  return selected;
}

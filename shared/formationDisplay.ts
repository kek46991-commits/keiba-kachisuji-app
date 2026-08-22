/**
 * 買い目フォーメーションの表示整形。
 * 「1着8,5 / 2着8,5,7」のように同じ馬番が各着に重複して並ぶ内部表記を、
 * 1着馬ごとに分岐した直感的な表記（1着8 → 2着5,7 → 3着5,7,3）へ整形する。
 * 買い目の中身（点数・組合せ）は変えず、表示だけを整える。
 */

export type FormationLegs = {
  first: number[];
  second: number[];
  third: number[];
};

export type FormationBranch = {
  first: number;
  second: number[];
  third: number[];
  count: number;
};

const LEG_SEPARATOR = " ／ ";

/** 1着候補ごとに、その馬を除いた2着・3着候補へ分岐させる。 */
export function buildFormationBranches(legs: FormationLegs): FormationBranch[] {
  const first = uniqueNumbers(legs.first);
  const second = uniqueNumbers(legs.second);
  const third = uniqueNumbers(legs.third);
  return first.map((head) => {
    const branchSecond = second.filter((number) => number !== head);
    const branchThird = third.filter((number) => number !== head);
    return { first: head, second: branchSecond, third: branchThird, count: countBranchTickets(branchSecond, branchThird) };
  });
}

/** 3連単フォーメーションを「1着x → 2着… → 3着…（n点）」形式へ整形する。 */
export function formatTrifectaFormation(legs: FormationLegs): string {
  const branches = buildFormationBranches(legs);
  if (branches.length === 0) return "";
  return branches
    .map((branch) => `1着${branch.first} → 2着${branch.second.join(",")} → 3着${branch.third.join(",")}（${branch.count}点）`)
    .join(LEG_SEPARATOR);
}

/** 軸1頭＋相手（3連複・馬連・ワイド）の表記から、軸の重複と相手の重複を除く。 */
export function formatAxisSelection(axis: number, partners: number[]): string {
  const cleaned = uniqueNumbers(partners).filter((number) => number !== axis);
  return cleaned.length > 0 ? `${axis} - ${cleaned.join(",")}` : `${axis}`;
}

/**
 * 保存済みの買い目文字列を表示用に整形する。
 * 「1着… / 2着… / 3着…」形式は1着ごとの分岐表記へ、「軸 - 相手」形式は重複除去だけを行う。
 * 解析できない文字列は元のまま返す。
 */
export function formatBetSelectionForDisplay(selection: string | null | undefined): string {
  if (!selection) return "";
  const formation = selection.match(
    /1着\s*([\d,\s]+?)\s*\/\s*2着\s*([\d,\s]+?)\s*\/\s*3着\s*([\d,\s]+?)\s*(?:[（(]\s*(\d+)\s*点\s*[)）])?\s*$/,
  );
  if (formation) {
    const prefix = selection.slice(0, formation.index ?? 0);
    const legs: FormationLegs = {
      first: parseNumbers(formation[1]),
      second: parseNumbers(formation[2]),
      third: parseNumbers(formation[3]),
    };
    const branches = buildFormationBranches(legs);
    if (branches.length === 0) return selection;
    const total = branches.reduce((sum, branch) => sum + branch.count, 0);
    const body = branches.length === 1
      ? `1着${branches[0]!.first} → 2着${branches[0]!.second.join(",")} → 3着${branches[0]!.third.join(",")}`
      : formatTrifectaFormation(legs);
    return `${prefix}${body}${branches.length === 1 ? `（${total}点）` : ""}`;
  }

  const axisPattern = selection.match(/^(.*?)(\d+)\s*-\s*([\d,\s]+?)\s*((?:[（(].*)?)$/);
  if (axisPattern && !/\d\s*-/.test(axisPattern[1]!)) {
    // 「4-5,2-5,3-5」のような組合せ列挙は軸表記ではないため、上の除外条件で対象外にする。
    const axis = Number(axisPattern[2]);
    const partners = parseNumbers(axisPattern[3]);
    if (Number.isInteger(axis) && partners.includes(axis)) {
      return `${axisPattern[1]}${formatAxisSelection(axis, partners)}${axisPattern[4]}`;
    }
  }
  return selection;
}

function countBranchTickets(second: number[], third: number[]): number {
  return second.reduce(
    (sum, secondHorse) => sum + third.filter((thirdHorse) => thirdHorse !== secondHorse).length,
    0,
  );
}

function parseNumbers(raw: string | undefined): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((number) => Number.isInteger(number) && number > 0);
}

function uniqueNumbers(values: readonly number[]): number[] {
  return Array.from(new Set(values.filter((value) => Number.isInteger(value) && value > 0)));
}

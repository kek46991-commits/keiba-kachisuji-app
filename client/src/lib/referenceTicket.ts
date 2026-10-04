export type DisplayTicket = {
  trifecta: string;
  trio: string;
  trifectaCount: number;
  trioCount: number;
  totalBets: number;
  riskWarning?: string;
  formationCaution?: string;
  referenceOnly?: boolean;
  referenceNotice?: string;
};

type StoredPredictionMarks = {
  honmei?: number | null;
  taikou?: number | null;
  tanana?: number | null;
  renka?: string | null;
};

function uniqueHorseNumbers(values: Array<number | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is number => typeof value === "number" && Number.isInteger(value) && value > 0)));
}

function parseRenkas(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value) && value > 0) : [];
  } catch {
    return [];
  }
}

function countTrifecta(axis: number, second: number[], third: number[]) {
  const combinations = new Set<string>();
  for (const runnerUp of second) for (const thirdPlace of third) {
    if (axis !== runnerUp && axis !== thirdPlace && runnerUp !== thirdPlace) combinations.add(`${axis}-${runnerUp}-${thirdPlace}`);
  }
  return combinations.size;
}

/**
 * 旧保存データの「見送り」を、当時の予想印だけで再構成した表示専用の参考フォーメーションへ変換する。
 * 購入推奨・精算・実績集計には使わず、保存済みスコア順の確認だけを目的とする。
 */
export function buildSavedScoreReferenceTicket(ticket: DisplayTicket | null, prediction: StoredPredictionMarks | null | undefined): DisplayTicket | null {
  if (!ticket || ticket.referenceOnly || ticket.totalBets > 0 || ticket.trifecta !== "見送り") return ticket;
  if (!prediction) return ticket;

  const ranked = uniqueHorseNumbers([prediction.honmei, prediction.taikou, prediction.tanana, ...parseRenkas(prediction.renka)]);
  if (ranked.length < 3) return ticket;

  const [axis, ...partners] = ranked;
  const second = partners.slice(0, 3);
  const third = partners.slice(0, 4);
  const trioPartners = partners.slice(0, 3);
  const trifectaCount = countTrifecta(axis!, second, third);
  const trioCount = trioPartners.length >= 2 ? (trioPartners.length * (trioPartners.length - 1)) / 2 : 0;
  const totalBets = trifectaCount + trioCount;
  const referenceNotice = "購入推奨なし：保存済み予想の印だけで再構成した表示専用の参考フォーメーションです。元の見送り判定、精算、実績集計は変更しません。";

  return {
    ...ticket,
    trifecta: `参考フォーメーション: 1着${axis} / 2着${second.join(",")} / 3着${third.join(",")}（${trifectaCount}点）`,
    trio: trioCount > 0 ? `参考カバー: ${axis} - ${trioPartners.join(",")}（1頭軸流し・${trioCount}点）` : "対象外",
    trifectaCount,
    trioCount,
    totalBets,
    formationCaution: referenceNotice,
    referenceOnly: true,
    referenceNotice,
  };
}

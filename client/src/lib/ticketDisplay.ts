import { formatBetSelectionForDisplay } from "@shared/formationDisplay";

const ticketTextFields = ["trifecta", "trio", "quinella", "wide", "exacta"] as const;

/**
 * 買い目文字列だけを表示用に整形する。組合せ・点数・保存済みデータは変更しない。
 * 「1着8,5 / 2着8,5,7」のような重複表記を「1着8 → 2着5,7」の分岐表記へ揃える。
 */
export function formatTicketTextsForDisplay<T extends object>(ticket: T | null | undefined): T | null {
  if (!ticket) return null;
  const formatted: Record<string, unknown> = { ...(ticket as Record<string, unknown>) };
  for (const field of ticketTextFields) {
    const value = formatted[field];
    if (typeof value === "string") formatted[field] = formatBetSelectionForDisplay(value);
  }
  return formatted as T;
}

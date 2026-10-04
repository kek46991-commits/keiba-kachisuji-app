/** catch した unknown な例外から、ログ・画面表示に使えるメッセージを取り出す。 */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return String(error);
}

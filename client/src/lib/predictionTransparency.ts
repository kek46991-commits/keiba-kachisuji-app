export type ExpectedValueStatus = "positive" | "negative" | "unavailable";

export function getExpectedValueStatus({ odds, winProbability, expectedValue }: { odds: number | null | undefined; winProbability: number | null | undefined; expectedValue: number | null | undefined }): { status: ExpectedValueStatus; reason?: string } {
  if (typeof odds !== "number" || odds <= 0) return { status: "unavailable", reason: "公式単勝オッズが未取得または不正です。" };
  if (typeof winProbability !== "number") return { status: "unavailable", reason: "推定勝率が未算出です。" };
  if (typeof expectedValue !== "number") return { status: "unavailable", reason: "EVが未算出です。" };
  return { status: expectedValue < 0 ? "negative" : "positive" };
}

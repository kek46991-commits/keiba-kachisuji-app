import { drizzle } from "drizzle-orm/mysql2";
import { accessPasses } from "./drizzle/schema";
import { expiresAtFor, hashAccessKey, normalizeAccessKey } from "./server/access/accessPass";

/**
 * デモ環境用の期限付きアクセスパスを1件登録する。
 * DEMO_ACCESS_KEY が未設定なら何もしない（本番で意図せず解放しないため）。
 */
async function main() {
  const raw = process.env.DEMO_ACCESS_KEY;
  if (raw === undefined || raw.trim() === "") {
    console.log("DEMO_ACCESS_KEY unset: skipped");
    return;
  }

  const key = normalizeAccessKey(raw);
  const db = drizzle(process.env.DATABASE_URL!);

  await db
    .insert(accessPasses)
    .values({
      keyHash: hashAccessKey(key),
      plan: "month",
      provider: "demo",
      providerRef: "demo-access-pass",
      expiresAt: expiresAtFor("month"),
      amount: 0,
      currency: "jpy",
    })
    .onDuplicateKeyUpdate({
      set: { expiresAt: expiresAtFor("month"), revokedAt: null },
    });

  console.log(`seeded demo access pass ${key}`);
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

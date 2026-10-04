import { and, eq } from "drizzle-orm";
import { accessPasses } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import {
  ACCESS_PASS_PLANS,
  deriveAccessKeyForPayment,
  expiresAtFor,
  hashAccessKey,
  type AccessPassPlan,
} from "./accessPass";

export type IssuedAccessPass = {
  key: string;
  plan: AccessPassPlan;
  expiresAt: Date;
  alreadyIssued: boolean;
};

export type IssueAccessPassInput = {
  provider: string;
  providerRef: string;
  plan: AccessPassPlan;
  email?: string | null;
  amount?: number | null;
  currency?: string | null;
};

/**
 * 決済1件に対して期限付きアクセスパスを発行する（冪等）。
 * キーは決済参照から導出するため、Webhookと購入完了画面のどちらから呼んでも同じ値になる。
 */
export async function issueAccessPassForPayment(input: IssueAccessPassInput): Promise<IssuedAccessPass | null> {
  const db = await getDb();
  if (!db) return null;

  const secret = ENV.cookieSecret === "" ? ENV.stripeSecretKey : ENV.cookieSecret;
  const key = deriveAccessKeyForPayment(secret, input.provider, input.providerRef);
  const keyHash = hashAccessKey(key);

  const [existing] = await db
    .select()
    .from(accessPasses)
    .where(and(eq(accessPasses.provider, input.provider), eq(accessPasses.providerRef, input.providerRef)))
    .limit(1);

  if (existing) {
    return { key, plan: input.plan, expiresAt: existing.expiresAt, alreadyIssued: true };
  }

  const expiresAt = expiresAtFor(input.plan);

  await db.insert(accessPasses).values({
    keyHash,
    plan: input.plan,
    provider: input.provider,
    providerRef: input.providerRef,
    email: input.email ?? null,
    amount: input.amount ?? ACCESS_PASS_PLANS[input.plan].amount,
    currency: input.currency ?? "jpy",
    expiresAt,
  });

  return { key, plan: input.plan, expiresAt, alreadyIssued: false };
}

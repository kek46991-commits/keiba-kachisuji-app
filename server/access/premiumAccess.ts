import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { accessPasses, subscriptions } from "../../drizzle/schema";
import { getDb } from "../db";
import { publicProcedure } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
import { hashAccessKey, isAccessPassValid, readAccessKeyFromRequest } from "./accessPass";

export type PremiumAccess = {
  isPremium: boolean;
  source: "subscription" | "access_pass" | "none";
  status: "active" | "trialing" | "canceled" | "past_due" | "expired" | "none";
  expiresAt: Date | null;
};

const noAccess: PremiumAccess = { isPremium: false, source: "none", status: "none", expiresAt: null };

/**
 * 有料アクセスの判定。ログインユーザーのサブスクリプション、
 * またはアカウント不要の期限付きアクセスパスのどちらかで解放する。
 */
export async function resolvePremiumAccess(ctx: TrpcContext): Promise<PremiumAccess> {
  const db = await getDb();
  if (!db) return noAccess;

  const now = new Date();

  if (ctx.user) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (sub) {
      const isTrialing = sub.status === "trialing" && sub.trialEndsAt !== null && sub.trialEndsAt > now;
      const isActive = sub.status === "active";
      if (isTrialing || isActive) {
        return {
          isPremium: true,
          source: "subscription",
          status: sub.status,
          expiresAt: isTrialing ? sub.trialEndsAt : sub.currentPeriodEnd,
        };
      }
      return { isPremium: false, source: "none", status: sub.status, expiresAt: null };
    }
  }

  const key = readAccessKeyFromRequest(ctx.req);
  if (key) {
    const [pass] = await db
      .select()
      .from(accessPasses)
      .where(eq(accessPasses.keyHash, hashAccessKey(key)))
      .limit(1);

    if (isAccessPassValid(pass ?? null, now)) {
      return { isPremium: true, source: "access_pass", status: "active", expiresAt: pass!.expiresAt };
    }
    if (pass) {
      return { isPremium: false, source: "none", status: "expired", expiresAt: pass.expiresAt };
    }
  }

  return noAccess;
}

/** アクセスパスをプロバイダー参照（Stripeセッション等）から引く。二重発行防止に使う。 */
export async function findAccessPassByProviderRef(provider: string, providerRef: string) {
  const db = await getDb();
  if (!db) return null;

  const [pass] = await db
    .select()
    .from(accessPasses)
    .where(and(eq(accessPasses.provider, provider), eq(accessPasses.providerRef, providerRef)))
    .limit(1);

  return pass ?? null;
}

/** 有料コンテンツAPI用の procedure。未購入は FORBIDDEN で弾く。 */
export const premiumProcedure = publicProcedure.use(async ({ ctx, next }) => {
  const access = await resolvePremiumAccess(ctx);
  if (!access.isPremium) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "この予想は有料会員限定です。プランのご購入またはアクセスキーの入力が必要です。",
    });
  }
  return next({ ctx: { ...ctx, premiumAccess: access } });
});

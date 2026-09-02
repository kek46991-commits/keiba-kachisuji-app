import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { accessPasses } from "../../drizzle/schema";
import {
  ACCESS_PASS_COOKIE,
  ACCESS_PASS_PLANS,
  hashAccessKey,
  isAccessPassValid,
  type AccessPassPlan,
} from "./accessPass";
import { issueAccessPassForPayment } from "./issueAccessPass";
import { resolvePremiumAccess } from "./premiumAccess";
import { getStripe } from "../stripe/client";

const planInput = z.object({ plan: z.enum(["day", "month"]) });

/** 発行済みキーをブラウザに保持させる。有効期限はパスの期限に合わせる。 */
function setAccessKeyCookie(
  res: { cookie: (name: string, value: string, options: Record<string, unknown>) => void },
  key: string,
  expiresAt: Date,
  secure: boolean,
) {
  res.cookie(ACCESS_PASS_COOKIE, key, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure,
    expires: expiresAt,
  });
}

function isSecureRequest(req: { protocol: string; headers: Record<string, unknown> }): boolean {
  if (req.protocol === "https") return true;
  const proto = req.headers["x-forwarded-proto"];
  const list = Array.isArray(proto) ? proto : typeof proto === "string" ? proto.split(",") : [];
  return list.some(value => String(value).trim().toLowerCase() === "https");
}

/** Stripeの生エラー（APIキー断片を含む英文）を利用者へ露出させない。 */
function paymentError(error: unknown): TRPCError {
  console.error("[accessPass] stripe error:", error);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "決済処理を開始できませんでした。時間をおいて再度お試しください。",
  });
}

export const accessPassRouter = router({
  /** 販売プラン一覧（購入ページの表示用）。 */
  getPlans: publicProcedure.query(() =>
    Object.entries(ACCESS_PASS_PLANS).map(([plan, detail]) => ({
      plan: plan as AccessPassPlan,
      label: detail.label,
      days: detail.days,
      amount: detail.amount,
      currency: "jpy" as const,
    })),
  ),

  /** 現在のアクセス状態（サブスクリプション or アクセスパス）。 */
  getAccess: publicProcedure.query(async ({ ctx }) => {
    const access = await resolvePremiumAccess(ctx);
    return {
      isPremium: access.isPremium,
      source: access.source,
      status: access.status,
      expiresAt: access.expiresAt?.toISOString() ?? null,
    };
  }),

  /** アカウント登録不要の都度払いCheckout（期限付きアクセスパス購入）。 */
  createCheckout: publicProcedure.input(planInput).mutation(async ({ ctx, input }) => {
    if (ENV.stripeSecretKey === "") {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "ただ今オンライン決済を準備中です。恐れ入りますが後ほどお試しください。",
      });
    }

    const detail = ACCESS_PASS_PLANS[input.plan];
    const origin = ctx.req.headers.origin ?? `${ctx.req.protocol}://${ctx.req.headers.host}`;

    const session = await getStripe().checkout.sessions
      .create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "jpy",
              product_data: {
                name: `競馬でGO！ ${detail.label}`,
                description: `購入から${detail.days}日間、AI予想・的中判定・回収率の全機能が閲覧できます。`,
              },
              unit_amount: detail.amount,
            },
            quantity: 1,
          },
        ],
        metadata: { type: "access_pass", plan: input.plan },
        success_url: `${origin}/access-pass?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/access-pass?canceled=1`,
      })
      .catch(error => {
        throw paymentError(error);
      });

    return { url: session.url };
  }),

  /**
   * 決済完了直後のキー受け取り。Webhookが先に発行していればそれを返し、
   * 未発行なら Stripe 側の支払い済みセッションを検証して発行する。
   */
  claim: publicProcedure
    .input(z.object({ sessionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false as const, message: "DB接続エラー" };

      const session = await getStripe().checkout.sessions.retrieve(input.sessionId).catch(error => {
        throw paymentError(error);
      });
      if (session.payment_status !== "paid") {
        return { success: false as const, message: "決済が完了していません" };
      }

      const plan = session.metadata?.plan;
      if (plan !== "day" && plan !== "month") {
        return { success: false as const, message: "対象外の決済です" };
      }

      const issued = await issueAccessPassForPayment({
        provider: "stripe",
        providerRef: session.id,
        plan,
        email: session.customer_details?.email ?? null,
        amount: session.amount_total,
        currency: session.currency,
      });

      if (!issued) return { success: false as const, message: "DB接続エラー" };

      setAccessKeyCookie(ctx.res, issued.key, issued.expiresAt, isSecureRequest(ctx.req));
      return {
        success: true as const,
        key: issued.key,
        expiresAt: issued.expiresAt.toISOString(),
        plan: issued.plan,
      };
    }),

  /** 既存キーの入力でブラウザに再ログイン相当の状態を作る。 */
  redeem: publicProcedure
    .input(z.object({ key: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false as const, message: "DB接続エラー" };

      const [pass] = await db
        .select()
        .from(accessPasses)
        .where(eq(accessPasses.keyHash, hashAccessKey(input.key)))
        .limit(1);

      if (!isAccessPassValid(pass ?? null)) {
        return {
          success: false as const,
          message: pass ? "このアクセスキーは有効期限が切れています。" : "アクセスキーが見つかりません。",
        };
      }

      setAccessKeyCookie(ctx.res, input.key, pass!.expiresAt, isSecureRequest(ctx.req));
      return { success: true as const, expiresAt: pass!.expiresAt.toISOString(), plan: pass!.plan };
    }),

  /** ブラウザからキーを外す（共有端末での利用終了）。 */
  signOut: publicProcedure.mutation(({ ctx }) => {
    ctx.res.clearCookie(ACCESS_PASS_COOKIE, { path: "/" });
    return { success: true as const };
  }),
});

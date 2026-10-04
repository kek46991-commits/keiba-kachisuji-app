import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { PRODUCTS } from "./products";
import { getStripe } from "./client";

export const subscriptionRouter = router({
  // サブスクリプション状態を取得
  getStatus: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) {
      return { status: "none" as const, isPremium: false, trialEndsAt: null, daysLeft: null };
    }

    const db = await getDb();
    if (!db) return { status: "none" as const, isPremium: false, trialEndsAt: null, daysLeft: null };

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (!sub) {
      return { status: "none" as const, isPremium: false, trialEndsAt: null, daysLeft: null };
    }

    const now = new Date();
    const trialEndsAt = sub.trialEndsAt;
    const isTrialing = sub.status === "trialing" && trialEndsAt != null && now < trialEndsAt;
    const isActive = sub.status === "active";
    const isPremium = isTrialing || isActive;

    // トライアル残り日数
    let daysLeft: number | null = null;
    if (isTrialing && trialEndsAt) {
      daysLeft = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    return {
      status: sub.status,
      isPremium,
      trialEndsAt: trialEndsAt?.toISOString() ?? null,
      daysLeft,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }),

  // トライアル開始（ユーザー登録時に自動呼び出し）
  startTrial: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { success: false, message: "DB接続エラー" };

    // 既存のサブスクリプションがあるか確認
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (existing) {
      return { success: true, message: "既にサブスクリプションが存在します" };
    }

    // 10日間の無料トライアルを開始
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

    await db.insert(subscriptions).values({
      userId: ctx.user.id,
      status: "trialing",
      trialStartedAt: now,
      trialEndsAt: trialEndsAt,
    });

    return { success: true, message: "10日間の無料トライアルを開始しました" };
  }),

  // Stripe Checkoutセッション作成
  createCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");

    const user = ctx.user;
    const origin = ctx.req.headers.origin || "https://kachisujiweb-mr32htbm.manus.space";

    // 既存のStripeカスタマーを検索 or 作成
    let [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, user.id))
      .limit(1);

    let customerId = sub?.stripeCustomerId;

    if (!customerId) {
      const customer = await getStripe().customers.create({
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        metadata: { userId: user.id.toString() },
      });
      customerId = customer.id;

      if (sub) {
        await db
          .update(subscriptions)
          .set({ stripeCustomerId: customerId })
          .where(eq(subscriptions.id, sub.id));
      }
    }

    // Checkout Session作成（カード + PayPay対応）
    // トライアルはローカルDBで管理するため、Stripe側のtrial_period_daysは設定しない
    const session = await getStripe().checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"] as any,
      line_items: [
        {
          price_data: {
            currency: PRODUCTS.premium.currency,
            product_data: {
              name: PRODUCTS.premium.name,
              description: PRODUCTS.premium.description,
            },
            unit_amount: PRODUCTS.premium.priceAmount,
            recurring: { interval: PRODUCTS.premium.interval },
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        metadata: { userId: user.id.toString() },
      },
      allow_promotion_codes: true,
      client_reference_id: user.id.toString(),
      metadata: {
        user_id: user.id.toString(),
        customer_email: user.email ?? "",
        customer_name: user.name ?? "",
      },
      success_url: `${origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription/cancel`,
    });

    return { url: session.url };
  }),

  // Checkoutセッション検証（決済完了後に即時反映）
  verifyCheckout: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { success: false, isPremium: false };

      try {
        // Stripe APIでCheckoutセッションを確認
        const session = await getStripe().checkout.sessions.retrieve(input.sessionId);

        if (session.payment_status !== "paid" || session.status !== "complete") {
          return { success: false, isPremium: false };
        }

        const userId = ctx.user.id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        // DBのサブスクリプションを即時更新
        const [existing] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, userId))
          .limit(1);

        if (existing) {
          await db
            .update(subscriptions)
            .set({
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              status: "active",
            })
            .where(eq(subscriptions.id, existing.id));
        } else {
          const now = new Date();
          await db.insert(subscriptions).values({
            userId,
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            status: "active",
            trialStartedAt: now,
            trialEndsAt: now,
          });
        }

        return { success: true, isPremium: true };
      } catch (err) {
        console.error("[verifyCheckout] Error:", err);
        return { success: false, isPremium: false };
      }
    }),

  // サブスクリプションキャンセル
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { success: false, message: "DB接続エラー" };

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, ctx.user.id))
      .limit(1);

    if (!sub?.stripeSubscriptionId) {
      return { success: false, message: "有効なサブスクリプションが見つかりません" };
    }

    // Stripeでキャンセル（期間終了時に停止）
    await getStripe().subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await db
      .update(subscriptions)
      .set({ status: "canceled" })
      .where(eq(subscriptions.id, sub.id));

    return { success: true, message: "サブスクリプションをキャンセルしました。期間終了まで利用可能です。" };
  }),
});

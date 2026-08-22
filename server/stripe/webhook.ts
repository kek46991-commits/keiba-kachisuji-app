import { Express, Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { subscriptions } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const stripe = new Stripe(ENV.stripeSecretKey);

export function registerStripeWebhook(app: Express) {
  app.post(
    "/api/stripe/webhook",
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event;

      try {
        // express.raw() を /api/stripe/webhook に適用済みなので
        // req.body は Buffer として届く
        const rawBody = Buffer.isBuffer(req.body)
          ? req.body
          : typeof req.body === "string"
            ? Buffer.from(req.body)
            : Buffer.from(JSON.stringify(req.body));

        event = stripe.webhooks.constructEvent(rawBody, sig, ENV.stripeWebhookSecret);
      } catch (err: any) {
        console.error("[Webhook] Signature verification failed:", err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
      }

      // テストイベント対応
      if (event.id.startsWith("evt_test_")) {
        console.log("[Webhook] Test event detected, returning verification response");
        return res.json({ verified: true });
      }

      console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

      try {
        switch (event.type) {
          case "customer.subscription.created":
          case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;
            const db = await getDb();
            if (!db) break;

            // StripeカスタマーIDからサブスクリプションを検索
            const [sub] = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.stripeCustomerId, customerId))
              .limit(1);

            if (sub) {
              let status: "trialing" | "active" | "canceled" | "past_due" | "expired" = "active";
              if (subscription.status === "trialing") status = "trialing";
              else if (subscription.status === "active") status = "active";
              else if (subscription.status === "canceled") status = "canceled";
              else if (subscription.status === "past_due") status = "past_due";
              else status = "expired";

              await db
                .update(subscriptions)
                .set({
                  stripeSubscriptionId: subscription.id,
                  status,
                  currentPeriodEnd: new Date((subscription as any).current_period_end * 1000),
                })
                .where(eq(subscriptions.id, sub.id));
            }
            break;
          }

          case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription;
            const customerId = subscription.customer as string;
            const db = await getDb();
            if (!db) break;

            const [sub] = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.stripeCustomerId, customerId))
              .limit(1);

            if (sub) {
              await db
                .update(subscriptions)
                .set({ status: "expired" })
                .where(eq(subscriptions.id, sub.id));
            }
            break;
          }

          case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice;
            const customerId = invoice.customer as string;
            const db = await getDb();
            if (!db) break;

            const [sub] = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.stripeCustomerId, customerId))
              .limit(1);

            if (sub) {
              await db
                .update(subscriptions)
                .set({ status: "past_due" })
                .where(eq(subscriptions.id, sub.id));
            }
            break;
          }

          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const userId = session.client_reference_id;
            const customerId = session.customer as string;
            const subscriptionId = session.subscription as string;
            const db = await getDb();
            if (!db || !userId) break;

            // サブスクリプションレコードを更新
            const [sub] = await db
              .select()
              .from(subscriptions)
              .where(eq(subscriptions.userId, parseInt(userId)))
              .limit(1);

            if (sub) {
              await db
                .update(subscriptions)
                .set({
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscriptionId,
                  status: "active",
                })
                .where(eq(subscriptions.id, sub.id));
            } else {
              // サブスクリプションレコードがなければ作成
              const now = new Date();
              await db.insert(subscriptions).values({
                userId: parseInt(userId),
                stripeCustomerId: customerId,
                stripeSubscriptionId: subscriptionId,
                status: "active",
                trialStartedAt: now,
                trialEndsAt: now, // Stripe経由なのでトライアルはStripe側で管理
              });
            }
            break;
          }
        }
      } catch (err) {
        console.error("[Webhook] Error processing event:", err);
      }

      res.json({ received: true });
    }
  );
}

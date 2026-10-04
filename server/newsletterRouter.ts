import { z } from "zod";
import { publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { newsletterSubscribers } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const newsletterRouter = router({
  subscribe: publicProcedure
    .input(
      z.object({
        email: z.string().email("有効なメールアドレスを入力してください"),
        name: z.string().max(128).optional(),
        source: z.string().max(256).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { email, name, source } = input;
      const db = await getDb();
      if (!db) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      }
      // Check if already subscribed
      const existing = await db
        .select()
        .from(newsletterSubscribers)
        .where(eq(newsletterSubscribers.email, email))
        .limit(1);

      if (existing.length > 0) {
        const sub = existing[0];
        if (sub.status === "unsubscribed") {
          // Re-subscribe
          await db
            .update(newsletterSubscribers)
            .set({ status: "active", unsubscribedAt: null })
            .where(eq(newsletterSubscribers.id, sub.id));
          return { success: true, message: "再登録が完了しました！" };
        }
        return { success: true, message: "既に登録済みです。毎週の予想をお届けします！" };
      }

      // New subscriber
      await db.insert(newsletterSubscribers).values({
        email,
        name: name || null,
        source: source || null,
      });
      return { success: true, message: "登録完了！毎週の無料予想をお届けします。" };
    }),
});

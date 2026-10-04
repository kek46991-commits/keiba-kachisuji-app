import { z } from "zod";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { newsItems } from "../drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const newsRouter = router({
  // ニュース一覧取得（管理者用・全件）
  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    const items = await db
      .select()
      .from(newsItems)
      .orderBy(desc(newsItems.publishedAt));
    return items;
  }),

  // ニュース作成
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(256),
        thumbnailUrl: z.string().max(512).optional(),
        summary: z.string().optional(),
        linkUrl: z.string().max(512).optional(),
        category: z.enum(["breaking", "result", "column", "prediction"]).default("breaking"),
        isPickup: z.boolean().default(false),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.insert(newsItems).values({
        title: input.title,
        thumbnailUrl: input.thumbnailUrl || null,
        summary: input.summary || null,
        linkUrl: input.linkUrl || null,
        category: input.category,
        isPickup: input.isPickup,
      });

      return { success: true };
    }),

  // ニュース更新
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(256).optional(),
        thumbnailUrl: z.string().max(512).optional().nullable(),
        summary: z.string().optional().nullable(),
        linkUrl: z.string().max(512).optional().nullable(),
        category: z.enum(["breaking", "result", "column", "prediction"]).optional(),
        isPickup: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { id, ...updateData } = input;
      const filtered = Object.fromEntries(
        Object.entries(updateData).filter(([, v]) => v !== undefined)
      );

      if (Object.keys(filtered).length === 0) {
        return { success: true };
      }

      await db.update(newsItems).set(filtered).where(eq(newsItems.id, id));
      return { success: true };
    }),

  // ニュース削除
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.delete(newsItems).where(eq(newsItems.id, input.id));
      return { success: true };
    }),

  // ピックアップ切り替え
  togglePickup: adminProcedure
    .input(z.object({ id: z.number(), isPickup: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(newsItems).set({ isPickup: input.isPickup }).where(eq(newsItems.id, input.id));
      return { success: true };
    }),

  // 有効/無効切り替え
  toggleActive: adminProcedure
    .input(z.object({ id: z.number(), isActive: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      await db.update(newsItems).set({ isActive: input.isActive }).where(eq(newsItems.id, input.id));
      return { success: true };
    }),
});

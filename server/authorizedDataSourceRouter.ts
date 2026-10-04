import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { authorizedDataSources, dataImportAudits } from "../drizzle/schema";
import { adminProcedure, router } from "./_core/trpc";
import { getDb } from "./db";

const sourceInput = z.object({
  sourceKey: z.string().regex(/^[a-z0-9][a-z0-9_-]{2,63}$/),
  providerName: z.string().min(2).max(128),
  organizer: z.enum(["JRA", "NAR"]),
  deliveryMethod: z.enum(["csv", "api"]),
  authorizationReference: z.string().url().max(512),
  allowedUses: z.array(z.enum(["db_storage", "internal_settlement", "aggregate_display"])).min(1),
});

/**
 * 許諾根拠を持つ提供元を管理する管理者専用ルーター。
 * 未確認のWebサイト・アプリ・個人契約エクスポートは登録対象外。
 */
export const authorizedDataSourceRouter = router({
  registerPending: adminProcedure.input(sourceInput).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    const [existing] = await db.select({ id: authorizedDataSources.id })
      .from(authorizedDataSources)
      .where(eq(authorizedDataSources.sourceKey, input.sourceKey))
      .limit(1);
    if (existing) throw new Error("同じデータ提供元識別子はすでに登録されています。");
    await db.insert(authorizedDataSources).values({
      ...input,
      allowedUses: input.allowedUses,
      status: "pending",
    });
    return { sourceKey: input.sourceKey, status: "pending" as const };
  }),

  activate: adminProcedure.input(z.object({ sourceKey: z.string().min(3).max(64) })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    const updated = await db.update(authorizedDataSources)
      .set({ status: "active", approvedAt: new Date() })
      .where(eq(authorizedDataSources.sourceKey, input.sourceKey));
    if ((updated as { affectedRows?: number }).affectedRows === 0) throw new Error("データ提供元が見つかりません。");
    return { sourceKey: input.sourceKey, status: "active" as const };
  }),

  revoke: adminProcedure.input(z.object({ sourceKey: z.string().min(3).max(64) })).mutation(async ({ input }) => {
    const db = await getDb();
    if (!db) throw new Error("DB接続エラー");
    await db.update(authorizedDataSources)
      .set({ status: "revoked" })
      .where(eq(authorizedDataSources.sourceKey, input.sourceKey));
    return { sourceKey: input.sourceKey, status: "revoked" as const };
  }),

  list: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(authorizedDataSources).orderBy(desc(authorizedDataSources.updatedAt));
  }),

  listAudits: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(30) }).optional())
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(dataImportAudits).orderBy(desc(dataImportAudits.createdAt)).limit(input?.limit ?? 30);
    }),
});

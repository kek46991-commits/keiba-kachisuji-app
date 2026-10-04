import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { authorizedDataSources, dataImportAudits, type AuthorizedDataSource } from "../drizzle/schema";
import { getDb } from "./db";

export type AuthorizedDeliveryMethod = "csv" | "api";
export type AuthorizedOrganizer = "JRA" | "NAR";
export type AuthorizedImportKind = "race_list" | "entries" | "payouts" | "odds" | "combination_odds";

export function validateAuthorizedDataSource<T extends Pick<AuthorizedDataSource, "id" | "sourceKey" | "organizer" | "deliveryMethod" | "status">>(
  source: T,
  input: { sourceKey: string; organizer: AuthorizedOrganizer; deliveryMethod: AuthorizedDeliveryMethod },
): T {
  if (source.sourceKey !== input.sourceKey) throw new Error("許諾済みデータ提供元の識別子が一致しません。");
  if (source.status !== "active") throw new Error("このデータ提供元は有効化されていません。契約・許諾を確認してから有効化してください。");
  if (source.organizer !== input.organizer) throw new Error("データ提供元の主催者範囲が取込対象と一致しません。");
  if (source.deliveryMethod !== input.deliveryMethod) throw new Error("契約で許諾された提供形式と取込形式が一致しません。");
  return source;
}

export async function requireAuthorizedDataSource(
  input: { sourceKey: string; organizer: AuthorizedOrganizer; deliveryMethod: AuthorizedDeliveryMethod },
) {
  const db = await getDb();
  if (!db) throw new Error("DB接続エラー");
  const [source] = await db.select().from(authorizedDataSources)
    .where(eq(authorizedDataSources.sourceKey, input.sourceKey))
    .limit(1);
  if (!source) throw new Error("未登録のデータ提供元です。契約・許諾根拠を登録した提供元だけを使用してください。");
  return { db, source: validateAuthorizedDataSource(source, input) };
}

export function sha256(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

export async function writeDataImportAudit(input: {
  source: Pick<AuthorizedDataSource, "id" | "sourceKey" | "organizer">;
  kind: AuthorizedImportKind;
  content: string;
  fileName?: string;
  rowCount: number;
  status: "accepted" | "rejected" | "failed";
  reason?: string;
  importedByOpenId?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB接続エラー");
  await db.insert(dataImportAudits).values({
    sourceId: input.source.id,
    sourceKey: input.source.sourceKey,
    organizer: input.source.organizer,
    importKind: input.kind,
    fileName: input.fileName?.trim() || null,
    fileSha256: sha256(input.content),
    rowCount: input.rowCount,
    status: input.status,
    reason: input.reason?.slice(0, 512) || null,
    importedByOpenId: input.importedByOpenId ?? null,
  });
}

import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";

/** アクセスパスのクッキー名とヘッダー名。フロントエンドからも同じ値を使う。 */
export const ACCESS_PASS_COOKIE = "keiba_access_key";
export const ACCESS_PASS_HEADER = "x-access-key";

/** 販売するアクセスパスの定義（期限付き・アカウント登録不要）。 */
export const ACCESS_PASS_PLANS = {
  day: { label: "1日パス", days: 1, amount: 480 },
  month: { label: "30日パス", days: 30, amount: 1980 },
} as const;

export type AccessPassPlan = keyof typeof ACCESS_PASS_PLANS;

export function isAccessPassPlan(value: string): value is AccessPassPlan {
  return Object.prototype.hasOwnProperty.call(ACCESS_PASS_PLANS, value);
}

/** ユーザーへ提示するキー。DBにはハッシュのみ保存する。 */
export function generateAccessKey(): string {
  return formatAccessKey(randomBytes(24).toString("base64url"));
}

/** 文字列を KG- 形式のキーへ整形する。 */
function formatAccessKey(source: string): string {
  const body = source.toUpperCase().replace(/[^0-9A-Z]/g, "").padEnd(20, "0").slice(0, 20);
  return `KG-${body.slice(0, 5)}-${body.slice(5, 10)}-${body.slice(10, 15)}-${body.slice(15, 20)}`;
}

/**
 * 決済セッションから決定論的にキーを導出する。Webhookと購入完了画面の双方が
 * 同じキーを再現できるため、二重発行なしに購入者へ再表示できる。
 */
export function deriveAccessKeyForPayment(secret: string, provider: string, providerRef: string): string {
  const digest = createHmac("sha256", secret).update(`access_pass:${provider}:${providerRef}`).digest("base64url");
  return formatAccessKey(digest);
}

export function hashAccessKey(key: string): string {
  return createHash("sha256").update(normalizeAccessKey(key)).digest("hex");
}

/** 入力ゆれ（小文字・空白・ハイフン欠落）を吸収する。 */
export function normalizeAccessKey(key: string): string {
  const compact = key.trim().toUpperCase().replace(/[\s\u3000]/g, "").replace(/-/g, "");
  if (!compact.startsWith("KG")) return compact;
  const body = compact.slice(2);
  const groups = body.match(/.{1,5}/g) ?? [];
  return `KG-${groups.join("-")}`;
}

export function accessKeysMatch(left: string, right: string): boolean {
  const leftHash = Buffer.from(hashAccessKey(left), "hex");
  const rightHash = Buffer.from(hashAccessKey(right), "hex");
  return leftHash.length === rightHash.length && timingSafeEqual(leftHash, rightHash);
}

export function expiresAtFor(plan: AccessPassPlan, from: Date = new Date()): Date {
  return new Date(from.getTime() + ACCESS_PASS_PLANS[plan].days * 24 * 60 * 60 * 1000);
}

export type AccessPassRecord = {
  expiresAt: Date;
  revokedAt: Date | null;
};

/** 失効・期限切れを弾く。日時比較のみで判定し、値の推測はしない。 */
export function isAccessPassValid(pass: AccessPassRecord | null | undefined, now: Date = new Date()): boolean {
  if (!pass) return false;
  if (pass.revokedAt !== null && pass.revokedAt <= now) return false;
  return pass.expiresAt > now;
}

/** リクエストからアクセスキーを読む。クッキー → ヘッダー → クエリの順。 */
export function readAccessKeyFromRequest(req: Request): string | null {
  const cookies = req.headers.cookie ? parseCookieHeader(req.headers.cookie) : {};
  const fromCookie = cookies[ACCESS_PASS_COOKIE];
  if (typeof fromCookie === "string" && fromCookie.trim() !== "") return fromCookie;

  const fromHeader = req.headers[ACCESS_PASS_HEADER];
  if (typeof fromHeader === "string" && fromHeader.trim() !== "") return fromHeader;

  const fromQuery = req.query?.["key"];
  if (typeof fromQuery === "string" && fromQuery.trim() !== "") return fromQuery;

  return null;
}

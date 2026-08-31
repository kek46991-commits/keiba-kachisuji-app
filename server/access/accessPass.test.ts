import { describe, expect, it } from "vitest";
import {
  accessKeysMatch,
  deriveAccessKeyForPayment,
  expiresAtFor,
  generateAccessKey,
  hashAccessKey,
  isAccessPassValid,
  normalizeAccessKey,
} from "./accessPass";

describe("accessPass", () => {
  it("生成キーは KG- 形式で毎回異なる", () => {
    const first = generateAccessKey();
    const second = generateAccessKey();
    expect(first).toMatch(/^KG-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(first).not.toBe(second);
  });

  it("小文字・空白・ハイフン欠落を同一キーとして扱う", () => {
    const key = generateAccessKey();
    const messy = ` ${key.replace(/-/g, "").toLowerCase()} `;
    expect(normalizeAccessKey(messy)).toBe(key);
    expect(hashAccessKey(messy)).toBe(hashAccessKey(key));
    expect(accessKeysMatch(messy, key)).toBe(true);
  });

  it("別のキーは一致しない", () => {
    expect(accessKeysMatch(generateAccessKey(), generateAccessKey())).toBe(false);
  });

  it("期限内かつ未失効のみ有効", () => {
    const now = new Date("2026-08-22T12:00:00+09:00");
    expect(isAccessPassValid({ expiresAt: new Date(now.getTime() + 1000), revokedAt: null }, now)).toBe(true);
    expect(isAccessPassValid({ expiresAt: new Date(now.getTime() - 1000), revokedAt: null }, now)).toBe(false);
    expect(isAccessPassValid({ expiresAt: new Date(now.getTime() + 1000), revokedAt: now }, now)).toBe(false);
    expect(isAccessPassValid(null, now)).toBe(false);
  });

  it("同一決済からは常に同じキーを導出する（Webhookとクレームの冪等化）", () => {
    const first = deriveAccessKeyForPayment("secret", "stripe", "cs_test_1");
    expect(deriveAccessKeyForPayment("secret", "stripe", "cs_test_1")).toBe(first);
    expect(deriveAccessKeyForPayment("secret", "stripe", "cs_test_2")).not.toBe(first);
    expect(first).toMatch(/^KG-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  });

  it("プラン日数から期限を算出する", () => {
    const from = new Date("2026-08-22T00:00:00Z");
    expect(expiresAtFor("day", from).toISOString()).toBe("2026-08-23T00:00:00.000Z");
    expect(expiresAtFor("month", from).toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

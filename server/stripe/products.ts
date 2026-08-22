// Stripe商品・価格定義
export const PRODUCTS = {
  premium: {
    name: "競馬でGO！プレミアムプラン",
    description: "AI解析機能・予想閲覧が無制限で利用可能。月額1,980円（初回10日間無料）",
    priceAmount: 1980, // 円
    currency: "jpy",
    interval: "month" as const,
    trialDays: 10,
  },
};

// 支払い方法（カードのみ）
// PayPay: Stripeサブスクリプションモード非対応
// コンビニ決済: 競馬予想サービスは禁止業種（ギャンブルの戦略）に該当
export const PAYMENT_METHODS = ["card"] as const;

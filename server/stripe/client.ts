import Stripe from "stripe";
import { ENV } from "../_core/env";

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return ENV.stripeSecretKey.length > 0;
}

export function getStripe(): Stripe {
  if (!isStripeConfigured()) {
    throw new Error("決済機能が未設定です。STRIPE_SECRET_KEY を設定してください。");
  }
  if (!client) {
    client = new Stripe(ENV.stripeSecretKey);
  }
  return client;
}

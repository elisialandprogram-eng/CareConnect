import Stripe from "stripe";

let cachedStripe: Stripe | null = null;
let cachedKey: string | undefined;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    cachedStripe = null;
    cachedKey = undefined;
    return null;
  }
  if (cachedStripe && cachedKey === key) {
    return cachedStripe;
  }
  cachedStripe = new Stripe(key, {
    apiVersion: "2024-06-20" as any,
  });
  cachedKey = key;
  return cachedStripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripeMode(): "live" | "test" | "unknown" {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

export function getWebhookSecret(): string | undefined {
  return process.env.STRIPE_WEBHOOK_SECRET;
}

interface CheckoutParams {
  appointmentId: string;
  amount: number; // in dollars
  currency?: string;
  description: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(
  params: CheckoutParams,
): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error("Stripe is not configured");
  }
  const currency = (params.currency || "usd").toLowerCase();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: params.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: Math.round(params.amount * 100),
          product_data: {
            name: params.description,
          },
        },
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      appointmentId: params.appointmentId,
      ...(params.metadata || {}),
    },
  });
  if (!session.url) {
    throw new Error("Stripe did not return a checkout URL");
  }
  return { url: session.url, sessionId: session.id };
}

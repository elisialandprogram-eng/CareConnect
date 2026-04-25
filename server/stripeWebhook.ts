import type { Request, Response } from "express";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "./stripe";
import { storage } from "./storage";

export async function handleStripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  if (!stripe) {
    return res.status(503).json({ error: "Stripe not configured" });
  }

  const sigHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
  const webhookSecret = getWebhookSecret();

  let event: Stripe.Event;
  try {
    if (webhookSecret && signature) {
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        signature,
        webhookSecret,
      );
    } else {
      // No webhook secret configured: parse but warn loudly. Useful in dev.
      console.warn(
        "[stripe webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (DEV ONLY)",
      );
      const raw = (req.body as Buffer).toString("utf8");
      event = JSON.parse(raw) as Stripe.Event;
    }
  } catch (err: any) {
    console.error("[stripe webhook] signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const appointmentId = session.metadata?.appointmentId;
        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id;

        if (appointmentId) {
          const existing = await storage.getPaymentByAppointment(appointmentId);
          if (existing) {
            await storage.updatePayment(existing.id, {
              status: "completed",
              stripeSessionId: session.id,
              stripePaymentId: paymentIntentId || null,
            });
          }
          await storage.updateAppointment(appointmentId, {
            status: "confirmed",
          });
          console.log(
            `[stripe webhook] payment completed for appointment ${appointmentId}`,
          );
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const appointmentId = session.metadata?.appointmentId;
        if (appointmentId) {
          const existing = await storage.getPaymentByAppointment(appointmentId);
          if (existing) {
            await storage.updatePayment(existing.id, {
              status: "failed",
              stripeSessionId: session.id,
            });
          }
          console.log(
            `[stripe webhook] payment failed/expired for appointment ${appointmentId}`,
          );
        }
        break;
      }
      default:
        // ignore other event types
        break;
    }
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error("[stripe webhook] handler error:", err);
    res.status(500).json({ error: err.message });
  }
}

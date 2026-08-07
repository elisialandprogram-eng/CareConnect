/**
 * Webhook routes
 * Routes: 1 | Owner: payments | Auth: Stripe signature | Country isolation: N/A
 * Financial impact: YES — activates user packages on payment completion
 *
 * POST /api/webhooks/package-payment
 *
 * Note: The main Stripe webhook (POST /api/stripe/webhook) is registered in
 * server/index.ts via stripeWebhook.ts and is NOT part of this file.
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import { getStripe } from "../stripe";
import { notify } from "../services/notification-dispatcher";
import { formatLocal } from "../services/currency";

export function registerWebhookRoutes(app: Express): void {

  // ── POST /api/webhooks/package-payment ──────────────────────────────────
  // Stripe webhook: activates a user_package row when the checkout session
  // completes with metadata.type = "package_purchase".
  app.post("/api/webhooks/package-payment", async (req: any, res: Response) => {
    const stripe = getStripe();
    if (!stripe) return res.status(503).send("Stripe not configured");
    const sig = req.headers["stripe-signature"] as string;
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET || ""
      );
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as any;
        if (
          session.metadata?.type === "package_purchase" &&
          session.metadata?.userPackageId
        ) {
          await storage.activateUserPackage(session.metadata.userPackageId);
          // Notify the user that their package is now active (fire-and-forget)
          try {
            const up = await storage.getUserPackage(session.metadata.userPackageId);
            if (up) {
              const pkg = await storage.getPackage(up.packageId);
              const amountUSD = Number(up.pricePaid ?? 0);
              notify.packagePurchased(up.userId, {
                packageName: pkg?.name ?? "Package",
                formattedAmount: formatLocal(amountUSD, "USD"),
                sessionsIncluded: typeof (pkg as any)?.sessionsIncluded === "number"
                  ? (pkg as any).sessionsIncluded : undefined,
              }).catch(() => {});
            }
          } catch {}
        }
      }
      return res.json({ received: true });
    } catch (e: any) {
      return res.status(400).send(`Webhook error: ${e.message}`);
    }
  });
}

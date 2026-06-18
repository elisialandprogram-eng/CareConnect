import type { Request, Response } from "express";
import type Stripe from "stripe";
import { getStripe, getWebhookSecret } from "./stripe";
import { storage } from "./storage";
import { logWebhook, logPayment } from "./lib/logger";
import { logSystemEvent } from "./middleware/monitoring";
import { db } from "./db";
import { payments } from "@shared/schema";

// ── Idempotency guard (two-layer) ────────────────────────────────────────
// Stripe can deliver the same event more than once.  We use two layers:
//
//   Layer 1 — in-process LRU ring buffer (last 500 IDs, zero DB round-trip)
//             Fast path; resets on restart.  Evicts oldest entry when full.
//
//   Layer 2 — DB-backed via the existing idempotency_keys table
//             (scope = 'stripe_webhook', expires_at = NOW() + 72 h)
//             Survives restarts and is multi-instance safe.
//             Cleanup: pruneOldData() cron deletes rows WHERE expires_at < NOW().
//
// On DB error the check degrades gracefully to Layer 1 only for that session.
const PROCESSED_EVENT_IDS = new Set<string>();
const PROCESSED_EVENT_ORDER: string[] = [];
const MAX_IDEMPOTENCY_CACHE = 500;

/**
 * Attempt to claim this event ID as "mine to process".
 * Returns true  → event successfully claimed; caller should process it.
 * Returns false → duplicate event; caller should skip it.
 */
async function claimWebhookEvent(eventId: string): Promise<boolean> {
  // Layer 1: fast in-process check — no DB round-trip
  if (PROCESSED_EVENT_IDS.has(eventId)) return false;

  // Layer 2: persistent DB claim via idempotency_keys
  try {
    const { pool } = await import("./db");
    const result = await pool.query(
      `INSERT INTO idempotency_keys (key, scope, expires_at, status)
       VALUES ($1, 'stripe_webhook', NOW() + INTERVAL '72 hours', 200)
       ON CONFLICT (key, scope) DO NOTHING`,
      [eventId],
    );
    if ((result.rowCount ?? 0) === 0) return false; // conflict → already processed
  } catch (dbErr: any) {
    // DB unavailable: degrade gracefully — in-process cache only for this session
    console.warn("[stripe webhook] DB idempotency degraded (in-process only):", dbErr.message);
  }

  // Claim successful — cache in ring buffer to skip DB on subsequent in-session retries
  PROCESSED_EVENT_IDS.add(eventId);
  PROCESSED_EVENT_ORDER.push(eventId);
  if (PROCESSED_EVENT_ORDER.length > MAX_IDEMPOTENCY_CACHE) {
    const evicted = PROCESSED_EVENT_ORDER.shift()!;
    PROCESSED_EVENT_IDS.delete(evicted);
  }
  return true;
}

// ── Webhook metrics (in-process, resets on restart) ───────────────────────
interface WebhookMetrics {
  received: number;
  processed: number;
  failed: number;
  duplicates: number;
  lastEventAt: string | null;
  lastFailureAt: string | null;
  lastFailureType: string | null;
  totalDurationMs: number;
  eventTypeCounts: Record<string, number>;
}

const _metrics: WebhookMetrics = {
  received: 0,
  processed: 0,
  failed: 0,
  duplicates: 0,
  lastEventAt: null,
  lastFailureAt: null,
  lastFailureType: null,
  totalDurationMs: 0,
  eventTypeCounts: {},
};

/** Read-only snapshot of Stripe webhook metrics for the diagnostics endpoint. */
export function getWebhookMetrics(): Readonly<WebhookMetrics> {
  return { ..._metrics, eventTypeCounts: { ..._metrics.eventTypeCounts } };
}

export async function handleStripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  if (!stripe) {
    logWebhook({ vendor: "stripe", eventType: "unknown", status: "failed", error: "Stripe not configured" });
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
      console.warn(
        "[stripe webhook] STRIPE_WEBHOOK_SECRET not set — skipping signature verification (DEV ONLY)",
      );
      const raw = (req.body as Buffer).toString("utf8");
      event = JSON.parse(raw) as Stripe.Event;
    }
  } catch (err: any) {
    _metrics.failed++;
    _metrics.lastFailureAt = new Date().toISOString();
    _metrics.lastFailureType = "signature_verification";
    logWebhook({ vendor: "stripe", eventType: "unknown", status: "failed", error: err.message });
    logSystemEvent("webhook:signature_failed", "error", "stripe_webhook", `Stripe signature verification failed: ${err.message}`, { error: err.message }).catch(() => {});
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  const handlerStart = Date.now();
  _metrics.received++;
  _metrics.lastEventAt = new Date().toISOString();
  _metrics.eventTypeCounts[event.type] = (_metrics.eventTypeCounts[event.type] ?? 0) + 1;

  // Duplicate event detection (two-layer: in-process ring buffer + DB idempotency_keys)
  const claimed = await claimWebhookEvent(event.id);
  if (!claimed) {
    _metrics.duplicates++;
    logWebhook({ vendor: "stripe", eventType: event.type, eventId: event.id, status: "duplicate" });
    return res.status(200).json({ received: true, duplicate: true });
  }

  logWebhook({ vendor: "stripe", eventType: event.type, eventId: event.id, status: "received" });

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

        if (session.metadata?.type === "wallet_topup") {
          const walletUserId = session.metadata.walletUserId;
          const amountFromMeta = Number(session.metadata.amount);
          const amountFromStripe =
            typeof session.amount_total === "number"
              ? session.amount_total / 100
              : NaN;
          const creditAmount = Number.isFinite(amountFromStripe) && amountFromStripe > 0
            ? amountFromStripe
            : amountFromMeta;

          if (walletUserId && Number.isFinite(creditAmount) && creditAmount > 0) {
            try {
              const result = await storage.topUpWallet(walletUserId, creditAmount, {
                description: `Stripe top-up (${session.id})`,
                referenceType: "stripe_session",
                referenceId: session.id,
                idempotencyKey: `stripe:${session.id}`,
              });
              logPayment({ event: "wallet_delta", userId: walletUserId, amountUsd: creditAmount });
              console.log(
                `[stripe webhook] wallet credited: user=${walletUserId} amount=${creditAmount} tx=${result.transaction.id}`,
              );
              // Bridge: write a tracking record into the global payments ledger
              try {
                await db.insert(payments).values({
                  patientId: walletUserId,
                  amount: String(creditAmount),
                  currency: "USD",
                  paymentMethod: "stripe_wallet_topup",
                  status: "completed",
                  stripeSessionId: session.id,
                  stripePaymentId: paymentIntentId || null,
                } as any).onConflictDoNothing();
                console.log(`[stripe webhook] payments ledger bridge written for topup ${session.id}`);
              } catch (bridgeErr) {
                console.warn("[stripe webhook] payments ledger bridge failed (non-fatal):", (bridgeErr as Error).message);
              }
            } catch (err) {
              logPayment({ event: "wallet_delta", userId: walletUserId, amountUsd: creditAmount, error: String((err as Error).message) });
              console.error("[stripe webhook] wallet credit failed:", err);
            }
          } else {
            console.warn(
              "[stripe webhook] wallet_topup session missing user or amount:",
              session.id,
            );
          }
          break;
        }

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
          logPayment({ event: "charge_completed", appointmentId });
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
      case "charge.dispute.created": {
        // A chargeback was opened. Mark the related payment as disputed,
        // log a system event, and alert admins so they can respond within
        // Stripe's response window (typically 7–21 days).
        const dispute = event.data.object as Stripe.Dispute;
        const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge?.id;
        try {
          const { pool: _pool } = await import("./db");
          // Resolve payment_intent from the charge
          let paymentIntentId: string | null = null;
          if (chargeId) {
            const chargeRow = await _pool.query(
              `SELECT stripe_payment_id FROM payments WHERE stripe_charge_id = $1 LIMIT 1`,
              [chargeId],
            ).catch(() => ({ rows: [] as any[] }));
            if (!chargeRow.rows[0]) {
              // Fallback: look up by dispute's payment_intent metadata if available
              paymentIntentId = typeof dispute.payment_intent === "string"
                ? dispute.payment_intent
                : dispute.payment_intent?.id ?? null;
            }
          } else {
            paymentIntentId = typeof dispute.payment_intent === "string"
              ? dispute.payment_intent
              : dispute.payment_intent?.id ?? null;
          }

          if (paymentIntentId) {
            await _pool.query(
              `UPDATE payments SET status = 'disputed' WHERE stripe_payment_id = $1`,
              [paymentIntentId],
            ).catch(() => {});
          }

          logPayment({
            event: "refund_failed",
            amountUsd: dispute.amount / 100,
            error: `Chargeback opened — dispute reason: ${dispute.reason}`,
          });
          await logSystemEvent(
            "payment_failure",
            "error",
            "stripe_webhook",
            `Chargeback opened: dispute=${dispute.id} amount=${dispute.amount / 100} reason=${dispute.reason}`,
            { disputeId: dispute.id, chargeId, amount: dispute.amount / 100, reason: dispute.reason },
          ).catch(() => {});

          console.warn(
            `[stripe webhook] CHARGEBACK: dispute=${dispute.id} amount=$${dispute.amount / 100} reason=${dispute.reason}`,
          );
        } catch (err) {
          console.error("[stripe webhook] chargeback handler error:", err);
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object as Stripe.Charge;
        const paymentIntentId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (paymentIntentId) {
          try {
            const rows = await import("./db").then(m =>
              m.pool.query(
                `SELECT id FROM payments WHERE stripe_payment_id = $1 LIMIT 1`,
                [paymentIntentId],
              ),
            );
            const paymentId = rows.rows[0]?.id;
            if (paymentId) {
              const totalRefunded = charge.amount_refunded / 100;
              const latestRefundId = charge.refunds?.data?.[0]?.id ?? null;
              await import("./db").then(m =>
                m.pool.query(
                  `UPDATE payments
                   SET refunded_amount = $1,
                       stripe_refund_id = COALESCE(stripe_refund_id, $2)
                   WHERE id = $3`,
                  [totalRefunded, latestRefundId, paymentId],
                ),
              );
              logPayment({ event: "refund_issued", amountUsd: totalRefunded });
              console.log(
                `[stripe webhook] charge.refunded synced: payment=${paymentId} totalRefunded=${totalRefunded}`,
              );
            }
          } catch (err) {
            logPayment({ event: "refund_failed", error: String((err as Error).message) });
            console.error("[stripe webhook] charge.refunded sync failed:", err);
          }
        }
        break;
      }
      default:
        break;
    }

    const durationMs = Date.now() - handlerStart;
    _metrics.processed++;
    _metrics.totalDurationMs += durationMs;
    logWebhook({ vendor: "stripe", eventType: event.type, eventId: event.id, status: "processed", durationMs });

    res.status(200).json({ received: true });
  } catch (err: any) {
    const durationMs = Date.now() - handlerStart;
    _metrics.failed++;
    _metrics.lastFailureAt = new Date().toISOString();
    _metrics.lastFailureType = event.type;
    logWebhook({ vendor: "stripe", eventType: event.type, eventId: event.id, status: "failed", durationMs, error: err.message });
    logSystemEvent("webhook:handler_error", "error", "stripe_webhook", `Stripe webhook handler threw: ${err.message}`, { eventType: event.type, eventId: event.id, error: err.message }).catch(() => {});
    console.error("[stripe webhook] handler error:", err);
    res.status(500).json({ error: err.message });
  }
}

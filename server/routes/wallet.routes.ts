/**
 * Wallet routes (patient-facing)
 * Routes: 4 | Owner: payments | Auth: required | Country isolation: via currency
 * Financial impact: YES — wallet top-up and appointment payment
 *
 * GET  /api/wallet
 * GET  /api/wallet/transactions
 * POST /api/wallet/topup
 * POST /api/wallet/pay-appointment
 */

import type { Express, Response } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { paymentLimiter } from "../middleware/rateLimiter";
import { getRates, toUSDSync } from "../services/currency";
import { isStripeConfigured, createCheckoutSession } from "../stripe";
import { type CountryCode, countryCurrency } from "../middleware/country";
import { authenticateToken, type AuthRequest } from "../middleware/auth";
import { round2, roundToCents } from "../lib/math";
import { applyWalletAllocation } from "../services/payment.service";

export function registerWalletRoutes(app: Express): void {

  // ── GET /api/wallet ─────────────────────────────────────────────────────
  app.get("/api/wallet", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const wallet = await storage.getOrCreateWallet(req.user.id);
      res.json(wallet);
    } catch (error: any) {
      console.error("Get wallet error:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // ── GET /api/wallet/transactions ────────────────────────────────────────
  app.get("/api/wallet/transactions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
      const txs = await storage.getWalletTransactions(req.user.id, limit);
      res.json(txs);
    } catch (error: any) {
      console.error("Get wallet transactions error:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // ── POST /api/wallet/topup ──────────────────────────────────────────────
  // Starts a Stripe Checkout session. On success the webhook credits the wallet.
  app.post("/api/wallet/topup", authenticateToken, paymentLimiter, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }
      if (amount > 1_000_000) {
        return res.status(400).json({ message: "Amount exceeds maximum allowed top-up" });
      }
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Online top-up is not available right now. Please contact support." });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const wallet = await storage.getOrCreateWallet(req.user.id);
      const origin = (req.headers.origin as string) || `${req.protocol}://${req.get("host")}`;
      // Allow callers (e.g. booking canvas) to provide a custom return path so
      // Stripe redirects back to the originating page instead of /wallet.
      const rawReturnPath: string = typeof req.body?.returnPath === "string" ? req.body.returnPath : "/wallet";
      // Strip any existing topup query param before appending ours
      const cleanReturnPath = rawReturnPath.replace(/[?&]topup=[^&]*/g, "").replace(/\?$/, "");
      const sep = cleanReturnPath.includes("?") ? "&" : "?";
      const successUrl = `${origin}${cleanReturnPath}${sep}topup=success`;
      const cancelUrl  = `${origin}${cleanReturnPath}${sep}topup=cancelled`;
      const session = await createCheckoutSession({
        appointmentId: `wallet:${wallet.id}`,
        amount: round2(amount),
        currency: "usd",
        description: `Wallet top-up (${round2(amount)} USD)`,
        customerEmail: user.email,
        successUrl,
        cancelUrl,
        metadata: {
          type: "wallet_topup",
          walletUserId: req.user.id,
          walletId: wallet.id,
          amount: String(round2(amount)),
        },
      });
      res.json({ url: session.url, sessionId: session.sessionId });
    } catch (error: any) {
      console.error("Wallet topup error:", error);
      res.status(500).json({ message: error?.message || "Failed to start top-up" });
    }
  });

  // ── POST /api/wallet/pay-appointment ───────────────────────────────────
  // Atomic: records a wallet allocation in the canonical payment aggregate
  // and confirms the appointment without writing a second payment authority.
  app.post("/api/wallet/pay-appointment", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const appointmentId = String(req.body?.appointmentId || "");
      if (!appointmentId) return res.status(400).json({ message: "appointmentId is required" });

      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      if (appointment.patientId !== req.user.id) {
        return res.status(403).json({ message: "You can only pay for your own appointments" });
      }
      if (appointment.status === "cancelled" || appointment.status === "rejected") {
        return res.status(400).json({ message: "This appointment cannot be paid for" });
      }

       const existingPayment = await storage.getPaymentByAppointment(appointmentId);
       if (!existingPayment) {
         return res.status(409).json({ message: "Appointment has no canonical payment aggregate" });
       }
       if (existingPayment.status === "paid") {
        return res.status(400).json({ message: "This appointment is already paid" });
      }

       const amount = Number((existingPayment as any).remainingAmountUsd ?? (existingPayment as any).amount);
       if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Invalid appointment amount" });
      }

       const allocationResult = await applyWalletAllocation({
         paymentId: existingPayment.id,
         userId: req.user.id,
         amountUsd: amount,
         idempotencyKey: `appointment:${appointmentId}:wallet-standalone`,
         description: `Payment for appointment ${appointmentId}`,
       });

      const existingAppt = await storage.getAppointment(appointmentId);
      const transition = await storage.transitionAppointment(
        appointmentId,
        { status: "confirmed" } as any,
        {
          action: "confirm" as any,
          actorUserId: req.user.id,
          actorRole: (req.user.role ?? "patient") as any,
          fromStatus: (existingAppt?.status ?? null) as any,
          toStatus: "confirmed" as any,
          reason: "Paid via wallet",
        },
        { allowNoop: true },
      );
      if (!transition.ok) {
        return res.status(transition.status).json({ message: transition.message || "Unable to confirm appointment" });
      }

       res.json({
         ok: true,
         wallet: await storage.getOrCreateWallet(req.user.id),
         transaction: allocationResult.transaction,
       });
    } catch (error: any) {
      console.error("Wallet pay-appointment error:", error);
      const msg = error?.message || "Payment failed";
      const code = msg.includes("Insufficient") ? 402 : 500;
      res.status(code).json({ message: msg });
    }
  });
}

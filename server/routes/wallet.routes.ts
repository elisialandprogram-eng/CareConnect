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
      const session = await createCheckoutSession({
        appointmentId: `wallet:${wallet.id}`,
        amount: round2(amount),
        currency: "usd",
        description: `Wallet top-up (${round2(amount)} USD)`,
        customerEmail: user.email,
        successUrl: `${origin}/wallet?topup=success`,
        cancelUrl: `${origin}/wallet?topup=cancelled`,
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
  // Atomic: debits wallet, marks payment completed, confirms appointment.
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
      if (existingPayment && existingPayment.status === "completed") {
        return res.status(400).json({ message: "This appointment is already paid" });
      }

      const amountLocal = Number(appointment.totalAmount);
      if (!Number.isFinite(amountLocal) || amountLocal <= 0) {
        return res.status(400).json({ message: "Invalid appointment amount" });
      }

      const _wpRates = await getRates();
      const _wpSrcCurrency = countryCurrency((appointment as any).countryCode as CountryCode | undefined);
      const amount = toUSDSync(amountLocal, _wpSrcCurrency, _wpRates);

      const wallet = await storage.getOrCreateWallet(req.user.id);
      if (Number(wallet.balance) + 1e-6 < amount) {
        return res.status(402).json({
          message: "Insufficient wallet balance",
          balance: Number(wallet.balance),
          required: amount,
        });
      }

      const idempotencyKey = `appointment:${appointmentId}`;
      const { wallet: updatedWallet, transaction } = await storage.debitWallet(
        req.user.id,
        amount,
        {
          description: `Payment for appointment ${appointmentId}`,
          referenceType: "appointment",
          referenceId: appointmentId,
          idempotencyKey,
        },
      );

      // Bridge wallet debit into the double-entry marketplace ledger.
      const _ledgerCountry = ((appointment as any).countryCode as string) ?? "HU";
      const _ledgerCurrency = countryCurrency(_ledgerCountry as CountryCode);
      pool.query(
        `INSERT INTO marketplace_ledger
           (appointment_id, source_account, destination_account, amount_cents,
            transaction_type, status, currency_iso, country_code)
         VALUES ($1, 'CLIENT_FUNDING', 'PLATFORM_ESCROW', $2, 'ESCROW_HOLD', 'PENDING', $3, $4)`,
        [appointmentId, roundToCents(amount), _ledgerCurrency, _ledgerCountry],
      ).catch((e: Error) =>
        console.warn("[ledger] wallet pay-appointment insert failed:", e.message)
      );

      if (existingPayment) {
        await storage.updatePayment(existingPayment.id, {
          status: "completed",
          paymentMethod: "wallet",
        });
      } else {
        const apptForCurrency = await storage.getAppointment(appointmentId);
        const _wRates = await getRates();
        const _wSrcCurrency = countryCurrency(apptForCurrency?.countryCode as CountryCode | undefined);
        const _wRateVal = _wRates[_wSrcCurrency] ?? 1;
        const _wAmtUSD = toUSDSync(amount, _wSrcCurrency, _wRates);
        await storage.createPayment({
          appointmentId,
          patientId: req.user.id,
          amount: Math.round(_wAmtUSD * 100) / 100,
          currency: "USD",
          paymentMethod: "wallet",
          status: "completed",
          displayCurrency: _wSrcCurrency,
          displayAmount: Math.round(amount * 100) / 100,
          exchangeRateUsed: parseFloat((1 / _wRateVal).toFixed(6)).toString(),
        } as any);
      }

      const existingAppt = await storage.getAppointment(appointmentId);
      await storage.updateAppointmentWithEvent(
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
      );

      res.json({ ok: true, wallet: updatedWallet, transaction });
    } catch (error: any) {
      console.error("Wallet pay-appointment error:", error);
      const msg = error?.message || "Payment failed";
      const code = msg.includes("Insufficient") ? 402 : 500;
      res.status(code).json({ message: msg });
    }
  });
}

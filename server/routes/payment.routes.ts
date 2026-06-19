/**
 * Payment/Gift-card routes — extracted from server/routes.ts
 *
 * Covers: gift card purchase, balance check, redeem, own cards listing.
 */

import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { pool } from "../db";
import { z } from "zod";
import {
  authenticateToken,
  AuthRequest,
} from "../middleware/auth";
import { giftCardLimiter } from "../middleware/rateLimiter";
import { sendAppointmentEmail } from "./shared/helpers";
import { formatLocal } from "../services/currency";

function generateGiftCardCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 16 }, (_, i) =>
    (i > 0 && i % 4 === 0 ? "-" : "") + chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export function registerPaymentRoutes(app: Express): void {

  // ── Gift Cards ────────────────────────────────────────────────────────────
  app.post("/api/gift-cards/purchase", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const schema = z.object({
        amount: z.number().positive().max(1000),
        recipientEmail: z.string().email().optional(),
        currency: z.string().default("USD"),
      });
      const { amount, recipientEmail, currency } = schema.parse(req.body);
      const code = generateGiftCardCode();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      const result = await pool.query(
        `INSERT INTO gift_cards (code, purchaser_user_id, recipient_email, initial_amount, balance, currency, expires_at)
         VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING *`,
        [code, req.user!.id, recipientEmail || null, amount, currency, expiresAt],
      );
      const card = result.rows[0];
      if (recipientEmail) {
        await sendAppointmentEmail({
          to: recipientEmail,
          subject: "You received a GoldenLife gift card!",
          heading: "You have a gift card",
          intro: "Someone sent you a gift card for healthcare services on GoldenLife.",
          details: [
            { label: "Gift card code", value: card.code },
            { label: "Value", value: formatLocal(amount, currency) },
            { label: "Valid until", value: expiresAt.toISOString().slice(0, 10) },
          ],
          cta: "Use this code at checkout when booking any service.",
        });
      }
      res.status(201).json(card);
    } catch (e: any) {
      if (e?.name === "ZodError") return res.status(400).json({ message: "Invalid input" });
      res.status(500).json({ message: "Failed to purchase gift card" });
    }
  });

  app.get("/api/gift-cards/mine", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT * FROM gift_cards WHERE purchaser_user_id = $1 ORDER BY created_at DESC`,
        [req.user!.id],
      );
      res.json(result.rows);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.get("/api/gift-cards/:code", authenticateToken, giftCardLimiter, async (req: AuthRequest, res: Response) => {
    try {
      const result = await pool.query(
        `SELECT code, balance, currency, is_active, expires_at, redeemed_at FROM gift_cards WHERE code = $1`,
        [req.params.code.toUpperCase()],
      );
      if (!result.rows[0]) return res.status(404).json({ message: "Gift card not found" });
      res.json(result.rows[0]);
    } catch (e) { res.status(500).json({ message: "Failed" }); }
  });

  app.post("/api/gift-cards/redeem", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: "code is required" });

      const result = await pool.query(
        `SELECT * FROM gift_cards WHERE code = $1 FOR UPDATE`,
        [code.toUpperCase()],
      );
      const card = result.rows[0];
      if (!card) return res.status(404).json({ message: "Gift card not found" });
      if (!card.is_active) return res.status(400).json({ message: "This gift card has already been used" });
      if (Number(card.balance) <= 0) return res.status(400).json({ message: "Gift card has no remaining balance" });
      if (card.expires_at && new Date(card.expires_at) < new Date()) {
        return res.status(400).json({ message: "This gift card has expired" });
      }

      const amount = Number(card.balance);

      // Deactivate the gift card FIRST (within the FOR UPDATE lock scope).
      // If the subsequent wallet top-up fails, the card is already spent — but
      // the idempotencyKey ensures a retry will correctly credit the wallet
      // without double-spending. This ordering prevents the worse failure mode
      // where the wallet is credited but the card remains active.
      const deactivated = await pool.query(
        `UPDATE gift_cards SET balance = 0, is_active = false, redeemed_by_user_id = $1, redeemed_at = NOW()
         WHERE code = $2 AND is_active = true RETURNING id`,
        [req.user!.id, code.toUpperCase()],
      );
      if (!deactivated.rows[0]) {
        // Another concurrent request beat us to it despite the FOR UPDATE lock
        return res.status(400).json({ message: "This gift card has already been used" });
      }

      const { wallet: updatedWallet } = await storage.topUpWallet(req.user!.id, amount, {
        description: `Gift card redeemed — ${card.code}`,
        referenceType: "gift_card",
        referenceId: card.id,
        idempotencyKey: `gift-card:${card.id}:redeem`,
      });

      res.json({ ok: true, amount, newWalletBalance: Number(updatedWallet.balance) });
    } catch (e: any) {
      console.error("[gift-card/redeem]", e?.message);
      res.status(500).json({ message: "Failed to redeem gift card" });
    }
  });

  // ── Admin: Gift Card Management ───────────────────────────────────────────
  app.get("/api/admin/gift-cards", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!req.user || !["admin", "global_admin", "country_admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const { rows } = await pool.query(
        `SELECT gc.*, u.email AS purchaser_email, r.email AS redeemer_email
           FROM gift_cards gc
           LEFT JOIN users u ON u.id = gc.purchaser_user_id
           LEFT JOIN users r ON r.id = gc.redeemed_by_user_id
          ORDER BY gc.created_at DESC
          LIMIT 200`,
      );
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/gift-cards/:id/deactivate", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!req.user || !["admin", "global_admin", "country_admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE gift_cards SET is_active = false WHERE id = $1 RETURNING *`,
        [req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ message: "Gift card not found" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/gift-cards/:id/extend", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!req.user || !["admin", "global_admin", "country_admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const { days } = req.body;
      const extendDays = Math.max(1, Math.min(730, Number(days) || 30));
      const { rows } = await pool.query(
        `UPDATE gift_cards
            SET expires_at = COALESCE(expires_at, NOW()) + ($1 || ' days')::interval,
                is_active   = true
          WHERE id = $2 RETURNING *`,
        [extendDays, req.params.id],
      );
      if (!rows[0]) return res.status(404).json({ message: "Gift card not found" });
      res.json(rows[0]);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/gift-cards/issue", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (!req.user || !["admin", "global_admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    try {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from({ length: 16 }, (_, i) =>
        (i > 0 && i % 4 === 0 ? "-" : "") + chars[Math.floor(Math.random() * chars.length)],
      ).join("");
      const { amount, recipientEmail, currency, daysValid } = req.body;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + Math.max(1, Number(daysValid) || 365));
      const { rows } = await pool.query(
        `INSERT INTO gift_cards (code, purchaser_user_id, recipient_email, initial_amount, balance, currency, expires_at)
         VALUES ($1, $2, $3, $4, $4, $5, $6) RETURNING *`,
        [code, req.user.id, recipientEmail || null, Number(amount) || 0, currency || "USD", expiresAt],
      );
      res.status(201).json(rows[0]);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ── Invoices ──────────────────────────────────────────────────────────────
  app.get("/api/invoices/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      if (req.user.role === "patient") {
        const invoices = await storage.getInvoicesByPatient(req.user.id);
        return res.json(invoices);
      }
      if (req.user.role === "provider") {
        const invoices = await storage.getInvoicesByProvider(req.user.id);
        return res.json(invoices);
      }
      return res.json([]);
    } catch (error) {
      console.error("Get my invoices error:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/appointment/:appointmentId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const invoice = await storage.getInvoiceByAppointment(req.params.appointmentId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      if (req.user?.role === "patient" && invoice.patientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (req.user?.role === "provider" && invoice.providerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.get("/api/invoices/:id/download", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      const appointment = await storage.getAppointmentWithDetails(invoice.appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      if (req.user?.role === "patient" && invoice.patientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (req.user?.role === "provider") {
        const prov = await storage.getProviderByUserId(req.user.id);
        if (!prov || prov.id !== invoice.providerId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }
      const dbItems = await storage.getInvoiceItems(invoice.id);
      const items = dbItems.length
        ? dbItems.map((i: any) => ({
            description: i.description,
            quantity: i.quantity ?? 1,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          }))
        : [{
            description: (appointment as any).service?.name || "Healthcare Service",
            quantity: 1,
            unitPrice: appointment.totalAmount,
            totalPrice: appointment.totalAmount,
          }];
      const enrichedInvoice = {
        ...invoice,
        // Ensure currency is always set — DB rows created before the currency
        // column was added have NULL here, causing invoice-gen to fall back to USD.
        currency: invoice.currency
          || (appointment as any).displayCurrency
          || (appointment as any).display_currency
          || "USD",
        platformFee: (appointment as any).platformFeeAmount ?? "0.00",
        promoDiscount: (appointment as any).promoDiscount ?? "0.00",
        promoCode: (appointment as any).promoCode ?? null,
        packageDiscountAmount: (appointment as any).packageDiscountAmount ?? "0.00",
        membershipLabel: (appointment as any).packageIdUsed ? "Member discount" : null,
        appointmentNumber: (appointment as any).appointmentNumber ?? null,
        appointmentDate: appointment.date ?? null,
        visitType: appointment.visitType ?? null,
      };
      const { generateInvoicePDF } = await import("../utils/invoice-gen");
      const pdfBuffer = await generateInvoicePDF(
        enrichedInvoice,
        (appointment as any).patient,
        (appointment as any).provider,
        items
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Invoice download error:", error);
      res.status(500).json({ message: "Failed to generate invoice PDF" });
    }
  });

  app.post("/api/invoices/generate/:appointmentId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.getAppointmentWithDetails(req.params.appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      const isAdmin = (await import("../middleware/country")).isAdminRole(req.user?.role);
      const isPatient = req.user?.role === "patient" && appointment.patientId === req.user?.id;
      let isOwningProvider = false;
      if (req.user?.role === "provider") {
        const prov = await storage.getProviderByUserId(req.user.id);
        isOwningProvider = !!prov && prov.id === appointment.providerId;
      }
      if (!isAdmin && !isPatient && !isOwningProvider) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (appointment.status !== "completed") {
        return res.status(400).json({ message: "Invoice can only be generated for completed appointments" });
      }
      const existing = await storage.getInvoiceByAppointment(appointment.id);
      if (existing) {
        return res.json({ created: false, invoice: existing });
      }
      const { createInvoiceForAppointment } = await import("../utils/invoice-helper");
      const result = await createInvoiceForAppointment(appointment.id);
      const invoice = await storage.getInvoiceByAppointment(appointment.id);
      return res.json({ ...result, invoice });
    } catch (err) {
      console.error("Manual invoice generation error:", err);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  app.get("/api/invoices/by-appointment/:appointmentId/download", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const invoice = await storage.getInvoiceByAppointment(req.params.appointmentId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      return res.redirect(`/api/invoices/${invoice.id}/download`);
    } catch (err) {
      console.error("Invoice by-appointment download error:", err);
      res.status(500).json({ message: "Failed to download invoice" });
    }
  });
}

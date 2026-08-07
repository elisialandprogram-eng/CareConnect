/**
 * Admin Payment Provider Management Routes
 *
 * Manages the payment provider registry — enable/disable providers,
 * configure credentials, set country/currency restrictions, test connections,
 * and query available providers for booking checkout.
 */

import type { Express, Request, Response } from "express";
import { pool } from "../../db";
import { z } from "zod";
import { authenticateToken, AuthRequest } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/auth";

// ── Public endpoint: available providers for patient's country ────────────────
// Called by booking checkout to build the dynamic payment method list.
export function registerAdminPaymentProviderRoutes(app: Express): void {

  /**
   * GET /api/payment-providers/available
   * Returns enabled providers filtered by country + currency.
   * Requires auth (patient or provider). Country derived from the user's profile.
   */
  app.get("/api/payment-providers/available", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const country = (req.query.country as string | undefined)?.toUpperCase() || null;
      const currency = (req.query.currency as string | undefined)?.toUpperCase() || null;

      const { rows } = await pool.query(`
        SELECT
          provider_key   AS key,
          display_name   AS label,
          description,
          environment,
          priority,
          country_codes,
          currency_codes,
          feature_flags,
          maintenance_mode,
          health_status,
          last_health_check,
          last_test_result
        FROM payment_providers
        WHERE is_enabled = true
          AND maintenance_mode = false
          AND (
            country_codes IS NULL
            OR $1::text IS NULL
            OR $1 = ANY(country_codes)
          )
          AND (
            currency_codes IS NULL
            OR $2::text IS NULL
            OR $2 = ANY(currency_codes)
          )
        ORDER BY priority ASC
      `, [country, currency]);

      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load payment providers" });
    }
  });

  /**
   * GET /api/admin/payment-providers
   * Returns ALL providers (including disabled) for the admin console.
   */
  app.get("/api/admin/payment-providers", authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          id,
          provider_key        AS key,
          display_name        AS label,
          description,
          is_enabled          AS "isEnabled",
          environment,
          priority,
          country_codes       AS "countryCodes",
          currency_codes      AS "currencyCodes",
          credentials,
          feature_flags       AS "featureFlags",
          maintenance_mode    AS "maintenanceMode",
          health_status       AS "healthStatus",
          last_health_check   AS "lastHealthCheck",
          last_test_result    AS "lastTestResult",
          created_at          AS "createdAt",
          updated_at          AS "updatedAt"
        FROM payment_providers
        ORDER BY priority ASC
      `);
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ message: "Failed to load payment providers" });
    }
  });

  const updateSchema = z.object({
    isEnabled: z.boolean().optional(),
    environment: z.enum(["sandbox", "production"]).optional(),
    priority: z.number().int().min(1).max(999).optional(),
    countryCodes: z.array(z.string().length(2)).nullable().optional(),
    currencyCodes: z.array(z.string().min(3).max(3)).nullable().optional(),
    credentials: z.record(z.string()).optional(),
    featureFlags: z.record(z.unknown()).optional(),
    maintenanceMode: z.boolean().optional(),
    displayName: z.string().min(1).optional(),
    description: z.string().optional(),
  });

  /**
   * PUT /api/admin/payment-providers/:key
   * Update a provider's config (any subset of fields).
   */
  app.put("/api/admin/payment-providers/:key", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const key = req.params.key;
      const updates = updateSchema.parse(req.body);

      const sets: string[] = ["updated_at = NOW()"];
      const vals: unknown[] = [key];
      let idx = 2;

      if (updates.isEnabled !== undefined)       { sets.push(`is_enabled = $${idx++}`);       vals.push(updates.isEnabled); }
      if (updates.environment !== undefined)      { sets.push(`environment = $${idx++}`);      vals.push(updates.environment); }
      if (updates.priority !== undefined)         { sets.push(`priority = $${idx++}`);         vals.push(updates.priority); }
      if (updates.countryCodes !== undefined)     { sets.push(`country_codes = $${idx++}`);    vals.push(updates.countryCodes); }
      if (updates.currencyCodes !== undefined)    { sets.push(`currency_codes = $${idx++}`);   vals.push(updates.currencyCodes); }
      if (updates.credentials !== undefined)      { sets.push(`credentials = $${idx++}`);      vals.push(JSON.stringify(updates.credentials)); }
      if (updates.featureFlags !== undefined)     { sets.push(`feature_flags = $${idx++}`);    vals.push(JSON.stringify(updates.featureFlags)); }
      if (updates.maintenanceMode !== undefined)  { sets.push(`maintenance_mode = $${idx++}`); vals.push(updates.maintenanceMode); }
      if (updates.displayName !== undefined)      { sets.push(`display_name = $${idx++}`);     vals.push(updates.displayName); }
      if (updates.description !== undefined)      { sets.push(`description = $${idx++}`);      vals.push(updates.description); }

      if (sets.length === 1) return res.status(400).json({ message: "No fields to update" });

      const { rows } = await pool.query(`
        UPDATE payment_providers
           SET ${sets.join(", ")}
         WHERE provider_key = $1
         RETURNING
           id,
           provider_key   AS key,
           display_name   AS label,
           is_enabled     AS "isEnabled",
           environment,
           priority,
           country_codes  AS "countryCodes",
           currency_codes AS "currencyCodes",
           maintenance_mode AS "maintenanceMode",
           health_status  AS "healthStatus",
           updated_at     AS "updatedAt"
      `, vals);

      if (rows.length === 0) return res.status(404).json({ message: "Provider not found" });
      res.json(rows[0]);
    } catch (err: any) {
      if (err?.name === "ZodError") return res.status(400).json({ message: "Invalid input", errors: err.errors });
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  /**
   * POST /api/admin/payment-providers/:key/test
   * Runs a health / connectivity test for a provider.
   */
  app.post("/api/admin/payment-providers/:key/test", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const key = req.params.key;

      const { rows } = await pool.query(
        `SELECT provider_key AS key, credentials, environment FROM payment_providers WHERE provider_key = $1`,
        [key],
      );
      if (rows.length === 0) return res.status(404).json({ message: "Provider not found" });

      const provider = rows[0];
      let testResult: { success: boolean; message: string; latencyMs?: number } = {
        success: false,
        message: "No test implemented for this provider",
      };

      const t0 = Date.now();

      switch (key) {
        case "stripe": {
          const secretKey = provider.credentials?.secretKey || process.env.STRIPE_SECRET_KEY;
          if (!secretKey) {
            testResult = { success: false, message: "No Stripe secret key configured" };
          } else {
            try {
              const resp = await fetch("https://api.stripe.com/v1/balance", {
                headers: { Authorization: `Bearer ${secretKey}` },
              });
              if (resp.ok) {
                testResult = { success: true, message: "Stripe connection verified", latencyMs: Date.now() - t0 };
              } else {
                const errBody = await resp.json().catch(() => ({})) as any;
                testResult = { success: false, message: `Stripe error: ${errBody?.error?.message ?? resp.statusText}` };
              }
            } catch (e: any) {
              testResult = { success: false, message: `Network error: ${e.message}` };
            }
          }
          break;
        }
        case "razorpay": {
          const keyId = provider.credentials?.keyId;
          const keySecret = provider.credentials?.keySecret;
          if (!keyId || !keySecret) {
            testResult = { success: false, message: "Razorpay credentials not configured" };
          } else {
            try {
              const resp = await fetch("https://api.razorpay.com/v1/payments?count=1", {
                headers: {
                  Authorization: "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64"),
                },
              });
              testResult = resp.ok
                ? { success: true, message: "Razorpay connection verified", latencyMs: Date.now() - t0 }
                : { success: false, message: `Razorpay error: ${resp.statusText}` };
            } catch (e: any) {
              testResult = { success: false, message: `Network error: ${e.message}` };
            }
          }
          break;
        }
        case "paypal": {
          const clientId = provider.credentials?.clientId;
          const clientSecret = provider.credentials?.clientSecret;
          if (!clientId || !clientSecret) {
            testResult = { success: false, message: "PayPal credentials not configured" };
          } else {
            try {
              const base = provider.environment === "sandbox"
                ? "https://api-m.sandbox.paypal.com"
                : "https://api-m.paypal.com";
              const resp = await fetch(`${base}/v1/oauth2/token`, {
                method: "POST",
                headers: {
                  Authorization: "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: "grant_type=client_credentials",
              });
              testResult = resp.ok
                ? { success: true, message: "PayPal OAuth token obtained", latencyMs: Date.now() - t0 }
                : { success: false, message: `PayPal error: ${resp.statusText}` };
            } catch (e: any) {
              testResult = { success: false, message: `Network error: ${e.message}` };
            }
          }
          break;
        }
        case "wallet":
        case "cash":
        case "bank_transfer":
          testResult = { success: true, message: "Local provider — no external connection required", latencyMs: 0 };
          break;
        default:
          testResult = { success: false, message: `No test handler for provider: ${key}` };
      }

      await pool.query(`
        UPDATE payment_providers
           SET health_status = $2,
               last_health_check = NOW(),
               last_test_result = $3,
               updated_at = NOW()
         WHERE provider_key = $1
      `, [key, testResult.success ? "ok" : "error", JSON.stringify(testResult)]);

      res.json({ key, testResult });
    } catch (err: any) {
      res.status(500).json({ message: "Test failed" });
    }
  });
}

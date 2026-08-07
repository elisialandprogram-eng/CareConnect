import type { Express } from "express";
import { pool } from "../../db";
import { authenticateToken, requireAdmin } from "../../middleware/auth";
import { getRates, syncRates, invalidateRateCache, SUPPORTED_CURRENCIES } from "../../services/currency";

export function registerAdminCurrencyRatesRoutes(app: Express): void {

  /**
   * GET /api/admin/currency-rates
   * Returns all tracked exchange rates with metadata.
   */
  app.get("/api/admin/currency-rates", authenticateToken, requireAdmin, async (_req, res) => {
    try {
      const result = await pool.query<{
        currency_code: string;
        rate_from_usd: string;
        fetched_at: string;
        is_manual_override: boolean;
      }>(
        `SELECT currency_code, rate_from_usd, fetched_at,
                COALESCE(is_manual_override, false) AS is_manual_override
         FROM currency_rates
         ORDER BY currency_code`
      );

      const fallback: Record<string, number> = { USD: 1, HUF: 365, IRR: 42000, GBP: 0.79, EUR: 0.92 };
      const dbMap = new Map(result.rows.map(r => [r.currency_code, r]));

      const currencies = [...new Set([...SUPPORTED_CURRENCIES, "EUR"])].map(code => {
        const row = dbMap.get(code);
        return {
          code,
          rateFromUsd: row ? Number(row.rate_from_usd) : fallback[code] ?? 1,
          fetchedAt: row?.fetched_at ?? null,
          isManualOverride: row?.is_manual_override ?? false,
          source: row ? (row.is_manual_override ? "manual" : "live") : "fallback",
        };
      });

      res.json({ currencies, cacheExpiresIn: null });
    } catch (err) {
      console.error("[admin/currency-rates] GET error:", err);
      res.status(500).json({ error: "Failed to fetch currency rates" });
    }
  });

  /**
   * PATCH /api/admin/currency-rates/:code
   * Override a single rate. Marks it as manual and invalidates the cache.
   */
  app.patch("/api/admin/currency-rates/:code", authenticateToken, requireAdmin, async (req, res) => {
    const code = req.params.code.toUpperCase();
    const { rate } = req.body as { rate?: number };

    if (!rate || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
      res.status(400).json({ error: "rate must be a positive number" });
      return;
    }

    if (code === "USD") {
      res.status(400).json({ error: "Cannot override the USD base rate" });
      return;
    }

    try {
      await pool.query(
        `INSERT INTO currency_rates (currency_code, rate_from_usd, fetched_at, is_manual_override)
         VALUES ($1, $2, NOW(), true)
         ON CONFLICT (currency_code) DO UPDATE
           SET rate_from_usd       = EXCLUDED.rate_from_usd,
               fetched_at          = EXCLUDED.fetched_at,
               is_manual_override  = true`,
        [code, rate]
      );

      invalidateRateCache();

      const updated = await getRates();
      res.json({ code, rate: updated[code], message: `Rate for ${code} updated successfully` });
    } catch (err) {
      console.error("[admin/currency-rates] PATCH error:", err);
      res.status(500).json({ error: "Failed to update currency rate" });
    }
  });

  /**
   * POST /api/admin/currency-rates/sync
   * Triggers a live fetch from open.er-api.com and refreshes the DB.
   */
  app.post("/api/admin/currency-rates/sync", authenticateToken, requireAdmin, async (_req, res) => {
    try {
      await syncRates();
      invalidateRateCache();
      const rates = await getRates();
      res.json({
        message: "Rates synced from live source",
        rates,
        syncedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("[admin/currency-rates] sync error:", err);
      res.status(500).json({ error: "Rate sync failed" });
    }
  });

  /**
   * POST /api/admin/currency-rates/:code/reset
   * Removes the manual override flag so the next live sync takes over.
   */
  app.post("/api/admin/currency-rates/:code/reset", authenticateToken, requireAdmin, async (req, res) => {
    const code = req.params.code.toUpperCase();
    try {
      await pool.query(
        `UPDATE currency_rates SET is_manual_override = false WHERE currency_code = $1`,
        [code]
      );
      invalidateRateCache();
      res.json({ message: `Manual override cleared for ${code}. Next cron sync will update it.` });
    } catch (err) {
      console.error("[admin/currency-rates] reset error:", err);
      res.status(500).json({ error: "Failed to reset override" });
    }
  });
}

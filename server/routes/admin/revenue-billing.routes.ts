/**
 * server/routes/admin/revenue-billing.routes.ts
 *
 * Revenue & Billing Center — admin CRUD APIs for all rule tables plus
 * the Revenue Simulator endpoint.
 */

import type { Express, Request, Response } from "express";
import { pool } from "../../db";
import { authenticateToken, requireAdmin } from "../../middleware/auth";
import { loadRevenueRules, runRevenueEngineSync, invalidateRevenueRulesCache, type RevenueEngineInput } from "../../lib/revenue-engine";

const mw = [authenticateToken, requireAdmin];

/**
 * Convert a snake_case DB row to camelCase so the frontend can read
 * fields like `feeType`, `percentValue`, `targetScope` etc.
 * All admin GET endpoints use pool.query which returns snake_case —
 * without this helper the edit forms silently reset to wrong defaults.
 */
function camelize(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const camel = k.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
    out[camel] = v;
  }
  return out;
}

export function registerRevenueBillingRoutes(app: Express): void {

  // ══════════════════════════════════════════════════════════════════════════
  // PLATFORM FEE RULES
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/platform-fee-rules", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM platform_fee_rules ORDER BY priority ASC, created_at DESC`
      );
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/platform-fee-rules", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        name, description, enabled = true, priority = 100,
        feeType = "percent", percentValue = 0, fixedAmount = 0,
        minFee, maxFee, targetScope = "global",
        countryCode, providerType, serviceCategory, modality,
        effectiveFrom, effectiveTo,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO platform_fee_rules
           (name, description, enabled, priority, fee_type, percent_value, fixed_amount,
            min_fee, max_fee, target_scope, country_code, provider_type, service_category,
            modality, effective_from, effective_to, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW(),NOW())
         RETURNING *`,
        [name, description, enabled, priority, feeType, percentValue, fixedAmount,
         (minFee != null && Number(minFee) > 0) ? minFee : null,
         (maxFee != null && Number(maxFee) > 0) ? maxFee : null,
         targetScope,
         countryCode ?? null, providerType ?? null, serviceCategory ?? null, modality ?? null,
         effectiveFrom ?? null, effectiveTo ?? null]
      );
      invalidateRevenueRulesCache();
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/platform-fee-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const fields = req.body;
      const colMap: Record<string, string> = {
        name: "name", description: "description", enabled: "enabled", priority: "priority",
        feeType: "fee_type", percentValue: "percent_value", fixedAmount: "fixed_amount",
        minFee: "min_fee", maxFee: "max_fee", targetScope: "target_scope",
        countryCode: "country_code", providerType: "provider_type",
        serviceCategory: "service_category", modality: "modality",
        effectiveFrom: "effective_from", effectiveTo: "effective_to",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) {
          let val = fields[key];
          // Treat 0 as "not set" for min/max fee caps — same rule as POST.
          if ((key === "minFee" || key === "maxFee") && (val == null || Number(val) <= 0)) val = null;
          setClauses.push(`${col} = $${idx++}`);
          values.push(val);
        }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE platform_fee_rules SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      invalidateRevenueRulesCache();
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/platform-fee-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM platform_fee_rules WHERE id = $1`, [req.params.id]);
      invalidateRevenueRulesCache();
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // COMMISSION RULES
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/commission-rules", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM commission_rules ORDER BY priority ASC, created_at DESC`
      );
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/commission-rules", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        name, description, enabled = true, priority = 100,
        commissionType = "global", commissionPercent = 10, fixedAmount = 0,
        providerId, providerType, serviceCategory, tier, countryCode,
        effectiveFrom, effectiveTo,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO commission_rules
           (name, description, enabled, priority, commission_type, commission_percent,
            fixed_amount, provider_id, provider_type, service_category, tier,
            country_code, effective_from, effective_to, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
         RETURNING *`,
        [name, description, enabled, priority, commissionType, commissionPercent,
         fixedAmount, providerId ?? null, providerType ?? null, serviceCategory ?? null,
         tier ?? null, countryCode ?? null, effectiveFrom ?? null, effectiveTo ?? null]
      );
      invalidateRevenueRulesCache();
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/commission-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params; const fields = req.body;
      const colMap: Record<string, string> = {
        name: "name", description: "description", enabled: "enabled", priority: "priority",
        commissionType: "commission_type", commissionPercent: "commission_percent",
        fixedAmount: "fixed_amount", providerId: "provider_id", providerType: "provider_type",
        serviceCategory: "service_category", tier: "tier", countryCode: "country_code",
        effectiveFrom: "effective_from", effectiveTo: "effective_to",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) { setClauses.push(`${col} = $${idx++}`); values.push(fields[key]); }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE commission_rules SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      invalidateRevenueRulesCache();
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/commission-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM commission_rules WHERE id = $1`, [req.params.id]);
      invalidateRevenueRulesCache();
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PAYMENT METHOD RULES
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/payment-method-rules", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM payment_method_rules ORDER BY priority ASC`);
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/payment-method-rules", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        paymentMethod, label, enabled = true, maintenanceMode = false,
        surchargeType = "none", surchargeValue = 0,
        discountType = "none", discountValue = 0,
        allowedCountries, allowedCurrencies, priority = 100, notes,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO payment_method_rules
           (payment_method, label, enabled, maintenance_mode,
            surcharge_type, surcharge_value, discount_type, discount_value,
            allowed_countries, allowed_currencies, priority, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
         ON CONFLICT (payment_method) DO UPDATE SET
           label=EXCLUDED.label, enabled=EXCLUDED.enabled,
           maintenance_mode=EXCLUDED.maintenance_mode,
           surcharge_type=EXCLUDED.surcharge_type, surcharge_value=EXCLUDED.surcharge_value,
           discount_type=EXCLUDED.discount_type, discount_value=EXCLUDED.discount_value,
           allowed_countries=EXCLUDED.allowed_countries, allowed_currencies=EXCLUDED.allowed_currencies,
           priority=EXCLUDED.priority, notes=EXCLUDED.notes, updated_at=NOW()
         RETURNING *`,
        [paymentMethod, label, enabled, maintenanceMode,
         surchargeType, surchargeValue, discountType, discountValue,
         allowedCountries ?? null, allowedCurrencies ?? null, priority, notes ?? null]
      );
      invalidateRevenueRulesCache();
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/payment-method-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params; const fields = req.body;
      const colMap: Record<string, string> = {
        label: "label", enabled: "enabled", maintenanceMode: "maintenance_mode",
        surchargeType: "surcharge_type", surchargeValue: "surcharge_value",
        discountType: "discount_type", discountValue: "discount_value",
        allowedCountries: "allowed_countries", allowedCurrencies: "allowed_currencies",
        priority: "priority", notes: "notes",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) { setClauses.push(`${col} = $${idx++}`); values.push(fields[key]); }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE payment_method_rules SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      invalidateRevenueRulesCache();
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/payment-method-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM payment_method_rules WHERE id = $1`, [req.params.id]);
      invalidateRevenueRulesCache();
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // TRAVEL FEE RULES
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/travel-fee-rules", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM travel_fee_rules ORDER BY priority ASC, created_at DESC`
      );
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/travel-fee-rules", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        name, description, enabled = true, priority = 100,
        feeType = "flat", flatAmount = 0, perKmRate = 0,
        minDistanceKm, maxDistanceKm, radiusKm, zoneDefinition,
        countryCode, providerType, effectiveFrom, effectiveTo,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO travel_fee_rules
           (name, description, enabled, priority, fee_type, flat_amount, per_km_rate,
            min_distance_km, max_distance_km, radius_km, zone_definition,
            country_code, provider_type, effective_from, effective_to, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW(),NOW())
         RETURNING *`,
        [name, description, enabled, priority, feeType, flatAmount, perKmRate,
         minDistanceKm ?? null, maxDistanceKm ?? null, radiusKm ?? null,
         zoneDefinition ? JSON.stringify(zoneDefinition) : null,
         countryCode ?? null, providerType ?? null,
         effectiveFrom ?? null, effectiveTo ?? null]
      );
      invalidateRevenueRulesCache();
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/travel-fee-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params; const fields = req.body;
      const colMap: Record<string, string> = {
        name: "name", description: "description", enabled: "enabled", priority: "priority",
        feeType: "fee_type", flatAmount: "flat_amount", perKmRate: "per_km_rate",
        minDistanceKm: "min_distance_km", maxDistanceKm: "max_distance_km", radiusKm: "radius_km",
        countryCode: "country_code", providerType: "provider_type",
        effectiveFrom: "effective_from", effectiveTo: "effective_to",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) { setClauses.push(`${col} = $${idx++}`); values.push(fields[key]); }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE travel_fee_rules SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      invalidateRevenueRulesCache();
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/travel-fee-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM travel_fee_rules WHERE id = $1`, [req.params.id]);
      invalidateRevenueRulesCache();
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // PAYOUT CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/payout-config", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM payout_config ORDER BY created_at DESC`);
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/payout-config", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        name, description, enabled = true, schedule = "weekly",
        reservePercent = 0, holdbackPercent = 0, refundProtectionPercent = 5,
        minPayoutAmount = 10, maxPayoutAmount, countryCode, providerType,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO payout_config
           (name, description, enabled, schedule, reserve_percent, holdback_percent,
            refund_protection_percent, min_payout_amount, max_payout_amount,
            country_code, provider_type, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
         RETURNING *`,
        [name, description, enabled, schedule, reservePercent, holdbackPercent,
         refundProtectionPercent, minPayoutAmount, maxPayoutAmount ?? null,
         countryCode ?? null, providerType ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/payout-config/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params; const fields = req.body;
      const colMap: Record<string, string> = {
        name: "name", description: "description", enabled: "enabled", schedule: "schedule",
        reservePercent: "reserve_percent", holdbackPercent: "holdback_percent",
        refundProtectionPercent: "refund_protection_percent",
        minPayoutAmount: "min_payout_amount", maxPayoutAmount: "max_payout_amount",
        countryCode: "country_code", providerType: "provider_type",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) { setClauses.push(`${col} = $${idx++}`); values.push(fields[key]); }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE payout_config SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/payout-config/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM payout_config WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REVENUE SHARE RULES
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/share-rules", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM revenue_share_rules ORDER BY priority ASC, created_at DESC`
      );
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/share-rules", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        name, description, enabled = true, priority = 100,
        participantType = "platform", sharePercent = 0, fixedAmount = 0,
        countryCode, providerType, serviceCategory, effectiveFrom, effectiveTo,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO revenue_share_rules
           (name, description, enabled, priority, participant_type, share_percent, fixed_amount,
            country_code, provider_type, service_category, effective_from, effective_to,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
         RETURNING *`,
        [name, description, enabled, priority, participantType, sharePercent, fixedAmount,
         countryCode ?? null, providerType ?? null, serviceCategory ?? null,
         effectiveFrom ?? null, effectiveTo ?? null]
      );
      invalidateRevenueRulesCache();
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/share-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params; const fields = req.body;
      const colMap: Record<string, string> = {
        name: "name", description: "description", enabled: "enabled", priority: "priority",
        participantType: "participant_type", sharePercent: "share_percent",
        fixedAmount: "fixed_amount", countryCode: "country_code",
        providerType: "provider_type", serviceCategory: "service_category",
        effectiveFrom: "effective_from", effectiveTo: "effective_to",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) { setClauses.push(`${col} = $${idx++}`); values.push(fields[key]); }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE revenue_share_rules SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      invalidateRevenueRulesCache();
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/share-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM revenue_share_rules WHERE id = $1`, [req.params.id]);
      invalidateRevenueRulesCache();
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // WALLET RULES
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/wallet-rules", ...mw, async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM wallet_rules ORDER BY credit_type ASC`);
      res.json(rows.map(camelize));
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.post("/api/admin/revenue/wallet-rules", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        creditType, label, enabled = true, maxBalanceUsd, expiryDays,
        canCombineWithPromo = true, canCombineWithMembership = true,
        minTransactionAmount = 0, countryCode, notes,
      } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO wallet_rules
           (credit_type, label, enabled, max_balance_usd, expiry_days,
            can_combine_with_promo, can_combine_with_membership,
            min_transaction_amount, country_code, notes, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         ON CONFLICT (credit_type) DO UPDATE SET
           label=EXCLUDED.label, enabled=EXCLUDED.enabled,
           max_balance_usd=EXCLUDED.max_balance_usd, expiry_days=EXCLUDED.expiry_days,
           can_combine_with_promo=EXCLUDED.can_combine_with_promo,
           can_combine_with_membership=EXCLUDED.can_combine_with_membership,
           min_transaction_amount=EXCLUDED.min_transaction_amount,
           country_code=EXCLUDED.country_code, notes=EXCLUDED.notes, updated_at=NOW()
         RETURNING *`,
        [creditType, label, enabled, maxBalanceUsd ?? null, expiryDays ?? null,
         canCombineWithPromo, canCombineWithMembership, minTransactionAmount,
         countryCode ?? null, notes ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.patch("/api/admin/revenue/wallet-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      const { id } = req.params; const fields = req.body;
      const colMap: Record<string, string> = {
        label: "label", enabled: "enabled", maxBalanceUsd: "max_balance_usd",
        expiryDays: "expiry_days", canCombineWithPromo: "can_combine_with_promo",
        canCombineWithMembership: "can_combine_with_membership",
        minTransactionAmount: "min_transaction_amount",
        countryCode: "country_code", notes: "notes",
      };
      const setClauses: string[] = []; const values: unknown[] = []; let idx = 1;
      for (const [key, col] of Object.entries(colMap)) {
        if (key in fields) { setClauses.push(`${col} = $${idx++}`); values.push(fields[key]); }
      }
      setClauses.push(`updated_at = NOW()`); values.push(id);
      const { rows } = await pool.query(
        `UPDATE wallet_rules SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`, values
      );
      if (!rows.length) return res.status(404).json({ error: "Not found" });
      res.json(rows[0]);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  app.delete("/api/admin/revenue/wallet-rules/:id", ...mw, async (req: Request, res: Response) => {
    try {
      await pool.query(`DELETE FROM wallet_rules WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // REVENUE SIMULATOR
  // ══════════════════════════════════════════════════════════════════════════

  // Live summary of all rules (for the simulator sidebar — always fresh from DB)
  app.get("/api/admin/revenue/rules-summary", ...mw, async (_req: Request, res: Response) => {
    try {
      const [cr, pfr, pmr, tfr, rsr] = await Promise.all([
        pool.query(
          `SELECT id, name, commission_type, commission_percent, fixed_amount,
                  provider_type, service_category, country_code, tier, priority, enabled
           FROM commission_rules ORDER BY priority ASC, created_at DESC`
        ),
        pool.query(
          `SELECT id, name, fee_type, percent_value, fixed_amount, target_scope,
                  country_code, provider_type, service_category, modality, priority, enabled
           FROM platform_fee_rules ORDER BY priority ASC, created_at DESC`
        ),
        pool.query(
          `SELECT id, payment_method, label, enabled, surcharge_type, surcharge_value,
                  discount_type, discount_value, maintenance_mode, priority
           FROM payment_method_rules ORDER BY priority ASC`
        ),
        pool.query(
          `SELECT id, name, fee_type, flat_amount, per_km_rate, min_distance_km, max_distance_km,
                  radius_km, country_code, provider_type, priority, enabled
           FROM travel_fee_rules ORDER BY priority ASC`
        ),
        pool.query(
          `SELECT id, name, participant_type, share_percent, priority, enabled
           FROM revenue_share_rules ORDER BY priority ASC`
        ),
      ]);
      res.json({
        commissionRules:    cr.rows.map(camelize),
        platformFeeRules:   pfr.rows.map(camelize),
        paymentMethodRules: pmr.rows.map(camelize),
        travelFeeRules:     tfr.rows.map(camelize),
        revenueShareRules:  rsr.rows.map(camelize),
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // Full revenue simulation — uses live admin-configured rules, no hardcoded defaults
  app.post("/api/admin/revenue/simulate", ...mw, async (req: Request, res: Response) => {
    try {
      const {
        basePrice = 100,
        visitType = "clinic",
        sessions = 1,
        paymentMethod = "cash",
        countryCode,
        providerType,
        serviceCategory,
        travelDistanceKm,
        promoDiscountType,
        promoDiscountValue,
        promoCode,
        membershipServiceDiscountPct = 0,
        membershipPlatformFeeDiscountPct = 0,
        membershipReducedCommissionPct = 0,
        taxRatePercent = 0,
        isEmergency = false,
        surgeMultiplier = 1,
        bookingCurrency = "USD",
        rates,
        // Service-level fee overrides
        homeVisitFee = 0,
        clinicFee = 0,
        telemedicineFee = 0,
        emergencyFee = 0,
        platformFeeOverride,
      } = req.body;

      const rules = await loadRevenueRules();

      const input: RevenueEngineInput & { _preloaded: typeof rules } = {
        visitType,
        sessions,
        paymentMethod,
        countryCode: countryCode ?? null,
        providerType: providerType ?? null,
        serviceCategory: serviceCategory ?? null,
        travelDistanceKm: travelDistanceKm ?? null,
        taxRatePercent: taxRatePercent ?? 0,
        isEmergency,
        surgeMultiplier: surgeMultiplier ?? 1,
        bookingCurrency: bookingCurrency ?? "USD",
        providerCurrency: bookingCurrency ?? "USD",
        rates: rates ?? null,
        membershipReducedCommissionPercent: Number(membershipReducedCommissionPct) || 0,
        service: {
          price: String(basePrice),
          duration: 60,
          platformFeeOverride: platformFeeOverride != null ? String(platformFeeOverride) : null,
          homeVisitFee: String(homeVisitFee ?? 0),
          clinicFee: String(clinicFee ?? 0),
          telemedicineFee: String(telemedicineFee ?? 0),
          emergencyFee: String(emergencyFee ?? 0),
        } as any,
        discount: promoDiscountType && promoDiscountValue
          ? { type: promoDiscountType, value: Number(promoDiscountValue), code: promoCode ?? undefined }
          : null,
        membershipDiscount:
          membershipServiceDiscountPct > 0
            ? {
                serviceDiscountPercent: Number(membershipServiceDiscountPct),
                platformFeeDiscount: Number(membershipPlatformFeeDiscountPct),
                label: "Membership",
                userPackageId: "sim",
              }
            : null,
        _preloaded: rules,
      };

      const result = runRevenueEngineSync(input);
      res.json(result);
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // OVERVIEW — aggregate stats for the billing center dashboard
  // ══════════════════════════════════════════════════════════════════════════

  app.get("/api/admin/revenue/overview", ...mw, async (_req: Request, res: Response) => {
    try {
      const [pfr, cr, pmr, tfr, pc, rsr, wr] = await Promise.all([
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM platform_fee_rules`),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM commission_rules`),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM payment_method_rules`),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM travel_fee_rules`),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM payout_config`),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM revenue_share_rules`),
        pool.query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE enabled) AS active FROM wallet_rules`),
      ]);

      const [revenue, bookings] = await Promise.all([
        pool.query(`SELECT COALESCE(SUM(amount), 0)::numeric AS total_revenue, COUNT(*) AS total_payments FROM payments WHERE status = 'completed'`),
        pool.query(`SELECT COUNT(*) AS total FROM appointments`),
      ]);

      res.json({
        rules: {
          platformFee:   { total: Number(pfr.rows[0].total), active: Number(pfr.rows[0].active) },
          commission:    { total: Number(cr.rows[0].total),  active: Number(cr.rows[0].active) },
          paymentMethod: { total: Number(pmr.rows[0].total), active: Number(pmr.rows[0].active) },
          travelFee:     { total: Number(tfr.rows[0].total), active: Number(tfr.rows[0].active) },
          payoutConfig:  { total: Number(pc.rows[0].total),  active: Number(pc.rows[0].active) },
          revenueShare:  { total: Number(rsr.rows[0].total), active: Number(rsr.rows[0].active) },
          walletRules:   { total: Number(wr.rows[0].total),  active: Number(wr.rows[0].active) },
        },
        metrics: {
          totalRevenue:   Number(revenue.rows[0].total_revenue  ?? 0),
          totalPayments:  Number(revenue.rows[0].total_payments ?? 0),
          totalBookings:  Number(bookings.rows[0].total ?? 0),
        },
      });
    } catch (err: any) { res.status(500).json({ error: err.message }); }
  });
}

/**
 * Stripe Connect Service — Workstream 2 (P1 Launch Blockers)
 *
 * Provider payout architecture using Stripe Express Connected Accounts.
 * Handles: account creation, onboarding, status sync, and payout transfers.
 *
 * SAFETY:
 *  - Express accounts only (not Custom)
 *  - Stripe is optional; all methods return graceful errors when key is absent
 *  - All DB operations use pool.connect() with explicit release
 */

import { pool } from "../db";

// ── Lazy Stripe import (optional dependency) ──────────────────────────────────

let _stripe: import("stripe").default | null = null;

async function getStripe(): Promise<import("stripe").default | null> {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const Stripe = (await import("stripe")).default;
  _stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia" } as any);
  return _stripe;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StripeConnectAccount {
  id: string;
  providerId: string;
  stripeAccountId: string | null;
  accountType: "express" | "none";
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  requirementsErrors: string[];
  country: string | null;
  currency: string | null;
  onboardingUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardResult {
  accountId: string;
  onboardingUrl: string;
}

export interface AccountStatus {
  stripeAccountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  requirementsDue: string[];
  requirementsErrors: string[];
  onboardingComplete: boolean;
  restricted: boolean;
  needsAttention: boolean;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function upsertConnectAccount(
  providerId: string,
  update: Partial<{
    stripeAccountId: string;
    accountType: string;
    onboardingComplete: boolean;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    requirementsDue: string[];
    requirementsErrors: string[];
    country: string;
    currency: string;
  }>
): Promise<void> {
  const existing = await pool.query(
    `SELECT id FROM provider_stripe_accounts WHERE provider_id = $1 LIMIT 1`,
    [providerId]
  );
  if (existing.rowCount && existing.rowCount > 0) {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let idx = 1;
    for (const [key, val] of Object.entries(update)) {
      const col = key.replace(/([A-Z])/g, "_$1").toLowerCase();
      sets.push(`${col} = $${idx++}`);
      vals.push(val);
    }
    sets.push(`updated_at = NOW()`);
    vals.push(providerId);
    await pool.query(
      `UPDATE provider_stripe_accounts SET ${sets.join(", ")} WHERE provider_id = $${idx}`,
      vals
    );
  } else {
    await pool.query(
      `INSERT INTO provider_stripe_accounts
         (provider_id, stripe_account_id, account_type, onboarding_complete, charges_enabled,
          payouts_enabled, details_submitted, requirements_due, requirements_errors, country, currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        providerId,
        update.stripeAccountId ?? null,
        update.accountType ?? "none",
        update.onboardingComplete ?? false,
        update.chargesEnabled ?? false,
        update.payoutsEnabled ?? false,
        update.detailsSubmitted ?? false,
        JSON.stringify(update.requirementsDue ?? []),
        JSON.stringify(update.requirementsErrors ?? []),
        update.country ?? null,
        update.currency ?? null,
      ]
    );
  }
}

// ── Service Methods ───────────────────────────────────────────────────────────

/** Create a Stripe Express connected account and return the onboarding URL. */
export async function createConnectedAccount(
  providerId: string,
  email: string,
  countryCode: string,
  returnUrl: string,
  refreshUrl: string
): Promise<OnboardResult> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe not configured. Please set STRIPE_SECRET_KEY.");

  // Check if already has an account
  const { rows } = await pool.query<{ stripe_account_id: string }>(
    `SELECT stripe_account_id FROM provider_stripe_accounts WHERE provider_id = $1 LIMIT 1`,
    [providerId]
  );

  let accountId = rows[0]?.stripe_account_id;

  if (!accountId) {
    const account = await stripe.accounts.create({
      type: "express",
      email,
      country: countryCode === "HU" ? "HU" : "GB",
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: { provider_id: providerId, platform: "goldenlife" },
    });
    accountId = account.id;
    await upsertConnectAccount(providerId, {
      stripeAccountId: accountId,
      accountType: "express",
      country: account.country ?? undefined,
      currency: account.default_currency ?? undefined,
    });
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });

  await pool.query(
    `UPDATE provider_stripe_accounts SET onboarding_url = $1, updated_at = NOW() WHERE provider_id = $2`,
    [accountLink.url, providerId]
  ).catch(() => null);

  return { accountId, onboardingUrl: accountLink.url };
}

/** Sync account status from Stripe API → DB. */
export async function syncAccountStatus(providerId: string): Promise<AccountStatus> {
  const stripe = await getStripe();
  const { rows } = await pool.query<{ stripe_account_id: string }>(
    `SELECT stripe_account_id FROM provider_stripe_accounts WHERE provider_id = $1 LIMIT 1`,
    [providerId]
  );
  if (!rows[0]?.stripe_account_id) {
    return {
      stripeAccountId: null, chargesEnabled: false, payoutsEnabled: false,
      detailsSubmitted: false, requirementsDue: [], requirementsErrors: [],
      onboardingComplete: false, restricted: true, needsAttention: true,
    };
  }

  if (!stripe) {
    return {
      stripeAccountId: rows[0].stripe_account_id, chargesEnabled: false, payoutsEnabled: false,
      detailsSubmitted: false, requirementsDue: [], requirementsErrors: [],
      onboardingComplete: false, restricted: true, needsAttention: false,
    };
  }

  const account = await stripe.accounts.retrieve(rows[0].stripe_account_id);
  const requirementsDue = [
    ...(account.requirements?.currently_due ?? []),
    ...(account.requirements?.past_due ?? []),
  ];
  const requirementsErrors = (account.requirements?.errors ?? []).map((e) => e.reason ?? "unknown");
  const onboardingComplete = account.details_submitted && account.charges_enabled && account.payouts_enabled;

  await upsertConnectAccount(providerId, {
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    onboardingComplete,
    requirementsDue,
    requirementsErrors,
  });

  return {
    stripeAccountId: account.id,
    chargesEnabled: account.charges_enabled ?? false,
    payoutsEnabled: account.payouts_enabled ?? false,
    detailsSubmitted: account.details_submitted ?? false,
    requirementsDue,
    requirementsErrors,
    onboardingComplete,
    restricted: !account.charges_enabled || !account.payouts_enabled,
    needsAttention: requirementsDue.length > 0,
  };
}

/** Get express dashboard login link for provider. */
export async function getDashboardLink(providerId: string): Promise<string> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  const { rows } = await pool.query<{ stripe_account_id: string }>(
    `SELECT stripe_account_id FROM provider_stripe_accounts WHERE provider_id = $1 LIMIT 1`,
    [providerId]
  );
  if (!rows[0]?.stripe_account_id) throw new Error("No connected account found. Please complete onboarding first.");

  const link = await stripe.accounts.createLoginLink(rows[0].stripe_account_id);
  return link.url;
}

/** Transfer funds to a connected account (provider payout). */
export async function transferToConnectedAccount(
  providerId: string,
  amountUsd: number,
  payoutRequestId: string,
  description: string
): Promise<{ transferId: string }> {
  const stripe = await getStripe();
  if (!stripe) throw new Error("Stripe not configured");

  const { rows } = await pool.query<{ stripe_account_id: string; payouts_enabled: boolean }>(
    `SELECT stripe_account_id, payouts_enabled FROM provider_stripe_accounts WHERE provider_id = $1 LIMIT 1`,
    [providerId]
  );
  if (!rows[0]?.stripe_account_id) throw new Error("Provider has no connected Stripe account");
  if (!rows[0].payouts_enabled) throw new Error("Provider Stripe account payouts are not enabled");

  const amountCents = Math.round(amountUsd * 100);
  if (amountCents < 1) throw new Error("Transfer amount too small");

  // Idempotency key prevents duplicate transfers on network timeout/retry.
  // Keyed on payout_request_id so every retry for the same payout is a no-op on Stripe's side.
  const transfer = await stripe.transfers.create(
    {
      amount: amountCents,
      currency: "usd",
      destination: rows[0].stripe_account_id,
      description,
      metadata: { provider_id: providerId, payout_request_id: payoutRequestId, platform: "goldenlife" },
      transfer_group: `payout_${payoutRequestId}`,
    },
    { idempotencyKey: `payout_transfer_${payoutRequestId}` },
  );

  return { transferId: transfer.id };
}

/** Admin: get overview of all connected accounts. */
export async function getConnectedAccountsOverview(): Promise<{
  total: number;
  onboardingComplete: number;
  chargesEnabled: number;
  payoutsEnabled: number;
  needsAttention: number;
  accounts: Array<{
    providerId: string;
    providerName: string;
    stripeAccountId: string | null;
    status: string;
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    onboardingComplete: boolean;
    requirementsDue: string[];
    createdAt: string;
  }>;
}> {
  const { rows } = await pool.query(`
    SELECT
      psa.provider_id,
      psa.stripe_account_id,
      psa.charges_enabled,
      psa.payouts_enabled,
      psa.onboarding_complete,
      psa.requirements_due,
      psa.requirements_errors,
      psa.created_at,
      COALESCE(p.clinic_name, u.first_name || ' ' || u.last_name, 'Unknown') AS provider_name
    FROM provider_stripe_accounts psa
    LEFT JOIN providers p ON p.id = psa.provider_id
    LEFT JOIN users u ON u.id = p.user_id
    ORDER BY psa.created_at DESC
  `);

  const accounts = rows.map((r) => ({
    providerId: r.provider_id,
    providerName: r.provider_name,
    stripeAccountId: r.stripe_account_id,
    chargesEnabled: r.charges_enabled,
    payoutsEnabled: r.payouts_enabled,
    onboardingComplete: r.onboarding_complete,
    requirementsDue: Array.isArray(r.requirements_due) ? r.requirements_due : [],
    createdAt: r.created_at,
    status: r.onboarding_complete ? "active" : r.stripe_account_id ? "onboarding" : "not_started",
  }));

  return {
    total: accounts.length,
    onboardingComplete: accounts.filter((a) => a.onboardingComplete).length,
    chargesEnabled: accounts.filter((a) => a.chargesEnabled).length,
    payoutsEnabled: accounts.filter((a) => a.payoutsEnabled).length,
    needsAttention: accounts.filter((a) => a.requirementsDue.length > 0).length,
    accounts,
  };
}

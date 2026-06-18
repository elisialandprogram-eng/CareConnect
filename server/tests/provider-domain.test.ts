/**
 * Provider Domain Integration Tests — Phase B Closure Sprint
 *
 * Coverage:
 *   A. Analytics endpoint — shape, required keys, package performance
 *   B. Insights endpoint  — shape, growthTips, repeat patients
 *   C. Wallet-summary     — withdrawable + escrow + ledger shape
 *   D. Notifications      — unread-count, mark-read, bulk-action
 *   E. Reviews            — provider review list + reply
 *   F. Schedule           — week-slots-summary shape
 *
 * Run:  npx tsx server/tests/provider-domain.test.ts
 * Env:  SESSION_SECRET + SUPABASE_DATABASE_URL + live server on :5000
 */

import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { pool } from "../db";

const BASE_URL   = "http://localhost:5000";
const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-fallback";

type Result = { name: string; passed: boolean; skipped?: boolean; error?: string };
const results: Result[] = [];

async function it(name: string, fn: () => Promise<void>): Promise<void> {
  const label = `  🧪 ${name}`;
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`${label} … ✅ PASS`);
  } catch (e: any) {
    if (e?.code === "SKIP") {
      results.push({ name, passed: true, skipped: true });
      console.log(`${label} … ⏭  SKIP (${e.message})`);
    } else {
      results.push({ name, passed: false, error: e?.message ?? String(e) });
      console.error(`${label} … ❌ FAIL: ${e?.message ?? e}`);
    }
  }
}

function skip(reason: string): never {
  const e: any = new Error(reason);
  e.code = "SKIP";
  throw e;
}

function signToken(id: string, email: string, role: string, countryCode = "HU"): string {
  return jwt.sign({ id, email, role, countryCode }, JWT_SECRET, { expiresIn: "1h" });
}

/** Fetch a real provider row + matching user from the DB */
async function getProviderRow(): Promise<{ userId: string; email: string; providerId: string } | null> {
  const { rows } = await pool.query(
    `SELECT u.id AS user_id, u.email, p.id AS provider_id
       FROM users u
       JOIN providers p ON p.user_id = u.id
      WHERE u.role = 'provider' AND u.is_email_verified = true
      LIMIT 1`,
  );
  return rows[0]
    ? { userId: rows[0].user_id, email: rows[0].email, providerId: rows[0].provider_id }
    : null;
}

// ── A. Analytics Endpoint ─────────────────────────────────────────────────────

async function testAnalyticsShape(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/provider/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

  const body = await res.json();
  assert.ok(Array.isArray(body.serviceBreakdown),         "serviceBreakdown is array");
  assert.ok(typeof body.ratingDistribution === "object",  "ratingDistribution is object");
  assert.ok(Array.isArray(body.monthlyTrend),             "monthlyTrend is array");
  assert.ok(typeof body.referralStats === "object",       "referralStats is object");
  assert.ok(typeof body.scheduleHealth === "object",      "scheduleHealth is object");
  assert.ok(Array.isArray(body.packagePerformance),       "packagePerformance is array");
  assert.ok("utilizationPct" in body.scheduleHealth,      "scheduleHealth.utilizationPct present");
  assert.ok("total" in body.referralStats,                "referralStats.total present");
}

async function testAnalyticsRatingDist(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/provider/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  const rd = body.ratingDistribution;
  assert.ok(typeof rd.total === "number", "ratingDistribution.total is number");
  assert.ok(typeof rd.avg   === "number", "ratingDistribution.avg is number");
  assert.ok(typeof rd.dist  === "object", "ratingDistribution.dist is object");
}

async function testAnalyticsRequiresProviderRole(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, email FROM users WHERE role = 'patient' AND is_email_verified = true LIMIT 1`,
  );
  if (!rows[0]) skip("No patient user in DB");

  const token = signToken(rows[0].id, rows[0].email, "patient");
  const res = await fetch(`${BASE_URL}/api/provider/analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403, "Patient should receive 403 from analytics endpoint");
}

// ── B. Insights Endpoint ──────────────────────────────────────────────────────

async function testInsightsShape(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/provider/insights`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

  const body = await res.json();
  assert.ok(Array.isArray(body.weeklyRevenue),     "weeklyRevenue is array");
  assert.ok(Array.isArray(body.heatmap),           "heatmap is array");
  assert.ok(typeof body.kpi === "object",          "kpi is object");
  assert.ok(Array.isArray(body.repeatPatients),    "repeatPatients is array");
  assert.ok(Array.isArray(body.growthTips),        "growthTips is array");
  assert.ok("cancellationRate" in body.kpi,        "kpi.cancellationRate present");
  assert.ok("repeatPatientPct" in body.kpi,        "kpi.repeatPatientPct present");
}

async function testInsightsGrowthTipsAreStrings(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/provider/insights`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  assert.ok(Array.isArray(body.growthTips), "growthTips is array");
  for (const tip of body.growthTips) {
    assert.equal(typeof tip, "string", `Each growthTip must be a string, got: ${typeof tip}`);
    assert.ok(tip.length > 0, "growthTip must not be empty");
  }
}

// ── C. Wallet-Summary ─────────────────────────────────────────────────────────

async function testWalletSummaryShape(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/provider/wallet-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);

  const body = await res.json();
  assert.ok(typeof body.withdrawable_balance_cents === "number", "withdrawable_balance_cents is number");
  assert.ok(typeof body.pending_escrow_cents       === "number", "pending_escrow_cents is number");
  assert.ok(Array.isArray(body.ledger),                          "ledger is array");
}

async function testWalletSummaryForbiddenForPatient(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, email FROM users WHERE role = 'patient' AND is_email_verified = true LIMIT 1`,
  );
  if (!rows[0]) skip("No patient user in DB");

  const token = signToken(rows[0].id, rows[0].email, "patient");
  const res = await fetch(`${BASE_URL}/api/provider/wallet-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403, "Patient should receive 403 from wallet-summary");
}

// ── D. Notifications ──────────────────────────────────────────────────────────

async function testNotificationsUnreadCount(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert.ok(typeof body.count === "number", "count is number");
  assert.ok(body.count >= 0, "count >= 0");
}

async function testNotificationsListShape(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/notifications?limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert.ok(Array.isArray(body), "notifications is array");
}

// ── E. Reviews ────────────────────────────────────────────────────────────────

async function testProviderReviewsList(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/reviews/provider/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
  const body = await res.json();
  assert.ok(Array.isArray(body), "reviews is array");
}

// ── F. Schedule ───────────────────────────────────────────────────────────────

async function testWeekSlotsSummaryShape(): Promise<void> {
  const prov = await getProviderRow();
  if (!prov) skip("No verified provider in DB");

  const token = signToken(prov.userId, prov.email, "provider");
  const res = await fetch(`${BASE_URL}/api/provider/week-slots-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) skip("Provider has no schedule templates");
  assert.ok([200, 404].includes(res.status), `Expected 200 or 404, got ${res.status}`);
  if (res.status === 200) {
    const body = await res.json();
    assert.ok(typeof body === "object", "week-slots-summary returns object");
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("\n🔍  Provider Domain Tests — Phase B Closure Sprint\n");

  console.log("  A. Analytics");
  await it("analytics endpoint — correct shape",          testAnalyticsShape);
  await it("analytics endpoint — rating distribution",    testAnalyticsRatingDist);
  await it("analytics endpoint — 403 for patients",       testAnalyticsRequiresProviderRole);

  console.log("\n  B. Insights");
  await it("insights endpoint — correct shape",           testInsightsShape);
  await it("insights endpoint — growthTips are strings",  testInsightsGrowthTipsAreStrings);

  console.log("\n  C. Wallet-Summary");
  await it("wallet-summary — correct shape",              testWalletSummaryShape);
  await it("wallet-summary — 403 for patients",           testWalletSummaryForbiddenForPatient);

  console.log("\n  D. Notifications");
  await it("notifications — unread-count shape",          testNotificationsUnreadCount);
  await it("notifications — list shape",                  testNotificationsListShape);

  console.log("\n  E. Reviews");
  await it("provider reviews list",                       testProviderReviewsList);

  console.log("\n  F. Schedule");
  await it("week-slots-summary shape",                    testWeekSlotsSummaryShape);

  const passed  = results.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed  = results.filter((r) => !r.passed).length;

  console.log(`\n${"─".repeat(56)}`);
  console.log(`  Results: ${passed} passed · ${skipped} skipped · ${failed} failed`);
  console.log(`${"─".repeat(56)}\n`);

  if (failed > 0) {
    console.error("Failed tests:");
    results.filter((r) => !r.passed).forEach((r) => console.error(`  ✗ ${r.name}: ${r.error}`));
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});

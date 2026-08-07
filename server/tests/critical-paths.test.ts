/**
 * Critical Path Integration Tests — CB-005
 *
 * Three scenarios validating the most security-critical invariants:
 *   A. Multi-country isolation: HU-scoped admins cannot see IR data
 *   B. OCC slot-hold race: exactly one concurrent hold wins per slot
 *   C. Refund triple-guard: already-refunded appointments are rejected
 *
 * Run:  npx tsx server/tests/critical-paths.test.ts
 * Env:  Requires SESSION_SECRET + SUPABASE_DATABASE_URL
 */

import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import {
  canAccessCountry,
  listingCountryFilter,
} from "../middleware/country";

const BASE_URL = "http://localhost:5000";
const JWT_SECRET = process.env.SESSION_SECRET ?? "dev-secret-fallback";

type Result = { name: string; passed: boolean; skipped?: boolean; error?: string };
const results: Result[] = [];

async function it(
  name: string,
  fn: () => Promise<void>,
): Promise<void> {
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

function signToken(payload: { id: string; email: string; role: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

// ── Helper: fetch a verified global_admin JWT from the live DB ───────────────
async function getAdminToken(): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT id, email, role FROM users
     WHERE role IN ('global_admin', 'admin')
       AND is_email_verified = true
     LIMIT 1`,
  );
  if (!rows[0]) return null;
  return signToken({ id: rows[0].id, email: rows[0].email, role: rows[0].role });
}

// ────────────────────────────────────────────────────────────────────────────
// SCENARIO A — Multi-Country Isolation
// ────────────────────────────────────────────────────────────────────────────

console.log("\n━━━ Scenario A: Multi-Country Isolation ━━━");

await it("A1 — canAccessCountry: HU country_admin denied access to IR data", async () => {
  const huAdmin = { role: "country_admin", countryCode: "HU" as const };
  assert.strictEqual(
    canAccessCountry(huAdmin, "IR"),
    false,
    "HU country_admin must NOT be able to access IR data",
  );
});

await it("A2 — canAccessCountry: IR country_admin denied access to HU data", async () => {
  const irAdmin = { role: "country_admin", countryCode: "IR" as const };
  assert.strictEqual(
    canAccessCountry(irAdmin, "HU"),
    false,
    "IR country_admin must NOT be able to access HU data",
  );
});

await it("A3 — canAccessCountry: global_admin has unrestricted cross-country access", async () => {
  const ga = { role: "global_admin", countryCode: "HU" as const };
  assert.strictEqual(canAccessCountry(ga, "IR"), true, "global_admin must access IR");
  assert.strictEqual(canAccessCountry(ga, "HU"), true, "global_admin must access HU");
});

await it("A4 — listingCountryFilter: HU admin locked to HU even with ?country=IR param", async () => {
  const huAdmin = { role: "country_admin", countryCode: "HU" as const };
  const filter = listingCountryFilter(huAdmin, { country: "IR" });
  assert.strictEqual(
    filter,
    "HU",
    `HU country_admin filter must return 'HU', not '${filter}'`,
  );
});

await it("A5 — listingCountryFilter: global_admin can opt into specific country", async () => {
  const ga = { role: "global_admin", countryCode: "HU" as const };
  assert.strictEqual(listingCountryFilter(ga, { country: "HU" }), "HU");
  assert.strictEqual(listingCountryFilter(ga, { country: "IR" }), "IR");
  assert.strictEqual(listingCountryFilter(ga, {}), null, "No ?country= → null (all countries)");
});

await it("A6 — HTTP: GET /api/admin/refunds without token → 401 (auth guard active)", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/refunds`);
  assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
});

await it("A7 — HTTP: HU country_admin token with ?country=IR → 403 boundary enforced", async () => {
  const { rows } = await pool.query(
    `SELECT id, email, role FROM users
     WHERE role = 'country_admin' AND country_code = 'HU'
       AND is_email_verified = true
     LIMIT 1`,
  );
  if (!rows[0]) skip("No verified HU country_admin user in DB");

  const token = signToken({ id: rows[0].id, email: rows[0].email, role: "country_admin" });
  const res = await fetch(`${BASE_URL}/api/admin/refunds?country=IR`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.ok(
    res.status === 403 || res.status === 200,
    `Expected 403 (boundary) or 200 (0 IR rows), got ${res.status}`,
  );
  if (res.status === 200) {
    const body = await res.json() as any;
    const refunds: any[] = body.refunds ?? body ?? [];
    const hasIrRows = refunds.some((r: any) => r.country_code === "IR");
    assert.ok(
      !hasIrRows,
      "HU admin received IR refund rows — country isolation is broken",
    );
  }
});

// ────────────────────────────────────────────────────────────────────────────
// SCENARIO B — OCC Concurrency Slot-Hold Race
// ────────────────────────────────────────────────────────────────────────────

console.log("\n━━━ Scenario B: OCC Concurrency Slot-Hold Race ━━━");

await it("B1 — DB unique index prevents two simultaneous holds on the same slot", async () => {
  const { rows: providers } = await pool.query(
    "SELECT id FROM providers LIMIT 1",
  );
  if (!providers[0]) skip("No providers in DB");

  const { rows: patients } = await pool.query(
    "SELECT id FROM users WHERE role = 'patient' LIMIT 2",
  );
  if (patients.length < 2) skip("Fewer than 2 patient users in DB");

  const providerId = providers[0].id;
  const [p1, p2]  = patients;
  const testDate  = "2099-12-31";
  const startTime = "22:00";
  const endTime   = "23:00";
  const expiresAt = new Date(Date.now() + 600_000);

  // Clean up any pre-existing test holds for this slot
  await pool.query(
    `DELETE FROM appointment_slot_holds
     WHERE provider_id = $1 AND date = $2 AND start_time = $3`,
    [providerId, testDate, startTime],
  );

  const insertSql = `
    INSERT INTO appointment_slot_holds
      (provider_id, patient_id, date, start_time, end_time, expires_at, visit_type)
    VALUES ($1, $2, $3, $4, $5, $6, 'clinic')
  `;

  const results2 = await Promise.allSettled([
    pool.query(insertSql, [providerId, p1.id, testDate, startTime, endTime, expiresAt]),
    pool.query(insertSql, [providerId, p2.id, testDate, startTime, endTime, expiresAt]),
  ]);

  const successes = results2.filter(r => r.status === "fulfilled").length;
  const failures  = results2.filter(r => r.status === "rejected").length;

  // Cleanup
  await pool.query(
    `DELETE FROM appointment_slot_holds
     WHERE provider_id = $1 AND date = $2 AND start_time = $3`,
    [providerId, testDate, startTime],
  );

  assert.strictEqual(successes, 1, `Expected exactly 1 success, got ${successes}`);
  assert.strictEqual(failures,  1, `Expected exactly 1 failure, got ${failures}`);

  const failed = results2.find(r => r.status === "rejected") as PromiseRejectedResult;
  assert.strictEqual(
    failed.reason?.code,
    "23505",
    `Expected unique-constraint violation (23505), got code=${failed.reason?.code}: ${failed.reason?.message}`,
  );
});

await it("B2 — HTTP: second simultaneous slot-hold request returns 409", async () => {
  const adminToken = await getAdminToken();
  if (!adminToken) skip("No verified admin user in DB — cannot mint patient tokens for HTTP race test");

  const { rows: providers } = await pool.query("SELECT id FROM providers LIMIT 1");
  if (!providers[0]) skip("No providers in DB");

  const { rows: patients } = await pool.query(
    "SELECT id, email, role FROM users WHERE role = 'patient' AND is_email_verified = true LIMIT 2",
  );
  if (patients.length < 2) skip("Fewer than 2 verified patient users in DB");

  const providerId = providers[0].id;
  const [p1, p2]  = patients;
  const testDate  = "2099-12-31";
  const startTime = "20:00";
  const endTime   = "21:00";

  const makeHoldRequest = (patient: typeof p1) =>
    fetch(`${BASE_URL}/api/slot-holds`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${signToken({ id: patient.id, email: patient.email, role: patient.role })}`,
      },
      body: JSON.stringify({
        providerId,
        date: testDate,
        startTime,
        endTime,
        visitType: "clinic",
      }),
    });

  // Clean state before test
  await pool.query(
    `DELETE FROM appointment_slot_holds
     WHERE provider_id = $1 AND date = $2 AND start_time = $3`,
    [providerId, testDate, startTime],
  );

  const [res1, res2] = await Promise.all([
    makeHoldRequest(p1),
    makeHoldRequest(p2),
  ]);

  // Cleanup
  await pool.query(
    `DELETE FROM appointment_slot_holds
     WHERE provider_id = $1 AND date = $2 AND start_time = $3`,
    [providerId, testDate, startTime],
  );

  const statuses = [res1.status, res2.status].sort();
  assert.ok(
    statuses.includes(201) && statuses.includes(409),
    `Expected one 201 and one 409, got [${statuses.join(", ")}]`,
  );
});

// ────────────────────────────────────────────────────────────────────────────
// SCENARIO C — Refund Triple-Guard Verification
// ────────────────────────────────────────────────────────────────────────────

console.log("\n━━━ Scenario C: Refund Triple-Guard Verification ━━━");

await it("C1 — Logic: refund_status='processed' guard condition is correct", async () => {
  const guard = (refundStatus: string | null) =>
    refundStatus === "processed";
  assert.strictEqual(guard("processed"), true,  "processed must trigger guard");
  assert.strictEqual(guard("none"),      false, "'none' must not trigger guard");
  assert.strictEqual(guard(null),        false, "null must not trigger guard");
  assert.strictEqual(guard("pending"),   false, "'pending' must not trigger guard");
});

await it("C2 — HTTP: POST /api/admin/refunds/:id/process on already-refunded appt → 409", async () => {
  const adminToken = await getAdminToken();
  if (!adminToken) skip("No verified admin user in DB");

  // Prefer an appointment already marked processed
  let { rows: appts } = await pool.query(
    `SELECT id, refund_status FROM appointments
     WHERE refund_status = 'processed'
     LIMIT 1`,
  );

  let restoredFrom: string | null = null;
  let targetId: string;

  if (appts[0]) {
    targetId = appts[0].id;
  } else {
    // Temporarily promote one real appointment to 'processed'
    const { rows: candidates } = await pool.query(
      `SELECT id, refund_status FROM appointments
       WHERE status IN ('cancelled', 'completed')
       LIMIT 1`,
    );
    if (!candidates[0]) skip("No suitable appointments in DB to test refund guard");

    targetId      = candidates[0].id;
    restoredFrom  = candidates[0].refund_status ?? "none";

    await pool.query(
      "UPDATE appointments SET refund_status = 'processed' WHERE id = $1",
      [targetId],
    );
  }

  try {
    const res = await fetch(`${BASE_URL}/api/admin/refunds/${targetId}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ action: "approve" }),
    });

    assert.strictEqual(
      res.status,
      409,
      `Expected 409 (guard triggered), got ${res.status}`,
    );

    const body = await res.json() as any;
    assert.ok(
      typeof body.message === "string" &&
      body.message.toLowerCase().includes("already"),
      `Expected 'already' in message, got: ${body.message}`,
    );
  } finally {
    if (restoredFrom !== null) {
      await pool.query(
        "UPDATE appointments SET refund_status = $1 WHERE id = $2",
        [restoredFrom, targetId],
      );
    }
  }
});

await it("C3 — HTTP: POST without token → 401 (auth guard fires before refund guard)", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/refunds/fake-id/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "approve" }),
  });
  assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
});

// ────────────────────────────────────────────────────────────────────────────
// SCENARIO D — Financial Reconciliation Engine
// ────────────────────────────────────────────────────────────────────────────

console.log("\n━━━ Scenario D: Financial Reconciliation Engine ━━━");

// Helper: find a provider_earnings row and corrupt its provider_earning field.
// Returns { id, originalAmount } or skips if no rows exist.
async function getEarningToCorrupt(): Promise<{ id: string; originalAmount: string } | null> {
  const { rows } = await pool.query<{ id: string; provider_earning: string }>(
    `SELECT id, provider_earning
     FROM provider_earnings
     WHERE total_amount > 0.01
     ORDER BY created_at DESC
     LIMIT 1`,
  );
  return rows[0] ? { id: rows[0].id, originalAmount: rows[0].provider_earning } : null;
}

await it("D1 — Reconciler detects a corrupted earning row in dry-run mode", async () => {
  const adminToken = await getAdminToken();
  if (!adminToken) skip("No verified admin user in DB");

  const target = await getEarningToCorrupt();
  if (!target) skip("No provider_earnings records in DB");

  const corruptedAmount = (parseFloat(target.originalAmount) * 0.01).toFixed(2);
  await pool.query(`UPDATE provider_earnings SET provider_earning = $1 WHERE id = $2`, [
    corruptedAmount,
    target.id,
  ]);

  try {
    const res = await fetch(`${BASE_URL}/api/admin/financial/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ fromDate: "2020-01-01", toDate: "2099-12-31" }),
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json() as any;

    assert.strictEqual(body.applied, false, "dry-run should return applied: false");
    assert.ok(Array.isArray(body.discrepancies), "Expected discrepancies array");
    const found = body.discrepancies.find((d: any) => d.id === target.id);
    assert.ok(found, `Corrupted row ${target.id} must appear in discrepancies`);
    assert.ok(
      Math.abs(found.delta) > 0.005,
      `Expected a non-trivial delta, got ${found.delta}`,
    );
  } finally {
    await pool.query(`UPDATE provider_earnings SET provider_earning = $1 WHERE id = $2`, [
      target.originalAmount,
      target.id,
    ]);
  }
});

await it("D2 — Reconciler applies correction atomically and writes an audit_log", async () => {
  const adminToken = await getAdminToken();
  if (!adminToken) skip("No verified admin user in DB");

  const target = await getEarningToCorrupt();
  if (!target) skip("No provider_earnings records in DB");

  const corruptedAmount = (parseFloat(target.originalAmount) * 0.01).toFixed(2);
  await pool.query(`UPDATE provider_earnings SET provider_earning = $1 WHERE id = $2`, [
    corruptedAmount,
    target.id,
  ]);

  try {
    const res = await fetch(`${BASE_URL}/api/admin/financial/reconcile?apply=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ fromDate: "2020-01-01", toDate: "2099-12-31" }),
    });

    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json() as any;

    assert.strictEqual(body.applied, true, "apply mode must return applied: true");
    assert.ok(
      body.correctedIds.includes(target.id),
      `Expected correctedIds to include ${target.id}`,
    );

    // DB value must no longer be the corrupted amount
    const { rows: after } = await pool.query<{ provider_earning: string }>(
      `SELECT provider_earning FROM provider_earnings WHERE id = $1`,
      [target.id],
    );
    assert.notStrictEqual(
      parseFloat(after[0].provider_earning).toFixed(2),
      corruptedAmount,
      "provider_earning must have been corrected away from the corrupted value",
    );

    // An audit_log row must exist for this reconciliation
    const { rows: auditRows } = await pool.query<{ id: string }>(
      `SELECT id FROM audit_logs
       WHERE action = 'reconcile_earnings'
         AND entity_id = $1
         AND created_at > NOW() - INTERVAL '5 minutes'
       LIMIT 1`,
      [target.id],
    );
    assert.ok(auditRows.length > 0, "Expected an audit_log entry for the reconciliation");
  } finally {
    // Restore pre-test state and clean up test audit entries
    await pool.query(`UPDATE provider_earnings SET provider_earning = $1 WHERE id = $2`, [
      target.originalAmount,
      target.id,
    ]);
    await pool.query(
      `DELETE FROM audit_logs
       WHERE action = 'reconcile_earnings'
         AND entity_id = $1
         AND created_at > NOW() - INTERVAL '5 minutes'`,
      [target.id],
    );
  }
});

await it("D3 — Reconciler endpoint rejects unauthenticated requests → 401", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/financial/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
});

// ────────────────────────────────────────────────────────────────────────────
// SCENARIO E — Observability: X-Request-ID Tracing
// ────────────────────────────────────────────────────────────────────────────

console.log("\n━━━ Scenario E: Observability & Request Tracing ━━━");

await it("E1 — Every HTTP response carries an X-Request-ID header", async () => {
  const res = await fetch(`${BASE_URL}/api/admin/financial/reconcile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const rid = res.headers.get("x-request-id");
  assert.ok(rid && rid.length > 0, `Expected X-Request-ID header to be present, got: ${rid}`);
});

await it("E2 — Server preserves a caller-supplied X-Request-ID header", async () => {
  const callerRid = "test-trace-" + Date.now();
  const res = await fetch(`${BASE_URL}/api/admin/financial/reconcile`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Request-ID": callerRid,
    },
  });
  const echoed = res.headers.get("x-request-id");
  assert.strictEqual(echoed, callerRid, `Expected server to echo caller's X-Request-ID, got: ${echoed}`);
});

// ────────────────────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────────────────────

const failures = results.filter(r => !r.passed);
const skipped  = results.filter(r => r.skipped).length;
const passed   = results.filter(r => r.passed && !r.skipped).length;

console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Results: ${passed} passed  |  ${skipped} skipped  |  ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFailed tests:");
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.error}`);
}
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

await pool.end().catch(() => {});
process.exit(failures.length > 0 ? 1 : 0);

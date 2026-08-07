/**
 * Pure Phase 1.1 regression checks. No database or running server required.
 *
 * Run:
 *   npx tsx server/tests/phase1-foundation-unit.test.ts
 */

import assert from "node:assert/strict";
import {
  PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES,
  PROVIDER_LEDGER_INFORMATIONAL_TYPES,
  providerLedgerNetAmount,
  providerLedgerTypePlaceholders,
} from "../lib/provider-ledger";
import {
  getReadiness,
  markListening,
  markReady,
  markReadinessFailed,
} from "../lib/readiness";
import { scheduler } from "../lib/scheduler";

assert.equal(providerLedgerNetAmount("booking_income", 10), 10);
assert.equal(providerLedgerNetAmount("payout_held", -3.5), -3.5);
assert.equal(providerLedgerNetAmount("tax_deduction", -1620), 0);
assert.equal(providerLedgerNetAmount("platform_fee_deduction", -5.06), 0);
assert.equal(
  providerLedgerTypePlaceholders(),
  PROVIDER_LEDGER_BALANCE_AFFECTING_TYPES.map((_, index) => `$${index + 1}`).join(", "),
);
assert.ok(PROVIDER_LEDGER_INFORMATIONAL_TYPES.includes("tax_deduction"));

assert.equal(getReadiness().status, "starting");
markListening();
assert.equal(getReadiness().status, "migrating");
markReady();
assert.equal(getReadiness().status, "ready");
markReadinessFailed(new Error("fixture failure"));
assert.equal(getReadiness().status, "failed");
assert.equal(getReadiness().error, "fixture failure");

const name = `phase1-test-${Date.now()}`;
scheduler.register({
  name,
  intervalMs: 60_000,
  fn: async () => 0,
});
assert.ok(scheduler.getRegisteredJobs().includes(name));
scheduler.shutdown();
assert.deepEqual(scheduler.getRegisteredJobs(), []);

console.log("Phase 1 foundation unit tests passed");
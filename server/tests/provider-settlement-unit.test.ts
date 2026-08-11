/**
 * Pure settlement regression tests.
 *
 * Run with:
 *   npx tsx server/tests/provider-settlement-unit.test.ts
 */

import assert from "node:assert/strict";
import {
  calculateProviderSettlement,
  OFFLINE_PAYMENT_METHODS,
} from "../lib/provider-settlement";

const rates = { HUF: 10, IRR: 500_000, USD: 1 };

function settlement(paymentMethod: string) {
  return calculateProviderSettlement({
    providerNetEarningsLocal: 100,
    serviceTaxLocal: 20,
    platformFeeLocal: 15,
    paymentMethod,
    bookingCurrency: "USD",
    rates,
  });
}

const card = settlement("card");
assert.equal(card.grossProviderPayoutUsd, 100, "card gross includes tax");
assert.equal(card.providerPayoutUsd, 100, "card payout does not deduct platform fee");
assert.equal(card.cashPlatformFeeDeductionUsd, 0, "card has no deferred cash fee");

const cash = settlement("cash");
assert.equal(cash.grossProviderPayoutUsd, 100, "cash gross includes tax");
assert.equal(cash.providerPayoutUsd, 0, "cash has no withdrawable payout");
assert.equal(cash.cashPlatformFeeDeductionUsd, 15, "cash fee is tracked separately");

const bankTransfer = settlement("bank_transfer");
assert.equal(bankTransfer.providerPayoutUsd, 0, "bank transfer has no withdrawable payout");
assert.ok(OFFLINE_PAYMENT_METHODS.has("cash"), "cash is an offline method");
assert.ok(OFFLINE_PAYMENT_METHODS.has("bank_transfer"), "bank transfer is an offline method");

const unknown = settlement("unknown");
assert.equal(unknown.providerPayoutUsd, 100, "unknown methods default to card behavior");

console.log("Provider settlement unit tests passed");
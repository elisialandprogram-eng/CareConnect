import assert from "node:assert/strict";
import {
  formatCurrencyAmount,
  roundCurrencyAmount,
} from "@shared/currency";
import { roundBookingAmount, roundToCents } from "../lib/math";

assert.equal(roundCurrencyAmount(950 * 0.27, "HUF"), 257);
assert.equal(roundBookingAmount(256.5, "HUF"), 257);
assert.equal(roundBookingAmount(256.5, "IRR"), 257);
assert.equal(roundBookingAmount(256.5, "JPY"), 257);
assert.equal(roundBookingAmount(256.5, "KRW"), 257);
assert.equal(roundBookingAmount(1.005, "USD"), 1.01);
assert.equal(roundToCents(1.005), 101);

assert.match(formatCurrencyAmount(256.5, "HUF"), /257/);
for (const currency of ["IRR", "JPY", "KRW"] as const) {
  assert.notEqual(
    formatCurrencyAmount(256.5, currency),
    formatCurrencyAmount(256.4, currency),
    `${currency} formatter must round at the zero-decimal boundary`,
  );
}

console.log("Canonical currency rounding tests passed");
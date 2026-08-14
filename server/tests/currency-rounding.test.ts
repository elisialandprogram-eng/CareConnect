import assert from "node:assert/strict";
import {
  formatCurrencyAmount,
  formatCurrencyMinorUnits,
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
assert.equal(roundCurrencyAmount(-256.5, "HUF"), -257);

assert.match(formatCurrencyAmount(256.5, "HUF"), /257/);
for (const currency of ["HUF", "IRR", "JPY", "KRW"] as const) {
  assert.equal(roundCurrencyAmount(256.5, currency), 257, `${currency} uses half-up zero-decimal rounding`);
  assert.match(formatCurrencyAmount(256.5, currency), /257|۲۵۷|￥257|₩257/);
}
assert.match(formatCurrencyMinorUnits(257, "HUF"), /257/);
assert.match(formatCurrencyMinorUnits(257, "USD"), /\$2\.57/);

console.log("Canonical currency rounding tests passed");
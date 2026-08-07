/**
 * Phase 3.1 canonical tax-engine regression tests.
 *
 * Run with:
 *   npx tsx server/tests/phase31-tax-engine.test.ts
 */

import assert from "node:assert/strict";
import { calculateTaxBreakdown } from "../lib/tax-engine";
import { runRevenueEngineSync, type RevenueRuleSet } from "../lib/revenue-engine";

const noRevenueRules: RevenueRuleSet = {
  platformFeeRules: [],
  commissionRules: [],
  paymentMethodRules: [],
  travelFeeRules: [],
  revenueShareRules: [],
};

const service = {
  price: 100,
  duration: 60,
  platformFeeOverride: 10,
  homeVisitFee: 20,
  clinicFee: 0,
  telemedicineFee: 0,
  emergencyFee: 5,
};

const hu = runRevenueEngineSync({
  service,
  subServiceId: "sub-1",
  visitType: "home",
  isEmergency: true,
  bookingCurrency: "USD",
  providerCurrency: "USD",
  countryCode: "HU",
  _preloaded: noRevenueRules,
  _taxRules: {
    serviceRule: {
      id: "svc-hu",
      subServiceId: "sub-1",
      countryCode: "HU",
      taxRate: 27,
      isActive: true,
    },
    platformRule: {
      id: "platform-hu",
      countryCode: "HU",
      taxRate: 5,
      isActive: true,
    },
  },
});

assert.equal(hu.taxBreakdown.serviceTaxableSubtotal, 125, "home/emergency fees are service-taxable");
assert.equal(hu.taxBreakdown.platformTaxableSubtotal, 10, "platform fee is isolated from service tax");
assert.equal(hu.taxBreakdown.serviceTax, 33.75, "Hungary service rate is applied");
assert.equal(hu.taxBreakdown.platformTax, 0.5, "Hungary platform rate is applied separately");
assert.equal(hu.tax, 34.25, "total tax is the sum of both domains");

const ir = runRevenueEngineSync({
  service,
  subServiceId: "sub-1",
  visitType: "home",
  isEmergency: true,
  bookingCurrency: "USD",
  providerCurrency: "USD",
  countryCode: "IR",
  _preloaded: noRevenueRules,
  _taxRules: {
    serviceRule: {
      id: "svc-ir",
      subServiceId: "sub-1",
      countryCode: "IR",
      taxRate: 9,
      isActive: true,
    },
    platformRule: {
      id: "platform-ir",
      countryCode: "IR",
      taxRate: 5,
      isActive: true,
    },
  },
});

assert.equal(ir.taxBreakdown.serviceTax, 11.25, "Iran service rate is selected by country");
assert.equal(ir.taxBreakdown.platformTax, 0.5, "Iran platform rate is selected by country");
assert.notEqual(ir.tax, hu.tax, "one country's tax rule never leaks into another");

const missing = runRevenueEngineSync({
  service,
  subServiceId: "sub-missing",
  visitType: "clinic",
  bookingCurrency: "USD",
  providerCurrency: "USD",
  countryCode: "HU",
  _preloaded: noRevenueRules,
  _taxRules: {},
});
assert.equal(missing.tax, 0, "missing rules resolve deterministically to zero tax");

const platformOnly = calculateTaxBreakdown({
  serviceSubtotal: 100,
  platformSubtotal: 20,
  serviceTaxRatePercent: 0,
  platformTaxRatePercent: 5,
});
assert.equal(platformOnly.serviceTax, 0, "zero-tax services remain untaxed");
assert.equal(platformOnly.platformTax, 1, "platform-only tax does not tax provider charges");

const discounted = calculateTaxBreakdown({
  serviceSubtotal: 100,
  platformSubtotal: 20,
  discount: 12,
  serviceTaxRatePercent: 10,
  platformTaxRatePercent: 5,
});
assert.equal(discounted.serviceTaxableSubtotal, 90, "discount is allocated proportionally");
assert.equal(discounted.platformTaxableSubtotal, 18, "discount allocation is deterministic");
assert.equal(discounted.totalTax, 9.9, "discounted service and platform taxes are both rounded once");

console.log("Phase 3.1 canonical tax engine tests passed");
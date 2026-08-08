/**
 * Phase 3 canonical pricing regression tests.
 *
 * Run with:
 *   npx tsx server/tests/phase3-pricing-engine.test.ts
 */

import assert from "node:assert/strict";
import { runRevenueEngineSync, type RevenueRuleSet } from "../lib/revenue-engine";

const rules: RevenueRuleSet = {
  platformFeeRules: [{
    id: "pf",
    name: "Platform percentage",
    enabled: true,
    priority: 1,
    feeType: "percent",
    percentValue: "10",
    fixedAmount: "0",
    countryCode: null,
    providerType: null,
    serviceCategory: null,
    targetScope: "global",
  }] as any,
  commissionRules: [{
    id: "commission",
    name: "Provider commission",
    enabled: true,
    priority: 1,
    commissionPercent: "20",
    countryCode: null,
    providerType: null,
    serviceCategory: null,
  }] as any,
  paymentMethodRules: [{
    id: "card",
    paymentMethod: "card",
    enabled: true,
    maintenanceMode: false,
    surchargeType: "none",
    surchargeValue: "0",
    discountType: "none",
    discountValue: "0",
    priority: 1,
  }] as any,
  travelFeeRules: [{
    id: "travel",
    name: "Home travel",
    enabled: true,
    priority: 1,
    feeType: "distance",
    perKmRate: "2",
    flatAmount: "0",
    countryCode: null,
    providerType: null,
  }] as any,
  revenueShareRules: [],
};

const baseInput = {
  service: {
    price: 100,
    duration: 60,
    platformFeeOverride: null,
    homeVisitFee: 0,
    clinicFee: 0,
    telemedicineFee: 0,
    emergencyFee: 15,
  },
  visitType: "home" as const,
  travelDistanceKm: 5,
  paymentMethod: "card",
  bookingCurrency: "USD",
  providerCurrency: "USD",
  rates: { USD: 1 },
  countryCode: "HU",
  providerType: "physician",
  serviceCategory: "physician",
  _preloaded: rules,
};

const standard = runRevenueEngineSync(baseInput);
assert.equal(standard.base, 100, "base service price is canonical");
assert.equal(standard.tax, 0, "no tax is applied without a tax rate");
assert.equal(standard.engineTravelFee, 10, "distance travel fee is included once");
assert.equal(standard.commissionAmount, 20, "commission is calculated from the base");
assert.equal(standard.providerEarnings, 80, "provider earnings are snapshotted");
assert.equal(standard.patientPayable, 120, "patient payable includes platform fee and travel");
assert.equal(standard.finalTotalUsd, 120, "USD reporting equals payable in USD");
assert.equal(standard.pricingEngineVersion, "pricing-v3");
assert.equal(standard.taxEngineVersion, "tax-v2");
assert.ok(standard.pricingCalculatedAt, "calculation timestamp is present");

const membership = runRevenueEngineSync({
  ...baseInput,
  visitType: "clinic",
  membershipDiscount: {
    serviceDiscountPercent: 10,
    platformFeeDiscount: 50,
    label: "Member",
    userPackageId: "pkg-1",
  },
});
assert.equal(membership.membershipDiscount, 10, "membership discount is applied once");
assert.equal(membership.base, 100, "snapshot retains the undiscounted base");

const coupon = runRevenueEngineSync({
  ...baseInput,
  visitType: "clinic",
  discount: { type: "percent", value: 10, code: "SAVE10" },
});
assert.equal(coupon.discount, 10, "coupon discount is part of the snapshot");
assert.equal(coupon.patientPayable, 100, "coupon changes the canonical payable before platform fee");

const taxed = runRevenueEngineSync({
  ...baseInput,
  visitType: "clinic",
  _taxRules: {
    platformRule: {
      id: "platform-hu",
      countryCode: "HU",
      taxRate: 15,
      isActive: true,
    },
  },
});
assert.equal(taxed.tax, 1.5, "global tax applies only to the platform charge");
assert.equal(taxed.patientPayable, 111.5, "platform tax is included in the final payable");

const huf = runRevenueEngineSync({
  ...baseInput,
  visitType: "clinic",
  bookingCurrency: "HUF",
  providerCurrency: "HUF",
  rates: { USD: 1, HUF: 365 },
  service: { ...baseInput.service, price: 36500 },
});
assert.equal(huf.bookingCurrency, "HUF");
assert.equal(huf.finalTotalUsd, 110, "local booking amount converts once for USD reporting");

console.log("Phase 3 canonical pricing engine tests passed");
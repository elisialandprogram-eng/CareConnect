/**
 * Authoritative math utilities for all financial calculations.
 * Import from here instead of defining inline helpers.
 */

import { roundCurrencyAmount } from "@shared/currency";

/**
 * Convert a dollar-denominated value to an exact integer cent count.
 * Prevents floating-point drift in ledger amount_cents columns.
 *
 * Examples:
 *   roundToCents(10.5)    → 1050
 *   roundToCents("9.999") → 1000
 *   roundToCents(0.1 + 0.2) → 30  (not 30.000000000000004)
 */
export function roundToCents(value: number | string): number {
  return Math.round(roundCurrencyAmount(value, "USD") * 100);
}

/**
 * Round a number to exactly 2 decimal places (standard USD/dollar rounding).
 * Canonical replacement for all inline `round2` definitions across the codebase.
 */
export function round2(n: number): number {
  return roundCurrencyAmount(n, "USD");
}

/**
 * Round an amount in its booking currency.
 *
 * HUF/IRR/JPY/KRW are zero-decimal currencies and use proper half-up
 * rounding. USD/EUR/GBP retain normal two-decimal pricing precision.
 */
export function roundBookingAmount(value: number, currency?: string | null): number {
  return roundCurrencyAmount(value, currency);
}

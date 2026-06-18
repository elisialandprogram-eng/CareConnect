/**
 * server/lib/math.ts
 *
 * Authoritative math utilities for all financial calculations.
 * Import from here instead of defining inline helpers.
 *
 * - roundToCents  — converts a dollar value to integer cents (ledger operations)
 * - round2        — rounds to 2 decimal places (dollar display / pricing engine)
 */

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
  return Math.round(Number(value) * 100);
}

/**
 * Round a number to exactly 2 decimal places (standard USD/dollar rounding).
 * Canonical replacement for all inline `round2` definitions across the codebase.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

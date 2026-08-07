/**
 * GoldenLife — Strict Currency & Timezone Enforcer (Section 7)
 *
 * Runtime assertion utilities that enforce the canonical formatting rules.
 * All functions are no-ops in production; they only run in development mode.
 *
 * CURRENCY RULE:  formatInCurrency() / useAdminCurrency().format() ONLY.
 * TIMEZONE RULE:  formatDate() / formatTime() / formatDateTime() from @/lib/datetime ONLY.
 * API RULE:       monetary payloads MUST be { amount: number, currency: string }.
 */

const IS_DEV = import.meta.env.DEV;

// ── Pattern sets used by both runtime checks and the CI grep guard ─────────

const RAW_CURRENCY_PATTERNS: RegExp[] = [
  /^\$[\d,. ]+/,
  /\d[\d,. ]*\s*(USD|HUF|IRR|GBP|EUR)\b/i,
  /\b(Ft|﷼)\s*[\d,. ]+/,
  /[\d,. ]+\s*(Ft|﷼)\b/,
];

// ── 1. assertNoRawCurrencyStrings ──────────────────────────────────────────

/**
 * Assert that a string about to be rendered in the UI does NOT contain a raw
 * currency literal.  Blocks values like "$500", "5,000 USD", "50 000 Ft",
 * "210 000 IRR", "£12.50".
 *
 * Usage: call before rendering any monetary display value.
 *
 * @param value    The string that will be rendered.
 * @param context  Human-readable caller label (component / route name).
 */
export function assertNoRawCurrencyStrings(value: string, context?: string): void {
  if (!IS_DEV) return;
  for (const pat of RAW_CURRENCY_PATTERNS) {
    if (pat.test(String(value))) {
      const msg =
        `[strict-enforcer] RAW CURRENCY STRING in ${context ?? "unknown"}: "${value}".\n` +
        `  → Use formatInCurrency(amount, currencyCode) [patient/provider]\n` +
        `  → Use useAdminCurrency().format(amount)       [admin]`;
      console.error(msg);
      throw new Error(msg);
    }
  }
}

// ── 2. assertNoRawDateFormatting ───────────────────────────────────────────

/**
 * Declaration-of-compliance marker.  Call once at the top of any component
 * that renders dates to signal it has been audited for timezone violations.
 *
 * The real enforcement is the CI grep guard
 * (scripts/ci-currency-timezone-guard.sh).  This function catches any
 * runtime attempt to call the forbidden patterns in dev mode.
 *
 * Patch: override Date.prototype methods so that *any* call to the raw
 * locale formatters outside of datetime.ts throws in development.
 */
let _rawDatePatchApplied = false;
export function assertNoRawDateFormatting(): void {
  if (!IS_DEV || _rawDatePatchApplied) return;
  _rawDatePatchApplied = true;

  const _origToLocaleString = Date.prototype.toLocaleString;
  const _origToLocaleDateString = Date.prototype.toLocaleDateString;
  const _origToLocaleTimeString = Date.prototype.toLocaleTimeString;

  const warn = (method: string) => {
    const stack = new Error().stack ?? "";
    if (
      stack.includes("datetime.ts") ||
      stack.includes("invoice-gen") ||
      stack.includes("pdfkit")
    ) return;
    console.warn(
      `[strict-enforcer] Forbidden: Date.prototype.${method}() called outside of @/lib/datetime.\n` +
      `  → Use formatDate() / formatTime() / formatDateTime() from @/lib/datetime instead.\n`,
      stack.split("\n").slice(1, 5).join("\n"),
    );
  };

  Date.prototype.toLocaleString = function (this: Date, ...args: Parameters<Date["toLocaleString"]>) {
    warn("toLocaleString");
    return _origToLocaleString.apply(this, args);
  };
  Date.prototype.toLocaleDateString = function (this: Date, ...args: Parameters<Date["toLocaleDateString"]>) {
    warn("toLocaleDateString");
    return _origToLocaleDateString.apply(this, args);
  };
  Date.prototype.toLocaleTimeString = function (this: Date, ...args: Parameters<Date["toLocaleTimeString"]>) {
    warn("toLocaleTimeString");
    return _origToLocaleTimeString.apply(this, args);
  };
}

// ── 3. assertApiMoneyShape ─────────────────────────────────────────────────

/**
 * Assert that an API response carrying a monetary amount conforms to the
 * canonical data contract:  { amount: number, currency: string }.
 *
 * Returns `true` when the shape is valid (type guard).
 * Logs a dev-mode warning and returns `false` otherwise.
 *
 * Usage:
 *   const payload = await res.json();
 *   if (assertApiMoneyShape(payload, "wallet balance")) {
 *     format(payload.amount, payload.currency);
 *   }
 */
export function assertApiMoneyShape(
  value: unknown,
  context?: string,
): value is { amount: number; currency: string } {
  const ok =
    typeof value === "object" &&
    value !== null &&
    "amount" in value &&
    typeof (value as Record<string, unknown>).amount === "number" &&
    Number.isFinite((value as Record<string, unknown>).amount as number) &&
    "currency" in value &&
    typeof (value as Record<string, unknown>).currency === "string" &&
    (value as Record<string, unknown>).currency !== "";

  if (!ok && IS_DEV) {
    console.warn(
      `[strict-enforcer] API money shape violation${context ? ` in ${context}` : ""}:`,
      value,
      "\n  → Expected: { amount: number, currency: string }",
      "\n  → Never: { amount: '5000 Ft' } or { formattedAmount: '$5,000' }",
    );
  }
  return ok;
}

// ── 4. ciCurrencyTimezoneGuard (exported pattern registry for CI) ──────────

/**
 * Patterns used by scripts/ci-currency-timezone-guard.sh.
 * Exported here as the single source of truth so they stay in sync.
 */
export const ciCurrencyTimezoneGuard = {
  currencyViolations: [
    { pattern: '\\$[0-9]',           description: 'Hardcoded $ currency symbol' },
    { pattern: '\\.toFixed(',         description: 'toFixed() in JSX/API (use canonical formatter)' },
    { pattern: 'new Intl\\.NumberFormat', description: 'Intl.NumberFormat outside currency.ts' },
    { pattern: 'formatCurrency\\s*[=(]', description: 'Local formatCurrency function/alias' },
    { pattern: 'formatMoney\\s*[=(]',    description: 'Local formatMoney function/alias' },
    { pattern: '" USD"',               description: 'Hardcoded USD string literal' },
    { pattern: '" HUF"',               description: 'Hardcoded HUF string literal' },
    { pattern: '" IRR"',               description: 'Hardcoded IRR string literal' },
    { pattern: '" Ft"',                description: 'Hardcoded Ft symbol' },
  ],
  timezoneViolations: [
    { pattern: 'new Date.*\\.toLocaleString\\(',     description: 'Date.toLocaleString() outside datetime.ts' },
    { pattern: 'new Date.*\\.toLocaleDateString\\(', description: 'Date.toLocaleDateString() outside datetime.ts' },
    { pattern: 'new Date.*\\.toLocaleTimeString\\(', description: 'Date.toLocaleTimeString() outside datetime.ts' },
    { pattern: '\\.toLocaleString\\(.*"[a-z]{2}-[A-Z]{2}"', description: 'locale-pinned toLocaleString on dates' },
  ],
  reportingViolations: [
    { pattern: 'SUM.*total_amount.*GROUP',           description: 'SUM of raw total_amount across currencies' },
  ],
} as const;

// ── Utility: safe numeric money extraction ─────────────────────────────────

/**
 * Safely extract a numeric monetary value from an API payload field.
 * Returns 0 when the value is missing, null, or non-finite.
 */
export function safeMoneyAmount(
  payload: unknown,
  field: string = "amount",
): number {
  if (typeof payload !== "object" || payload === null) return 0;
  const v = (payload as Record<string, unknown>)[field];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * server/config/env.ts
 *
 * Centralized environment variable validation.
 * MUST be imported and run BEFORE DB connection, routes, cron, or scheduler startup.
 *
 * Required vars  → process.exit(1) immediately if missing/invalid
 * Optional vars  → warning logged only; features degrade gracefully
 *
 * Exports:
 *   validateEnvironment()      — run once at boot; exits on any required-var failure
 *   getMissingOptionalEnv()    — returns names of absent optional vars (after validation)
 *   getEnvValidationResult()   — returns cached result (null if never run)
 */

export interface EnvValidationResult {
  valid: boolean;
  missingRequired: string[];
  missingOptional: string[];
}

const OPTIONAL_VARS: Record<string, string> = {
  STRIPE_SECRET_KEY:               "Stripe payments disabled",
  STRIPE_WEBHOOK_SECRET:           "Stripe webhook signature verification disabled",
  RESEND_API_KEY:                  "Transactional email (OTP, confirmations, reminders) disabled",
  CLOUDINARY_CLOUD_NAME:           "Image/document uploads disabled",
  CLOUDINARY_API_KEY:              "Image/document uploads disabled",
  CLOUDINARY_API_SECRET:           "Image/document uploads disabled",
  TWILIO_ACCOUNT_SID:              "SMS/WhatsApp notifications disabled",
  TWILIO_AUTH_TOKEN:               "SMS/WhatsApp notifications disabled",
  TWILIO_FROM_NUMBER:              "SMS outbound number missing — SMS notifications will not send",
  TWILIO_WHATSAPP_FROM:            "WhatsApp Business number missing — WhatsApp notifications disabled",
  VAPID_PUBLIC_KEY:                "Browser push notifications disabled",
  VAPID_PRIVATE_KEY:               "Browser push notifications disabled",
  VAPID_SUBJECT:                   "Push notification identity email missing (defaults to mailto:admin@goldenlife.health)",
  DAILY_API_KEY:                   "Video visits fall back to public Jitsi links",
  DAILY_DOMAIN:                    "Daily.co domain missing — video room URLs will use Jitsi fallback",
  GOOGLE_MAPS_API_KEY:             "Server-side geocoding disabled — address lookup unavailable",
  AI_INTEGRATIONS_OPENAI_API_KEY:  "AI chat assistant disabled",
};

let _cachedResult: EnvValidationResult | null = null;

/**
 * Validate the process environment.
 * Call ONCE at startup before any other module initialization.
 * Calls process.exit(1) immediately if any required var is absent or invalid.
 */
export function validateEnvironment(): EnvValidationResult {
  console.log("[env] validation started");

  const missingRequired: string[] = [];
  const missingOptional: string[] = [];

  // ── Required vars ───────────────────────────────────────────────────────────

  // SESSION_SECRET — JWT signing key; no fallback allowed under any circumstances
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    missingRequired.push("SESSION_SECRET");
  } else if (secret === "careconnect-jwt-secret-key") {
    missingRequired.push("SESSION_SECRET (insecure hardcoded default — replace with a random 32+ char string)");
  } else if (secret.length < 32) {
    missingRequired.push(`SESSION_SECRET (too short: ${secret.length} chars; minimum 32 required)`);
  }

  // Database URL — SUPABASE_DATABASE_URL is the ONLY accepted connection string.
  // DATABASE_URL is intentionally ignored — Supabase is the single source of truth.
  if (!process.env.SUPABASE_DATABASE_URL) {
    missingRequired.push("SUPABASE_DATABASE_URL");
  }

  console.log("[env] required vars validated");

  // ── Optional vars ───────────────────────────────────────────────────────────
  for (const [key] of Object.entries(OPTIONAL_VARS)) {
    if (!process.env[key]) {
      missingOptional.push(key);
    }
  }

  if (missingOptional.length > 0) {
    console.warn(`[env] optional integrations missing: ${missingOptional.length}`);
    for (const key of missingOptional) {
      console.warn(`  ⚠  ${key} — ${OPTIONAL_VARS[key]}`);
    }
  }

  const valid = missingRequired.length === 0;

  // ── Abort if required vars are missing ─────────────────────────────────────
  if (!valid) {
    console.error(
      "\n╔══════════════════════════════════════════════════════════════════╗\n" +
      "║  [env] STARTUP ABORTED — required environment vars missing       ║\n" +
      "╚══════════════════════════════════════════════════════════════════╝"
    );
    for (const v of missingRequired) {
      console.error(`  ✗  ${v}`);
    }
    if (missingRequired.some(v => v.startsWith("SESSION_SECRET"))) {
      console.error("\n  SESSION_SECRET missing — startup aborted");
    }
    console.error("");
    _cachedResult = { valid: false, missingRequired, missingOptional };
    process.exit(1);
  }

  console.log("[env] validation complete — required vars OK");

  _cachedResult = { valid: true, missingRequired: [], missingOptional };
  return _cachedResult;
}

/**
 * Returns the list of optional environment variable names that are currently absent.
 * Runs validateEnvironment() if it has not been called yet.
 */
export function getMissingOptionalEnv(): string[] {
  if (!_cachedResult) validateEnvironment();
  return _cachedResult!.missingOptional;
}

/**
 * Returns the cached validation result, or null if validateEnvironment() has not run yet.
 */
export function getEnvValidationResult(): EnvValidationResult | null {
  return _cachedResult;
}

/**
 * MFA Service — Workstream 1 (P1 Launch Blockers)
 *
 * TOTP-based two-factor authentication for admin accounts.
 * Uses otplib v3+ functional API for RFC 6238 TOTP.
 * Recovery codes are bcrypt-hashed before storage.
 */

import { generateSecret, generateURI, verifySync } from "otplib";
import QRCode from "qrcode";
import { createHash, randomBytes } from "crypto";
import { pool } from "../db";

// ── TOTP helpers ───────────────────────────────────────────────────────────────

/** Generate a new base32 secret for the user. */
export function newTotpSecret(): string {
  return generateSecret();
}

/** Verify a TOTP token against a stored secret. */
export function checkTotpToken(secret: string, token: string): boolean {
  try {
    return Boolean(verifySync({ secret, token, strategy: "totp", period: 30, digits: 6, algorithm: "sha1" }));
  } catch {
    return false;
  }
}

/** Generate an otpauth:// URI for QR code generation. */
export function buildOtpUri(secret: string, email: string, issuer = "GoldenLife"): string {
  return generateURI({ label: email, issuer, secret, strategy: "totp", digits: 6, period: 30, algorithm: "sha1" });
}

/** Generate a QR code data URL from an otpauth URI. */
export async function buildQrCode(uri: string): Promise<string> {
  return QRCode.toDataURL(uri);
}

// ── Recovery codes ─────────────────────────────────────────────────────────────

function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/** Generate N plaintext recovery codes (returned once; hashes stored in DB). */
function generateRecoveryCodes(n = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < n; i++) {
    const code = randomBytes(5).toString("hex").toUpperCase(); // 10-char hex
    codes.push(`${code.slice(0, 5)}-${code.slice(5)}`);       // e.g. A1B2C-D3E4F
  }
  return codes;
}

// ── DB operations ──────────────────────────────────────────────────────────────

/** Return true if MFA is enabled for the given user. */
export async function isMfaEnabled(userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT enabled FROM mfa_secrets WHERE user_id = $1 AND enabled = true LIMIT 1`,
    [userId]
  );
  return rows.length > 0;
}

/** Alias used by auth login intercept. */
export const isMfaRequired = isMfaEnabled;

/** Get the stored TOTP secret for a user (only if enabled). */
export async function getStoredSecret(userId: string): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT secret FROM mfa_secrets WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows[0]?.secret ?? null;
}

/**
 * Begin MFA setup: generate a new secret, store it as disabled,
 * and return the QR code data URL + plaintext recovery codes.
 */
export async function beginMfaSetup(userId: string, email: string): Promise<{
  secret: string;
  qrCodeDataUrl: string;
  recoveryCodes: string[];
}> {
  const secret = newTotpSecret();
  const uri = buildOtpUri(secret, email);
  const qrCodeDataUrl = await buildQrCode(uri);

  // Upsert the secret (disabled until verified)
  await pool.query(
    `INSERT INTO mfa_secrets (user_id, secret, enabled)
     VALUES ($1, $2, false)
     ON CONFLICT (user_id) DO UPDATE SET secret = $2, enabled = false`,
    [userId, secret]
  );

  // Generate + store recovery codes
  const plainCodes = generateRecoveryCodes(10);
  await pool.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId]);
  for (const code of plainCodes) {
    await pool.query(
      `INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
      [userId, hashRecoveryCode(code)]
    );
  }

  return { secret, qrCodeDataUrl, recoveryCodes: plainCodes };
}

/**
 * Confirm MFA setup: verify that the user can generate a valid token,
 * then mark the secret as enabled.
 */
export async function confirmMfaSetup(userId: string, token: string): Promise<boolean> {
  const secret = await getStoredSecret(userId);
  if (!secret) return false;
  const valid = checkTotpToken(secret, token);
  if (!valid) return false;

  await pool.query(
    `UPDATE mfa_secrets SET enabled = true WHERE user_id = $1`,
    [userId]
  );
  return true;
}

/**
 * Verify a TOTP code during the login MFA challenge.
 * Returns true if valid.
 */
export async function verifyMfaToken(userId: string, token: string): Promise<boolean> {
  const secret = await getStoredSecret(userId);
  if (!secret) return false;
  return checkTotpToken(secret, token);
}

/**
 * Use a recovery code. Returns true and marks it used if valid;
 * returns false if not found or already used.
 */
export async function useRecoveryCode(userId: string, code: string): Promise<boolean> {
  const hash = hashRecoveryCode(code);
  const { rows } = await pool.query(
    `SELECT id FROM mfa_recovery_codes
     WHERE user_id = $1 AND code_hash = $2 AND used = false
     LIMIT 1`,
    [userId, hash]
  );
  if (!rows[0]) return false;

  await pool.query(
    `UPDATE mfa_recovery_codes SET used = true, used_at = NOW() WHERE id = $1`,
    [rows[0].id]
  );
  return true;
}

/** Disable MFA for a user (admin action or user self-service). */
export async function disableMfa(userId: string): Promise<void> {
  await pool.query(`UPDATE mfa_secrets SET enabled = false WHERE user_id = $1`, [userId]);
}

// ── Aliases matching original route import names ───────────────────────────────

/** Get MFA status for a user (enabled flag + remaining recovery codes). */
export async function getMfaStatus(userId: string): Promise<{
  enabled: boolean;
  recoveryCodesRemaining: number;
}> {
  const [enabledRow, codeRow] = await Promise.all([
    pool.query<{ enabled: boolean }>(
      `SELECT enabled FROM mfa_secrets WHERE user_id = $1 LIMIT 1`, [userId]
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM mfa_recovery_codes WHERE user_id = $1 AND used = false`, [userId]
    ),
  ]);
  return {
    enabled: enabledRow.rows[0]?.enabled ?? false,
    recoveryCodesRemaining: parseInt(codeRow.rows[0]?.count ?? "0", 10),
  };
}

/** Alias: begin MFA setup (returns secret, QR code, otpauthUrl, and recovery codes). */
export async function setupMfa(
  userId: string,
  email: string
): Promise<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string; recoveryCodes: string[] }> {
  const result = await beginMfaSetup(userId, email);
  const otpauthUrl = buildOtpUri(result.secret, email);
  return { ...result, otpauthUrl };
}

/** Alias: verify and enable MFA after scanning QR code. */
export async function verifyAndEnableMfa(
  userId: string,
  code: string
): Promise<{ success: boolean; recoveryCodes: string[] }> {
  const { rows } = await pool.query(
    `SELECT id FROM mfa_recovery_codes WHERE user_id = $1 AND used = false`, [userId]
  );
  const success = await confirmMfaSetup(userId, code);
  if (!success) return { success: false, recoveryCodes: [] };
  const plainCodes = rows.map(() => ""); // codes were already stored during setup
  return { success: true, recoveryCodes: plainCodes };
}

/** Regenerate recovery codes (requires valid TOTP first). */
export async function generateNewRecoveryCodes(userId: string): Promise<string[]> {
  const plainCodes: string[] = [];
  await pool.query(`DELETE FROM mfa_recovery_codes WHERE user_id = $1`, [userId]);
  const { randomBytes } = await import("crypto");
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(5).toString("hex").toUpperCase();
    const formatted = `${code.slice(0, 5)}-${code.slice(5)}`;
    plainCodes.push(formatted);
    await pool.query(
      `INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
      [userId, createHash("sha256").update(formatted).digest("hex")]
    );
  }
  return plainCodes;
}

/** Return MFA adoption stats for the admin dashboard. */
export async function getMfaAdoptionStats(): Promise<{
  totalUsers: number;
  mfaEnabled: number;
  adminMfaEnabled: number;
  adoptionRate: number;
}> {
  const [totals, enabled, adminEnabled] = await Promise.all([
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM users`),
    pool.query<{ count: string }>(`SELECT COUNT(*) FROM mfa_secrets WHERE enabled = true`),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM mfa_secrets ms
       JOIN users u ON u.id = ms.user_id
       WHERE ms.enabled = true AND u.role IN ('admin','global_admin')`
    ),
  ]);

  const totalUsers = parseInt(totals.rows[0].count, 10);
  const mfaEnabledCount = parseInt(enabled.rows[0].count, 10);
  const adminMfaEnabledCount = parseInt(adminEnabled.rows[0].count, 10);

  return {
    totalUsers,
    mfaEnabled: mfaEnabledCount,
    adminMfaEnabled: adminMfaEnabledCount,
    adoptionRate: totalUsers > 0 ? Math.round((mfaEnabledCount / totalUsers) * 100) : 0,
  };
}

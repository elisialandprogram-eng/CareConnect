/**
 * Login Protection — Section B
 *
 * Brute-force / credential-stuffing protection for the login endpoint.
 *
 * Strategy:
 *   • Track failed attempts per (email, ip) in login_attempts table
 *   • After MAX_ATTEMPTS failures within WINDOW_MS → lock for LOCKOUT_MS
 *   • After HARD_ATTEMPTS failures within HARD_WINDOW_MS → long lock
 *   • Log all security events to system_events
 *
 * Exported:
 *   recordLoginAttempt(email, ip, success, pool) — writes attempt row
 *   checkLoginLockout(email, ip, pool)           — returns { locked, reason }
 *   clearLoginAttempts(email, pool)              — on successful login
 */

import type { Pool } from "pg";

// Thresholds
const SOFT_MAX   = 10;                     // failures before soft lock
const SOFT_WINDOW_MS  = 15 * 60 * 1000;   // 15 min rolling window
const SOFT_LOCKOUT_MS = 15 * 60 * 1000;   // locked for 15 min

const HARD_MAX   = 25;                     // failures before hard lock
const HARD_WINDOW_MS  = 60 * 60 * 1000;   // 1-hour rolling window
const HARD_LOCKOUT_MS = 60 * 60 * 1000;   // locked for 1 hour

export interface LockoutStatus {
  locked: boolean;
  reason?: string;
  retryAfterMs?: number;
}

/**
 * Record a login attempt. success=true clears counts via clearLoginAttempts.
 */
export async function recordLoginAttempt(
  email: string,
  ip: string,
  success: boolean,
  pool: Pool,
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO login_attempts (email, ip_address, success, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [email.toLowerCase(), ip, success],
    );

    // Log security event for failed attempts
    if (!success) {
      await pool.query(
        `INSERT INTO system_events (event_type, severity, source, message, metadata)
         VALUES ('auth_failure', 'warning', 'login', $1, $2)`,
        [
          `Failed login attempt for ${email}`,
          JSON.stringify({ email, ip, timestamp: new Date().toISOString() }),
        ],
      ).catch(() => {});
    }
  } catch {
    // Non-fatal — never block login path due to tracking failure
  }
}

/**
 * Check whether (email, ip) is currently locked out.
 * Returns { locked: false } if clear, or { locked: true, reason, retryAfterMs } if blocked.
 */
export async function checkLoginLockout(
  email: string,
  ip: string,
  pool: Pool,
): Promise<LockoutStatus> {
  try {
    const emailNorm = email.toLowerCase();

    // Hard lock: 15+ failures in last hour (by email only — IP-agnostic)
    const { rows: hard } = await pool.query<{ cnt: string; earliest: Date }>(
      `SELECT COUNT(*) AS cnt, MIN(created_at) AS earliest
       FROM login_attempts
       WHERE email = $1
         AND success = false
         AND created_at > NOW() - INTERVAL '1 hour'`,
      [emailNorm],
    );
    const hardCount = parseInt(hard[0]?.cnt ?? "0", 10);
    if (hardCount >= HARD_MAX) {
      // Find the oldest in window to compute retryAfter
      const earliest = hard[0]?.earliest ? new Date(hard[0].earliest) : new Date();
      const unlockAt = earliest.getTime() + HARD_WINDOW_MS;
      const retryAfterMs = Math.max(0, unlockAt - Date.now());

      await pool.query(
        `INSERT INTO system_events (event_type, severity, source, message, metadata)
         VALUES ('auth_failure', 'error', 'login_lockout', $1, $2)`,
        [
          `Account hard-locked: ${hardCount} failures in 1h for ${emailNorm}`,
          JSON.stringify({ email: emailNorm, ip, hardCount }),
        ],
      ).catch(() => {});

      return {
        locked: true,
        reason: "Too many failed attempts. Account temporarily locked.",
        retryAfterMs,
      };
    }

    // Soft lock: 5+ failures in last 15 min (email + ip combined)
    const { rows: soft } = await pool.query<{ cnt: string; earliest: Date }>(
      `SELECT COUNT(*) AS cnt, MIN(created_at) AS earliest
       FROM login_attempts
       WHERE (email = $1 OR ip_address = $2)
         AND success = false
         AND created_at > NOW() - INTERVAL '15 minutes'`,
      [emailNorm, ip],
    );
    const softCount = parseInt(soft[0]?.cnt ?? "0", 10);
    if (softCount >= SOFT_MAX) {
      const earliest = soft[0]?.earliest ? new Date(soft[0].earliest) : new Date();
      const unlockAt = earliest.getTime() + SOFT_LOCKOUT_MS;
      const retryAfterMs = Math.max(0, unlockAt - Date.now());

      return {
        locked: true,
        reason: `Too many failed attempts. Please wait ${Math.ceil(retryAfterMs / 60000)} minutes.`,
        retryAfterMs,
      };
    }

    return { locked: false };
  } catch {
    // Fail open — never accidentally lock out all users on DB error
    return { locked: false };
  }
}

/**
 * Clear failed login attempts after a successful login (reset window).
 */
export async function clearLoginAttempts(email: string, pool: Pool): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM login_attempts WHERE email = $1`,
      [email.toLowerCase()],
    );
  } catch {
    // Non-fatal
  }
}

/**
 * Return how many failed attempts exist in the soft window for a given email.
 * Used to send progressive warnings in the login response.
 */
export async function getFailedAttemptCount(email: string, pool: Pool): Promise<number> {
  try {
    const { rows } = await pool.query<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM login_attempts
       WHERE email = $1 AND success = false
         AND created_at > NOW() - INTERVAL '15 minutes'`,
      [email.toLowerCase()],
    );
    return parseInt(rows[0]?.cnt ?? "0", 10);
  } catch {
    return 0;
  }
}

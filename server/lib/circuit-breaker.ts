/**
 * Circuit-Breaker / Fail-Fast Utilities
 *
 * `withTimeout<T>(promise, ms, fallback)` — resolves to the promise result if
 * it settles within `ms` milliseconds, or to `fallback` if it times out.
 * The original promise is still allowed to resolve silently; the timeout only
 * affects which value the *caller* receives.
 *
 * `getLoyaltyPointsSafe(userId)` — wraps the loyalty-points storage lookup in
 * a 1-second timeout so a slow Supabase round-trip never blocks the
 * appointment booking flow.  Returns 0 on timeout or DB error.
 *
 * Extend this file with additional circuit-breaker wrappers as needed.
 */

import { pool } from "../db";

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const race = Promise.race<T>([
    promise,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]);
  race.finally(() => clearTimeout(timer)).catch(() => {});
  return race;
}

/**
 * Fetch the loyalty point balance for a user.
 *
 * Loyalty points are stored as `balance` on the `wallets` table (1 pt = $0.01
 * USD; floor to whole points).  If the query exceeds 1 second or fails for any
 * reason the function returns 0 so the booking flow is never blocked.
 */
export async function getLoyaltyPointsSafe(userId: string): Promise<number> {
  const query = pool
    .query<{ balance: string }>(
      "SELECT balance FROM wallets WHERE user_id = $1 LIMIT 1",
      [userId],
    )
    .then((result) =>
      result.rows[0] ? Math.floor(parseFloat(result.rows[0].balance) * 100) : 0,
    )
    .catch(() => 0);

  return withTimeout(query, 1000, 0);
}

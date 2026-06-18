/**
 * PostgreSQL-backed rate limit store for express-rate-limit.
 *
 * Replaces the default in-memory MemoryStore with a durable DB-backed
 * implementation that survives process restarts and supports multi-instance
 * deployments. Falls back gracefully (fail-open) if the DB is temporarily
 * unavailable so a DB hiccup never blocks all traffic.
 *
 * Future Redis migration: swap this class for a redis-backed variant that
 * implements the same Store interface without changing any caller code.
 *
 * Table: rate_limit_hits (provisioned by runStartupMigrations in db.ts)
 *   key       VARCHAR(512)  PK   — "tier:ip" composite
 *   hits      INTEGER            — running counter within the current window
 *   reset_at  TIMESTAMPTZ        — when the current window expires
 */

import type { Store, Options, ClientRateLimitInfo } from "express-rate-limit";
import { pool } from "../db";

const PRUNE_INTERVAL_MS = 5 * 60 * 1000; // sweep expired rows every 5 min

export class PostgresRateLimitStore implements Store {
  private windowMs: number;
  private _prefix: string;
  private pruneTimer: NodeJS.Timeout | null = null;

  constructor(options: { windowMs: number; prefix?: string }) {
    this.windowMs = options.windowMs;
    this._prefix = options.prefix ?? "rl";
    this.pruneTimer = setInterval(() => this._pruneExpired(), PRUNE_INTERVAL_MS);
    if (this.pruneTimer.unref) this.pruneTimer.unref();
  }

  init(options: Options): void {
    this.windowMs = options.windowMs ?? this.windowMs;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const fullKey = `${this._prefix}:${key}`;
    const resetMs = Date.now() + this.windowMs;
    try {
      const { rows } = await pool.query<{ hits: number; reset_at: string }>(
        `INSERT INTO rate_limit_hits (key, hits, reset_at)
         VALUES ($1, 1, to_timestamp($2 / 1000.0))
         ON CONFLICT (key) DO UPDATE SET
           hits = CASE
             WHEN rate_limit_hits.reset_at > NOW() THEN rate_limit_hits.hits + 1
             ELSE 1
           END,
           reset_at = CASE
             WHEN rate_limit_hits.reset_at > NOW() THEN rate_limit_hits.reset_at
             ELSE to_timestamp($2 / 1000.0)
           END
         RETURNING hits, reset_at`,
        [fullKey, resetMs],
      );
      const row = rows[0];
      return {
        totalHits: row?.hits ?? 1,
        resetTime: row?.reset_at ? new Date(row.reset_at) : new Date(resetMs),
      };
    } catch {
      // Fail-open: if DB is unavailable allow the request through (single hit counted)
      return { totalHits: 1, resetTime: new Date(resetMs) };
    }
  }

  async decrement(key: string): Promise<void> {
    const fullKey = `${this._prefix}:${key}`;
    try {
      await pool.query(
        `UPDATE rate_limit_hits
            SET hits = GREATEST(hits - 1, 0)
          WHERE key = $1 AND reset_at > NOW()`,
        [fullKey],
      );
    } catch { /* non-fatal */ }
  }

  async resetKey(key: string): Promise<void> {
    const fullKey = `${this._prefix}:${key}`;
    try {
      await pool.query(`DELETE FROM rate_limit_hits WHERE key = $1`, [fullKey]);
    } catch { /* non-fatal */ }
  }

  async resetAll(): Promise<void> {
    try {
      await pool.query(`DELETE FROM rate_limit_hits WHERE key LIKE $1`, [`${this._prefix}:%`]);
    } catch { /* non-fatal */ }
  }

  shutdown(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }

  private _pruneExpired(): void {
    pool.query(`DELETE FROM rate_limit_hits WHERE reset_at < NOW()`).catch(() => {});
  }
}

/**
 * Rate limiting middleware — DB-backed, production-safe.
 *
 * Uses PostgresRateLimitStore (server/lib/rateLimitStore.ts) instead of the
 * default in-memory MemoryStore.  The DB store survives process restarts and
 * is safe for multi-instance deployments.  A future Redis migration only
 * requires swapping the store class — no caller changes needed.
 *
 * Tiers:
 *   global   — 600 req / 15 min per IP (blanket API guard)
 *   auth     — 30  req / 15 min per IP (login, register, forgot-password)
 *   otp      — 15  req / 15 min per IP (OTP verify, resend)
 *   booking  — 60  req / 15 min per IP (appointment creation)
 *   payment  — 30  req / 15 min per IP (wallet top-up, Stripe session)
 *   admin    — 400 req / 15 min per IP (admin writes — reads still hit global)
 *   slot     — 40  req / 1  min per IP (slot reservation + checkout)
 *   giftCard — 10  req / 15 min per IP (gift-card balance checks)
 *   public   — 300 req / 15 min per IP (public read-only endpoints)
 *
 * Stacking pattern:
 *   globalApiLimiter runs on ALL /api routes via app.use("/api", ...) in index.ts.
 *   Route-specific limiters (authLimiter, bookingLimiter, etc.) run as inline
 *   middleware on individual routes and fire AFTER the global limiter.
 *   express-rate-limit v8 requires validate: { singleCount: false } on every
 *   route-specific limiter to acknowledge the intentional stacking — without
 *   it the library throws ERR_ERL_DOUBLE_COUNT when it detects that
 *   res.locals.rateLimit is already set by the global limiter.
 *   Each limiter still increments its own independent DB counter and enforces
 *   its own limit; no actual rate-limit enforcement is skipped.
 *
 * Trust proxy: when behind Replit's reverse proxy the real IP is in
 * X-Forwarded-For.  Express resolves req.ip correctly when
 * app.set('trust proxy', 1) is set (done in index.ts).
 *
 * Rate-limit violations are logged into system_events for admin visibility.
 */

import rateLimit from "express-rate-limit";
import { pool } from "../db";
import { PostgresRateLimitStore } from "../lib/rateLimitStore";

const WINDOW_15M = 15 * 60 * 1000;
const WINDOW_1M  =      60 * 1000;

function jsonLimitHandler(windowMs: number, max: number) {
  return (req: any, res: any) => {
    const retryAfter = Math.ceil(windowMs / 1000 / 60);
    res.status(429).json({
      error: "Too many requests",
      message: `Rate limit exceeded. Try again in ${retryAfter} minutes.`,
      retryAfter,
    });
    pool.query(
      `INSERT INTO system_events (event_type, severity, source, message, metadata, country_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        "rate_limit_hit",
        "warning",
        `${req.method} ${req.path}`,
        `Rate limit exceeded on ${req.method} ${req.path}`,
        JSON.stringify({ ip: req.ip, path: req.path, method: req.method, limit: max }),
        (req as any).user?.countryCode ?? null,
      ],
    ).catch(() => {});
  };
}

/** Blanket guard for all /api routes — runs first on every request via app.use("/api", ...) */
export const globalApiLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:global" }),
  handler: jsonLimitHandler(WINDOW_15M, 600),
  skip: (req) => req.path.startsWith("/api/stripe/webhook"),
});

/**
 * Auth actions — login, register, forgot-password.
 * * validate.singleCount:false — global limiter already ran on this request;
 * this limiter intentionally stacks on top of it.
 */
export const authLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:auth" }),
  handler: jsonLimitHandler(WINDOW_15M, 30),
  validate: { singleCount: false },
});

/**
 * OTP verify + resend — tighter.
 * * validate.singleCount:false — stacked after globalApiLimiter.
 */
export const otpLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:otp" }),
  handler: jsonLimitHandler(WINDOW_15M, 15),
  validate: { singleCount: false },
});

/**
 * Appointment creation.
 * * validate.singleCount:false — stacked after globalApiLimiter (and sometimes slotLimiter).
 */
export const bookingLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:booking" }),
  handler: jsonLimitHandler(WINDOW_15M, 60),
  validate: { singleCount: false },
});

/**
 * Wallet top-up + payment session creation.
 * * validate.singleCount:false — stacked after globalApiLimiter.
 */
export const paymentLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:payment" }),
  handler: jsonLimitHandler(WINDOW_15M, 30),
  validate: { singleCount: false },
});

/**
 * Admin write actions.
 * * validate.singleCount:false — stacked after globalApiLimiter.
 */
export const adminWriteLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:admin" }),
  handler: jsonLimitHandler(WINDOW_15M, 400),
  validate: { singleCount: false },
});

/**
 * Slot reservation & checkout confirmation — 40 req/1 min, strict per-IP.
 * * validate.singleCount:false — stacked after globalApiLimiter and bookingLimiter
 * on POST /api/appointments (three-limiter chain).
 */
export const slotLimiter = rateLimit({
  windowMs: WINDOW_1M,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_1M, prefix: "rl:slot" }),
  handler: jsonLimitHandler(WINDOW_1M, 40),
  validate: { singleCount: false },
});

/**
 * Gift-card balance checks — tight limit to block brute-force enumeration.
 * * validate.singleCount:false — stacked after globalApiLimiter.
 */
export const giftCardLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:giftcard" }),
  handler: jsonLimitHandler(WINDOW_15M, 10),
  validate: { singleCount: false },
});

/**
 * Public read-only endpoints (provider listings, catalog, etc.).
 * * validate.singleCount:false — stacked after globalApiLimiter.
 */
export const publicApiLimiter = rateLimit({
  windowMs: WINDOW_15M,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  store: new PostgresRateLimitStore({ windowMs: WINDOW_15M, prefix: "rl:public" }),
  handler: jsonLimitHandler(WINDOW_15M, 300),
  validate: { singleCount: false },
});

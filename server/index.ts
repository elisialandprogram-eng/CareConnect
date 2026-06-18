// Suppress the noisy PostCSS "did not pass the `from` option" warning that
// Tailwind v3 emits internally when generating utility CSS. It is harmless
// (no assets are mis-transformed) and not actionable by application code.
const _origWarn = console.warn.bind(console);
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("did not pass the `from` option")) return;
  _origWarn(...args);
};

// ── Environment validation — MUST run before any other import that reads env vars ──
// Exits the process immediately if SESSION_SECRET or SUPABASE_DATABASE_URL are absent/invalid.
import { validateEnvironment } from "./config/env";
validateEnvironment();

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupChatWS } from "./chat/ws";
import { setupSlotEventsWS } from "./lib/slotEvents";
import { handleStripeWebhook } from "./stripeWebhook";
import { runStartupMigrations, runCatalogSeed, pool } from "./db";
import { globalApiLimiter } from "./middleware/rateLimiter";
import { correlationIdMiddleware, requestIdStore } from "./middleware/correlationId";
import { registerErrorSink } from "./lib/error-sink";
import { recordRequest, SLOW_MS } from "./lib/requestMetrics";

const app = express();

// Trust the reverse proxy (Render, Railway, Nginx, etc.) so req.ip resolves to the real client IP.
app.set("trust proxy", 1);

// ── Security headers (helmet + manual additions) ──────────────────────────────
// helmet is registered first so its defaults are in place before any route runs.
// Content-Security-Policy is left to helmet's default; overrides added below.
// ── Production CSP — allows Daily.co video rooms, Stripe checkout, Cloudinary
const isProd = process.env.NODE_ENV === "production";
app.use(
  helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'", "'unsafe-inline'", "js.stripe.com", "*.daily.co"],
            styleSrc:       ["'self'", "'unsafe-inline'"],
            imgSrc:         ["'self'", "data:", "blob:", "*.cloudinary.com", "res.cloudinary.com", "*.stripe.com"],
            fontSrc:        ["'self'", "data:"],
            connectSrc:     [
              "'self'",
              "api.stripe.com",
              "*.supabase.co",
              "*.cloudinary.com",
              "*.daily.co",
              "wss://*.daily.co",
              "*.resend.com",
            ],
            frameSrc:       ["'self'", "js.stripe.com", "hooks.stripe.com", "*.daily.co"],
            frameAncestors: ["'none'"],
            mediaSrc:       ["'self'", "blob:", "*.cloudinary.com", "*.daily.co"],
            workerSrc:      ["'self'", "blob:"],
            objectSrc:      ["'none'"],
            baseUri:        ["'self'"],
            formAction:     ["'self'"],
            upgradeInsecureRequests: [],
          },
        }
      : false,
    // HSTS handled manually below so it only fires in production.
    strictTransportSecurity: false,
    // XSS filter header (legacy browsers)
    xXssProtection: true,
    // Prevent MIME sniffing
    xContentTypeOptions: true,
    // Clickjacking protection
    frameguard: { action: "deny" },
    // Disable DNS prefetching
    dnsPrefetchControl: { allow: false },
    // No-referrer for cross-origin requests
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);
// Manual supplementary headers not covered by helmet defaults.
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// Attach a unique correlation ID to every request (X-Request-ID header).
app.use(correlationIdMiddleware);

const httpServer = createServer(app);
setupChatWS(httpServer);
setupSlotEventsWS(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// Stripe webhook MUST receive the raw body for signature verification,
// so it has to be registered BEFORE express.json().
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook,
);

app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ limit: "50mb", extended: false }));

// Serve locally-uploaded avatar images (fallback when Cloudinary is not configured)
import pathMod from "path";
import fsMod from "fs";
const _uploadsDir = pathMod.join(process.cwd(), "uploads");
if (!fsMod.existsSync(_uploadsDir)) fsMod.mkdirSync(_uploadsDir, { recursive: true });
app.use("/uploads", express.static(_uploadsDir));

// Global rate limit — applied to all /api routes.
// Stripe webhooks are skipped inside the limiter (they have signature auth).
app.use("/api", globalApiLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const rid = requestIdStore.getStore();
  const ridTag = rid ? ` [rid=${rid}]` : "";
  console.log(`${formattedTime} [${source}]${ridTag} ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  let _capturedBytes = 0;
  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    try {
      const serialized = JSON.stringify(bodyJson);
      _capturedBytes = Buffer.byteLength(serialized, "utf8");
    } catch { _capturedBytes = 0; }
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      const contentLen = parseInt(res.getHeader("content-length") as string || "0", 10);
      const bytes = contentLen || _capturedBytes;
      const logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      log(logLine);
      recordRequest({ method: req.method, path, statusCode: res.statusCode, durationMs: duration, bytes });
      if (duration >= SLOW_MS) {
        pool.query(
          `INSERT INTO system_events (event_type, severity, source, message, metadata)
           VALUES ('slow_endpoint','warning',$1,$2,$3)`,
          [
            `${req.method} ${path}`,
            `Slow request: ${duration}ms on ${req.method} ${path}`,
            JSON.stringify({ method: req.method, path, statusCode: res.statusCode, durationMs: duration }),
          ],
        ).catch(() => {});
      }
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  registerErrorSink(app);

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
    log("Vite dev server configured");
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);

  // Start listening immediately so Replit's health check passes within the 60s window.
  // Migrations run in the background BEFORE crons are started — this prevents cron
  // queries from failing on columns that haven't been added yet (race condition).
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);

    runStartupMigrations()
      .catch((e: Error) => console.warn("[db] startup migration error:", e.message))
      .finally(() => {
        // Catalog seed runs fire-and-forget — idempotent upserts, never delays server.
        setTimeout(() => {
          runCatalogSeed().catch((e: Error) =>
            console.warn("[db:catalog] seed error:", e.message),
          );
        }, 5_000);

        // All crons start only after migrations have finished (or gracefully failed).
        import("./reminderCron").then(({ startReminderCron }) => startReminderCron());
        import("./cron/rolling-schedule").then(({ runRollingSchedule }) => {
          runRollingSchedule().catch((e: Error) => console.warn("[rolling-schedule] startup run error:", e.message));
        });
        import("./crons/ledger-reconcile").then(({ startLedgerReconcileCron }) => startLedgerReconcileCron());
        import("./crons/metrics-snapshot").then(({ startMetricsSnapshotCron }) => startMetricsSnapshotCron());
      });
  });
})();

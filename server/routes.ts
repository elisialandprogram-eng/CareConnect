import type { Server } from "http";
import type { Express } from "express";
import cookieParserModule from "cookie-parser";
import { monitoringMiddleware } from "./middleware/monitoring";
import { storage } from "./storage";

// ── AI integrations ─────────────────────────────────────────────────────────
import { registerChatRoutes } from "./ai_integrations/chat";
import { registerImageRoutes } from "./ai_integrations/image";

// ── Domain route modules ────────────────────────────────────────────────────
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerSupportRoutes } from "./routes/support.routes";
import { registerMonitoringRoutes } from "./routes/monitoring.routes";
import { registerNotificationRoutes } from "./routes/notification.routes";
import { registerWebhookRoutes } from "./routes/webhook.routes";
import { registerWalletRoutes } from "./routes/wallet.routes";
import { registerFamilyRoutes } from "./routes/family.routes";
import { registerProviderRoutes } from "./routes/provider.routes";
import { registerAppointmentRoutes } from "./routes/appointment.routes";
import { registerPatientRoutes } from "./routes/patient.routes";
import { registerPaymentRoutes } from "./routes/payment.routes";
import { registerCommunicationRoutes } from "./routes/communication.routes";
import { registerCareRoutes } from "./routes/care.routes";
import { registerCommunityRoutes } from "./routes/community.routes";
import { registerSessionRoutes } from "./routes/session.routes";
import { registerCatalogRoutes } from "./routes/catalog.routes";

// ── Admin route modules ─────────────────────────────────────────────────────
import { registerAdminContentRoutes } from "./routes/admin/admin-content.routes";
import { registerAdminUsersRoutes } from "./routes/admin/admin-users.routes";
import { registerAdminProvidersRoutes } from "./routes/admin/admin-providers.routes";
import { registerAdminFinancialRoutes } from "./routes/admin/admin-financial.routes";
import { registerAdminMonitoringRoutes } from "./routes/admin/admin-monitoring.routes";
import { registerAdminComplianceRoutes } from "./routes/admin/admin-compliance.routes";
import { registerFinancialReconcileRoutes } from "./routes/admin/financial-reconcile.routes";
import { registerFinancialsRoutes } from "./routes/financials.routes";
import { registerLocationRoutes } from "./routes/location.routes";
import { registerAdminHealthRoutes } from "./routes/admin/admin-health.routes";
import { registerAdminHomeRoutes } from "./routes/admin/admin-home.routes";
import { registerAdminPaymentProviderRoutes } from "./routes/admin/admin-payment-providers.routes";
import { registerAdminDevToolsRoutes } from "./routes/admin/admin-dev-tools.routes";
import { registerRevenueBillingRoutes } from "./routes/admin/revenue-billing.routes";
import { registerMfaRoutes } from "./routes/mfa.routes";
import { registerStripeConnectRoutes } from "./routes/stripe-connect.routes";
import { registerPayoutAutomationRoutes } from "./routes/admin/payout-automation.routes";
import { registerFullReconciliationRoute } from "./routes/admin/full-reconciliation.routes";
import { registerAdminLegalRoutes } from "./routes/admin/legal.routes";
import { registerLegalPublicRoutes } from "./routes/legal-public.routes";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ── Public health endpoint — no auth, safe for load balancers ──────────────
  // Returned before cookie parser / monitoring middleware so it is always
  // reachable even when other middleware is failing.
  app.get("/health", async (_req, res) => {
    const start = Date.now();
    let dbStatus = "ok";
    let dbLatencyMs: number | null = null;
    try {
      const { pool: healthPool } = await import("./db");
      const t0 = Date.now();
      await healthPool.query("SELECT 1");
      dbLatencyMs = Date.now() - t0;
    } catch {
      dbStatus = "error";
    }
    const status = dbStatus === "ok" ? "ok" : "degraded";
    const code   = dbStatus === "ok" ? 200 : 503;
    res.status(code).json({
      status,
      db: dbStatus,
      dbLatencyMs,
      uptime: Math.floor(process.uptime()),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      responseTimeMs: Date.now() - start,
    });
  });

  // Cookie parser MUST be registered before any auth-protected route handlers
  // so that req.cookies is available to authenticateToken / refresh-token logic.
  app.use(cookieParserModule());

  // Request monitoring: log slow endpoints and 5xx errors to system_events.
  app.use(monitoringMiddleware);

  // One-shot: ensure the categories table has the default specialties.
  // Non-fatal — routes still serve whatever is present if this fails.
  try {
    await storage.ensureDefaultCategories();
  } catch (err) {
    console.error("[startup] ensureDefaultCategories failed:", (err as Error).message);
  }

  // AI integrations
  registerChatRoutes(app);
  registerImageRoutes(app);

  // Domain modules
  registerAuthRoutes(app);
  registerSupportRoutes(app);
  registerMonitoringRoutes(app);
  registerNotificationRoutes(app);
  registerWebhookRoutes(app);
  registerWalletRoutes(app);
  registerFamilyRoutes(app);
  registerProviderRoutes(app);
  registerAppointmentRoutes(app);
  registerPatientRoutes(app);
  registerPaymentRoutes(app);
  registerCommunicationRoutes(app);
  registerCareRoutes(app);
  registerCommunityRoutes(app);
  registerSessionRoutes(app);
  registerCatalogRoutes(app);

  // Admin modules
  registerAdminContentRoutes(app);
  registerAdminUsersRoutes(app);
  registerAdminProvidersRoutes(app);
  registerAdminFinancialRoutes(app);
  registerAdminMonitoringRoutes(app);
  registerAdminComplianceRoutes(app);
  registerFinancialReconcileRoutes(app);
  registerFinancialsRoutes(app);
  registerLocationRoutes(app);
  registerAdminHealthRoutes(app);
  registerAdminHomeRoutes(app);
  registerAdminPaymentProviderRoutes(app);
  registerAdminDevToolsRoutes(app);
  registerRevenueBillingRoutes(app);
  registerMfaRoutes(app);
  registerStripeConnectRoutes(app);
  registerPayoutAutomationRoutes(app);
  registerFullReconciliationRoute(app);
  registerAdminLegalRoutes(app);
  registerLegalPublicRoutes(app);

  return httpServer;
}

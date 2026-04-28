import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { 
  loginSchema, 
  registerSchema, 
  insertProviderSchema, 
  insertAppointmentSchema, 
  insertReviewSchema,
  insertSupportTicketSchema,
  insertSubServiceSchema,
  insertTaxSettingSchema,
  insertPatientConsentSchema,
  insertPractitionerSchema,
  insertServicePractitionerSchema,
  insertServiceSchema,
  insertServicePackageSchema,
  insertHealthMetricSchema,
  insertFamilyMemberSchema,
  insertMedicationSchema,
  insertMedicationLogSchema,
  services,
  practitioners,
  servicePractitioners,
  users,
  providers
} from "@shared/schema";
import crypto from 'crypto'; // Import crypto module for randomUUID
import { Resend } from 'resend';
import { db } from "./db";
import { eq, and, desc, or } from "drizzle-orm";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = "GoldenLife <no-reply@goldenlife.health>";

async function sendAppointmentEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  intro: string;
  details: { label: string; value: string }[];
  cta?: string;
}) {
  if (!resend) return;
  try {
    const detailRows = opts.details
      .map(d => `<p style="margin: 5px 0;"><strong>${d.label}:</strong> ${d.value}</p>`)
      .join("");
    await resend.emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a;">${opts.heading}</h2>
          <p>${opts.intro}</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
            ${detailRows}
          </div>
          ${opts.cta ? `<p>${opts.cta}</p>` : ""}
          <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">
            Thank you for choosing GoldenLife.<br>
            <em>This is an automated message, please do not reply.</em>
          </p>
        </div>
      `,
    });
  } catch (err) {
    console.error(`Failed to send "${opts.subject}" email:`, err);
  }
}

// Helper to hash OTP
const hashOtp = (otp: string) => createHash('sha256').update(otp).digest('hex');

// Helper to generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Rate limiting map (simple in-memory)
const otpRateLimit = new Map<string, number>();
const OTP_COOLDOWN = 60 * 1000; // 60 seconds
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";
import { generateInvoicePDF } from "./utils/invoice-gen";
import { createInvoiceForAppointment } from "./utils/invoice-helper";
import { sanitizeUser, sanitizeProviderWithUser, sanitizeProviderListItem } from "./utils/sanitize";
import cookieParserModule from "cookie-parser";
import {
  isStripeConfigured,
  getStripeMode,
  createCheckoutSession,
} from "./stripe";
import { icsAttachment } from "./utils/ics";
import { dispatchNotification, notify } from "./services/notification-dispatcher";
import { VAPID_PUBLIC_KEY, isPushConfigured } from "./services/channels/push";
import { isSmsConfigured } from "./services/channels/sms";
import { isWhatsAppConfigured } from "./services/channels/whatsapp";
import { isEmailConfigured } from "./services/channels/email";
import { saveChatUpload } from "./services/uploads";
import { getOrCreateVideoSession } from "./services/video";
import { pushToUser, isUserOnline } from "./chat/ws";

const JWT_SECRET = process.env.SESSION_SECRET || "careconnect-jwt-secret-key";
const JWT_EXPIRES_IN = "30d";
const ACCESS_TOKEN_COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_TOKEN_EXPIRES_IN = 90 * 24 * 60 * 60 * 1000; // 90 days

interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
}

// Tiny in-process TTL cache to avoid hitting the DB for the user/provider
// lookup on every authenticated request. With Supabase round-trips around
// ~400ms this used to add 0.4–0.8s to every authenticated API call. Cached
// entries expire after AUTH_CACHE_TTL_MS so role / verification changes still
// take effect quickly. Cache is invalidated on logout, password change, email
// verification, suspension, and provider verification updates via
// `invalidateAuthCache`.
const AUTH_CACHE_TTL_MS = 30_000;
type CachedUser = {
  isEmailVerified: boolean;
  role: string;
  isSuspended?: boolean | null;
  // Full user record (without password) — used by /api/auth/me so we don't
  // re-fetch the same row from Supabase on every page load.
  full: any;
  expires: number;
};
type CachedProviderVerified = { isVerified: boolean; expires: number };
const userAuthCache = new Map<string, CachedUser>();
const providerVerifiedCache = new Map<string, CachedProviderVerified>();

export function invalidateAuthCache(userId: string): void {
  userAuthCache.delete(userId);
  providerVerifiedCache.delete(userId);
}

export function getCachedUser(userId: string): any | null {
  const c = userAuthCache.get(userId);
  if (!c || c.expires < Date.now()) return null;
  return c.full;
}

  // Middleware to verify JWT token
  const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    // Also check cookies
    const cookieToken = req.cookies?.accessToken;
    const finalToken = token || cookieToken;

    if (!finalToken) {
      return res.status(401).json({ message: "Authentication required" });
    }

    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET) as { id: string; email: string; role: string };

      const now = Date.now();
      let cached = userAuthCache.get(decoded.id);
      if (!cached || cached.expires < now) {
        const user = await storage.getUser(decoded.id);
        if (!user) {
          return res.status(401).json({ message: "User not found" });
        }
        const { password: _pw, ...full } = user as any;
        cached = {
          isEmailVerified: !!user.isEmailVerified,
          role: user.role,
          isSuspended: user.isSuspended,
          full,
          expires: now + AUTH_CACHE_TTL_MS,
        };
        userAuthCache.set(decoded.id, cached);
      }

      if (!cached.isEmailVerified) {
        return res.status(403).json({ message: "Email verification required" });
      }

      if (cached.role === "provider") {
        let pv = providerVerifiedCache.get(decoded.id);
        if (!pv || pv.expires < now) {
          const provider = await storage.getProviderByUserId(decoded.id);
          pv = {
            isVerified: !!(provider && provider.isVerified),
            expires: now + AUTH_CACHE_TTL_MS,
          };
          providerVerifiedCache.set(decoded.id, pv);
        }
        if (!pv.isVerified) {
          // Allow access to setup page but not other provider routes
          if (req.path !== "/api/provider/setup" && !req.path.startsWith("/api/auth")) {
             return res.status(403).json({ message: "Account awaiting admin approval" });
          }
        }
      }

      req.user = decoded;
      next();
    } catch (error) {
      return res.status(403).json({ message: "Invalid or expired token" });
    }
  };

// Optional auth - doesn't fail if no token
const optionalAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];
  const cookieToken = req.cookies?.accessToken;
  const finalToken = token || cookieToken;

  if (finalToken) {
    try {
      const decoded = jwt.verify(finalToken, JWT_SECRET) as { id: string; email: string; role: string };
      req.user = decoded;
    } catch {
      // Token invalid, but continue without user
    }
  }
  next();
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Cookie parser MUST be registered before any auth-protected route handlers
  // so that req.cookies is available to authenticateToken / refresh-token logic.
  app.use(cookieParserModule());

  // Middleware to require admin role
  const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // ============ INVOICE ROUTES ============

  // Get all invoices for the current user (patient or provider)
  app.get("/api/invoices/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });

      if (req.user.role === "patient") {
        const invoices = await storage.getInvoicesByPatient(req.user.id);
        return res.json(invoices);
      }
      if (req.user.role === "provider") {
        const invoices = await storage.getInvoicesByProvider(req.user.id);
        return res.json(invoices);
      }
      return res.json([]);
    } catch (error) {
      console.error("Get my invoices error:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get("/api/invoices/appointment/:appointmentId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const invoice = await storage.getInvoiceByAppointment(req.params.appointmentId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      
      // Check permission
      if (req.user?.role === "patient" && invoice.patientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (req.user?.role === "provider" && invoice.providerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      
      res.json(invoice);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoice" });
    }
  });

  app.get("/api/invoices/:id/download", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const invoice = await storage.getInvoice(req.params.id);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });

      const appointment = await storage.getAppointmentWithDetails(invoice.appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      // Permission: patient/provider must own it; admin always allowed
      if (req.user?.role === "patient" && invoice.patientId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
      if (req.user?.role === "provider") {
        const prov = await storage.getProviderByUserId(req.user.id);
        if (!prov || prov.id !== invoice.providerId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Pull the real line items; fall back to a single line from the appointment
      // if the items table is empty (e.g. for invoices created before the fix).
      const dbItems = await storage.getInvoiceItems(invoice.id);
      const items = dbItems.length
        ? dbItems.map((i) => ({
            description: i.description,
            quantity: i.quantity ?? 1,
            unitPrice: i.unitPrice,
            totalPrice: i.totalPrice,
          }))
        : [{
            description: appointment.service?.name || "Healthcare Service",
            quantity: 1,
            unitPrice: appointment.totalAmount,
            totalPrice: appointment.totalAmount,
          }];

      const pdfBuffer = await generateInvoicePDF(
        invoice,
        appointment.patient,
        appointment.provider,
        items
      );

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
      res.send(pdfBuffer);
    } catch (error) {
      console.error("Invoice download error:", error);
      res.status(500).json({ message: "Failed to generate invoice PDF" });
    }
  });

  // Manually (re-)generate the invoice for a single completed appointment.
  // Allowed for the owning provider, the patient on that appointment, or admin.
  // Idempotent: if an invoice already exists, returns it.
  app.post("/api/invoices/generate/:appointmentId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.getAppointmentWithDetails(req.params.appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      const isAdmin = req.user?.role === "admin";
      const isPatient = req.user?.role === "patient" && appointment.patientId === req.user?.id;
      let isOwningProvider = false;
      if (req.user?.role === "provider") {
        const prov = await storage.getProviderByUserId(req.user.id);
        isOwningProvider = !!prov && prov.id === appointment.providerId;
      }
      if (!isAdmin && !isPatient && !isOwningProvider) {
        return res.status(403).json({ message: "Access denied" });
      }

      if (appointment.status !== "completed") {
        return res.status(400).json({ message: "Invoice can only be generated for completed appointments" });
      }

      const existing = await storage.getInvoiceByAppointment(appointment.id);
      if (existing) {
        return res.json({ created: false, invoice: existing });
      }

      const result = await createInvoiceForAppointment(appointment.id);
      const invoice = await storage.getInvoiceByAppointment(appointment.id);
      return res.json({ ...result, invoice });
    } catch (err) {
      console.error("Manual invoice generation error:", err);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // Convenience: download an invoice PDF directly by appointmentId so the
  // patient dashboard doesn't have to fetch the invoice list first.
  app.get("/api/invoices/by-appointment/:appointmentId/download", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const invoice = await storage.getInvoiceByAppointment(req.params.appointmentId);
      if (!invoice) return res.status(404).json({ message: "Invoice not found" });
      // Reuse the existing access checks by redirecting to the standard endpoint.
      return res.redirect(`/api/invoices/${invoice.id}/download`);
    } catch (err) {
      console.error("Invoice by-appointment download error:", err);
      res.status(500).json({ message: "Failed to download invoice" });
    }
  });

  app.post("/api/admin/invoices/generate-pending", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    
    try {
      const pendingAppointments = await storage.getPendingInvoiceAppointments();
      const results = [];

      for (const appt of pendingAppointments) {
        const invoiceNumber = `INV-${Date.now()}-${appt.id.slice(0, 4)}`.toUpperCase();
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);

        const invoice = await storage.createInvoice({
          appointmentId: appt.id,
          patientId: appt.patientId,
          providerId: appt.providerId,
          invoiceNumber,
          dueDate,
          subtotal: appt.totalAmount,
          taxAmount: "0.00",
          totalAmount: appt.totalAmount,
          status: "paid"
        }, [{
          invoiceId: "", // Will be set by storage.createInvoice
          description: "Healthcare Service",
          quantity: 1,
          unitPrice: appt.totalAmount,
          totalPrice: appt.totalAmount,
          practitionerId: null
        }]);

        results.push(invoice);
      }

      res.json({ message: `Generated ${results.length} invoices`, invoices: results });
    } catch (error) {
      console.error("Bulk invoice generation error:", error);
      res.status(500).json({ message: "Failed to generate pending invoices" });
    }
  });

  // Register AI integrations routes
  registerChatRoutes(app);
  registerImageRoutes(app);

  // ============ PATIENT CONSENT ROUTES ============
  app.post("/api/consents", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertPatientConsentSchema.parse({
        ...req.body,
        consentType: req.body.consentType || "general",
        isAccepted: req.body.isAccepted ?? true,
        userId: req.body.userId || req.user?.id,
        language: req.body.language || "en",
        consentTextVersion: req.body.consentTextVersion || "1.0",
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      
      if (!data.userId) {
        return res.status(400).json({ message: "User ID is required for consent" });
      }

      const consent = await storage.createPatientConsent(data);
      res.status(201).json(consent);
    } catch (error) {
      console.error("Consent submission error:", error);
      res.status(400).json({ message: "Invalid consent data" });
    }
  });

  app.get("/api/consents", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const consents = await storage.getPatientConsents(req.user!.id);
      res.json(consents);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch consents" });
    }
  });

  app.get("/api/admin/tax-settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const settings = await storage.getAllTaxSettings();
      res.json(settings || []);
    } catch (error) {
      console.error("Failed to fetch tax settings:", error);
      res.status(500).json({ message: "Failed to get tax settings" });
    }
  });

  app.post("/api/admin/tax-settings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const data = {
        ...req.body,
        isActive: req.body.isActive ?? true,
        taxName: req.body.taxName || "Sales Tax"
      };
      const validated = insertTaxSettingSchema.parse(data);
      const setting = await storage.createTaxSetting(validated);
      res.json(setting);
    } catch (error) {
      console.error("Tax creation error:", error);
      res.status(400).json({ message: "Invalid tax setting data" });
    }
  });

  app.patch("/api/admin/tax-settings/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const setting = await storage.updateTaxSetting(req.params.id, req.body);
      res.json(setting);
    } catch (error) {
      res.status(500).json({ message: "Failed to update tax setting" });
    }
  });

  app.delete("/api/admin/tax-settings/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteTaxSetting(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete tax setting" });
    }
  });

  // Admin User/Provider Management
  app.patch("/api/admin/providers/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (provider?.userId) invalidateAuthCache(provider.userId);
      res.json(provider);
    } catch (error) {
      console.error("Failed to update provider:", error);
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  app.delete("/api/admin/users/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      await storage.deleteUser(req.params.id);
      invalidateAuthCache(req.params.id);
      res.status(204).end();
    } catch (error: any) {
      console.error("[admin/deleteUser] failed:", error?.message);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Create a new platform admin (Admin only)
  app.post("/api/admin/admins", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const { email, password, firstName, lastName, phone } = req.body || {};
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ message: "Email, password, first name and last name are required" });
      }
      if (typeof password !== "string" || password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters long" });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const newAdmin = await storage.createUser({
        email: normalizedEmail,
        password: hashedPassword,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        phone: phone ? String(phone).trim() : null,
        role: "admin",
        isEmailVerified: true,
      });

      const { password: _pw, ...safe } = newAdmin as any;
      res.status(201).json(safe);
    } catch (error: any) {
      console.error("Failed to create admin user:", error);
      res.status(500).json({ message: error?.message || "Failed to create admin" });
    }
  });

  app.delete("/api/admin/providers/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      await storage.deleteProvider(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete provider" });
    }
  });

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, role } = req.body;

      // Check if user exists. If they exist but haven't verified their email,
      // we treat that record as an abandoned signup and replace it so the user
      // can finish registering with the same email.
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        if (existingUser.isEmailVerified) {
          return res.status(400).json({ message: "Email already registered" });
        }
        // Abandoned/unverified signup — clean it up so re-registration works.
        try {
          await storage.deleteUser(existingUser.id);
        } catch (cleanupErr) {
          console.error("Failed to clean up unverified user:", cleanupErr);
          return res.status(500).json({ message: "Registration failed. Please try again." });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role: role || "patient",
        isEmailVerified: false,
      });

      // Generate OTP
      const otp = generateOtp();
      const otpHash = hashOtp(otp);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      await storage.updateUserOtp(user.id, {
        emailOtpHash: otpHash,
        emailOtpExpiresAt: expiresAt,
        otpAttempts: 0,
        lastOtpSentAt: new Date(),
      });

      // Send verification email
      if (resend) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Your GoldenLife verification code",
            text: `Your verification code is: ${otp}. This code expires in 5 minutes.`,
          });
        } catch (emailError) {
          console.error("Failed to send verification email:", emailError);
        }
      }

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  // Login
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.isSuspended) {
        return res.status(403).json({
          code: "ACCOUNT_SUSPENDED",
          status: "suspended",
          reason: user.suspensionReason || null,
          message: `Your account has been suspended. Reason: ${user.suspensionReason || "No reason provided"}`,
        });
      }

      if (!user.isEmailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in",
          isEmailVerified: false,
          userId: user.id 
        });
      }

      if (user.role === "provider") {
        const provider = await storage.getProviderByUserId(user.id);
        if (provider && provider.status !== "active" && provider.status !== "approved") {
          const status = provider.status;
          const codeMap: Record<string, string> = {
            pending: "PROVIDER_PENDING_APPROVAL",
            suspended: "PROVIDER_SUSPENDED",
            rejected: "PROVIDER_REJECTED",
          };
          const messageMap: Record<string, string> = {
            pending: "Your provider profile is awaiting admin approval. Please check back later.",
            suspended: "Your provider account has been suspended.",
            rejected: "Your provider account application has been rejected.",
          };
          return res.status(403).json({
            code: codeMap[status] || "PROVIDER_NOT_ACTIVE",
            status,
            reason: (provider as any).rejectionReason || (provider as any).suspensionReason || null,
            message: messageMap[status] || `Your account has been ${status}.`,
          });
        }
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      const refreshToken = randomBytes(64).toString("hex");
      await storage.createRefreshToken({
        userId: user.id,
        token: refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRES_IN),
      });

      // Set cookies
      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_IN,
      });

      invalidateAuthCache(user.id);

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, accessToken });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (refreshToken) {
        await storage.deleteRefreshToken(refreshToken);
      }

      // Best-effort cache invalidation for the user that just logged out so
      // their cached role / verification state isn't reused.
      try {
        const accessToken = req.cookies?.accessToken;
        if (accessToken) {
          const decoded = jwt.verify(accessToken, JWT_SECRET) as { id: string };
          if (decoded?.id) invalidateAuthCache(decoded.id);
        }
      } catch {
        // ignore — token may be expired/invalid, nothing to invalidate
      }

      res.clearCookie("accessToken");
      res.clearCookie("refreshToken");
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      res.status(500).json({ message: "Logout failed" });
    }
  });

  // Refresh token
  app.post("/api/auth/refresh", async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ message: "Refresh token required" });
      }

      const storedToken = await storage.getRefreshToken(refreshToken);
      if (!storedToken || new Date(storedToken.expiresAt) < new Date()) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
      }

      const user = await storage.getUser(storedToken.userId);
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      // Generate new access token
      const accessToken = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      res.cookie("accessToken", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
      });

      res.json({ accessToken });
    } catch (error) {
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      // Prefer the cached full user populated by authenticateToken so we don't
      // make a second Supabase round-trip on every page load.
      const cached = getCachedUser(req.user!.id);
      if (cached) {
        return res.json({ user: cached });
      }
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      res.status(500).json({ message: "Failed to get user" });
    }
  });

  // Verify Email OTP
  app.post("/api/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { userId, otp } = req.body;
      if (!userId || !otp) return res.status(400).json({ message: "Missing data" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

      // Check expiry and attempts
      if (!user.emailOtpExpiresAt || new Date(user.emailOtpExpiresAt) < new Date()) {
        return res.status(400).json({ message: "OTP expired" });
      }
      if (user.otpAttempts >= 5) {
        return res.status(400).json({ message: "Too many attempts. Please resend." });
      }

      // Verify OTP
      if (user.emailOtpHash !== hashOtp(otp)) {
        await storage.updateUserOtp(userId, {
          emailOtpHash: user.emailOtpHash,
          emailOtpExpiresAt: user.emailOtpExpiresAt,
          otpAttempts: user.otpAttempts + 1
        });
        return res.status(400).json({ message: "Invalid OTP" });
      }

      // Success
      await storage.verifyUserEmail(userId);
      invalidateAuthCache(userId);

      // Send confirmation email
      if (resend) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Your email is verified",
            text: "Congratulations! Your GoldenLife account is now fully verified.",
          });
        } catch (e) { console.error("Verify confirmation email error", e); }
      }

      // Clear OTP cooldown/attempts on success
      otpRateLimit.delete(user.email);

      res.json({ message: "Email verified successfully" });
    } catch (error) {
      res.status(500).json({ message: "Verification failed" });
    }
  });

  // Resend Email OTP
  app.post("/api/auth/resend-email-otp", async (req: Request, res: Response) => {
    try {
      const { userId } = req.body;
      if (!userId) return res.status(400).json({ message: "User ID required" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.isEmailVerified) return res.status(400).json({ message: "Email already verified" });

      // Rate limit check
      const lastSent = user.lastOtpSentAt ? new Date(user.lastOtpSentAt).getTime() : 0;
      if (Date.now() - lastSent < OTP_COOLDOWN) {
        return res.status(429).json({ message: "Please wait 60s before resending" });
      }

      const otp = generateOtp();
      await storage.updateUserOtp(userId, {
        emailOtpHash: hashOtp(otp),
        emailOtpExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
        otpAttempts: 0,
        lastOtpSentAt: new Date()
      });

      if (resend) {
        await resend.emails.send({
          from: FROM_EMAIL,
          to: user.email,
          subject: "Your GoldenLife verification code",
          text: `Your new verification code is: ${otp}. It expires in 5 minutes.`,
        });
      }

      res.json({ message: "OTP sent successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to resend OTP" });
    }
  });

  // Reset password (authenticated - change password)
  app.post("/api/auth/reset-password", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: "Incorrect current password" });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { password: hashedPassword });

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to update password" });
    }
  });

  // Forgot password
  app.post("/api/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = req.body;
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.json({ message: "If an account exists with this email, you will receive a reset link." });
      }

      // Generate a secure 6-digit code for reset
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const resetHash = hashOtp(resetCode);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      await storage.updateUserOtp(user.id, {
        emailOtpHash: resetHash,
        emailOtpExpiresAt: expiresAt,
        otpAttempts: 0,
        lastOtpSentAt: new Date(),
      });
      
      if (resend) {
        try {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Reset your GoldenLife password",
            text: `You requested a password reset. Use this code to reset your password: ${resetCode}. This code expires in 15 minutes.`,
          });
        } catch (emailError) {
          console.error("Failed to send reset email:", emailError);
        }
      } else {
        console.log(`Password reset code for ${user.email}: ${resetCode}`);
      }

      res.json({ message: "If an account exists with this email, you will receive a reset link." });
    } catch (error) {
      res.status(500).json({ message: "Failed to process forgot password request" });
    }
  });

  // Complete Password Reset (Verify Code & New Password)
  app.post("/api/auth/complete-reset-password", async (req: Request, res: Response) => {
    try {
      const { email, code, newPassword } = req.body;
      if (!email || !code || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check expiry and attempts
      if (!user.emailOtpExpiresAt || new Date(user.emailOtpExpiresAt) < new Date()) {
        return res.status(400).json({ message: "Reset code expired" });
      }
      if (user.otpAttempts >= 5) {
        return res.status(400).json({ message: "Too many attempts. Please request a new code." });
      }

      // Verify Code
      if (user.emailOtpHash !== hashOtp(code)) {
        await storage.updateUserOtp(user.id, {
          emailOtpHash: user.emailOtpHash,
          emailOtpExpiresAt: user.emailOtpExpiresAt,
          otpAttempts: user.otpAttempts + 1
        });
        return res.status(400).json({ message: "Invalid reset code" });
      }

      // Success - Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await storage.updateUser(user.id, { 
        password: hashedPassword,
        emailOtpHash: null,
        emailOtpExpiresAt: null,
        otpAttempts: 0
      });

      res.json({ message: "Password reset successfully. You can now login with your new password." });
    } catch (error) {
      console.error("Complete password reset error:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Public list of sub-services (used by provider dashboard service-form to populate categories)
  // Supports optional ?category= filter (e.g. physiotherapist, doctor, nurse)
  app.get("/api/sub-services", async (req, res) => {
    try {
      const all = await storage.getAllSubServices();
      const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
      const subServices = category ? all.filter((s: any) => s.category === category) : all;
      res.json(subServices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sub-services" });
    }
  });

  // Allow any authenticated user (provider or admin) to create new sub-service
  // categories so providers can add their own services from the dashboard.
  app.post("/api/sub-services", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertSubServiceSchema.parse(req.body);
      // Avoid duplicate (name, category) collisions with a clearer error
      const existing = await storage.getAllSubServices();
      const collision = existing.find(
        (s) => s.name.trim().toLowerCase() === String(data.name).trim().toLowerCase() && s.category === data.category,
      );
      if (collision) {
        return res.status(409).json({ message: `Category "${data.name}" already exists for ${data.category}.` });
      }
      const subService = await storage.createSubService(data);
      res.status(201).json(subService);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: error.errors?.[0]?.message || "Invalid sub-service data" });
      }
      console.error("Create sub-service error:", error);
      res.status(500).json({ message: "Failed to create sub-service" });
    }
  });

  // Allow any authenticated user to rename a sub-service category.
  app.patch("/api/sub-services/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id;
      const existing = await storage.getSubService(id);
      if (!existing) return res.status(404).json({ message: "Category not found" });

      const allowed: Record<string, any> = {};
      if (typeof req.body?.name === "string") allowed.name = req.body.name.trim();
      if (typeof req.body?.category === "string") allowed.category = req.body.category;
      if (typeof req.body?.description === "string") allowed.description = req.body.description;
      if (typeof req.body?.isActive === "boolean") allowed.isActive = req.body.isActive;

      if (allowed.name !== undefined && !allowed.name) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }

      if (allowed.name || allowed.category) {
        const all = await storage.getAllSubServices();
        const newName = (allowed.name ?? existing.name).toString().trim().toLowerCase();
        const newCategory = allowed.category ?? existing.category;
        const collision = all.find(
          (s) => s.id !== id && s.name.trim().toLowerCase() === newName && s.category === newCategory,
        );
        if (collision) {
          return res.status(409).json({ message: `Category "${allowed.name ?? existing.name}" already exists for ${newCategory}.` });
        }
      }

      const updated = await storage.updateSubService(id, allowed);
      res.json(updated);
    } catch (error: any) {
      console.error("Update sub-service error:", error);
      res.status(500).json({ message: "Failed to update category" });
    }
  });

  // Allow any authenticated user to delete a sub-service category, but only if
  // no services currently reference it.
  app.delete("/api/sub-services/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const id = req.params.id;
      const existing = await storage.getSubService(id);
      if (!existing) return res.status(404).json({ message: "Category not found" });

      const inUse = await db.select({ id: services.id }).from(services).where(eq(services.subServiceId, id));
      if (inUse.length > 0) {
        return res.status(409).json({
          message: `Cannot delete "${existing.name}" — it is used by ${inUse.length} service${inUse.length === 1 ? "" : "s"}.`,
        });
      }

      await storage.deleteSubService(id);
      res.status(204).end();
    } catch (error: any) {
      console.error("Delete sub-service error:", error);
      res.status(500).json({ message: "Failed to delete category" });
    }
  });

  // Sub-services management
  app.get("/api/admin/sub-services", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const subServices = await storage.getAllSubServices();
    res.json(subServices);
  });

  app.post("/api/admin/sub-services", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const data = insertSubServiceSchema.parse(req.body);
      const subService = await storage.createSubService(data);
      res.json(subService);
    } catch (error) {
      res.status(400).json({ message: "Invalid sub-service data" });
    }
  });

  app.patch("/api/admin/sub-services/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    const subService = await storage.updateSubService(req.params.id, req.body);
    res.json(subService);
  });

  app.delete("/api/admin/sub-services/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    await storage.deleteSubService(req.params.id);
    res.status(204).end();
  });

  // Practitioners
  app.get("/api/providers/:providerId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const practitioner = await storage.createPractitioner({
        ...req.body,
        providerId: req.params.providerId
      });
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.get("/api/providers/:providerId/services/:serviceId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/admin/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    try {
      const sp = await storage.addPractitionerToService({
        ...req.body,
        serviceId: req.params.serviceId
      });
      res.status(201).json(sp);
    } catch (error) {
      res.status(400).json({ message: "Failed to add practitioner to service" });
    }
  });

  // Booking
  app.get("/api/providers/:id/with-fees", async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      
      const subServices = await storage.getAllSubServices();
      const enrichedServices = provider.services.map(service => {
        const providerType = (provider as any).providerType;
        const matched = subServices.find(ss => ss.name === service.name && ss.category === providerType);
        return {
          ...service,
          platformFee: matched ? matched.platformFee : "0.00"
        };
      });

      res.json({
        ...provider,
        services: enrichedServices
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider details" });
    }
  });

  // Get patient appointments
  app.get("/api/appointments/patient", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      
      // Check for reviews for each appointment
      const appointmentsWithReviewStatus = await Promise.all(appointments.map(async (apt) => {
        const review = await storage.getReviewByAppointment(apt.id);
        return { ...apt, hasReview: !!review };
      }));
      
      res.json(appointmentsWithReviewStatus);
    } catch (error) {
      console.error("Get patient appointments error:", error);
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Create a review
  app.post("/api/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { appointmentId, providerId, rating, comment } = req.body;
      
      // Validate appointment ownership and status
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || appointment.patientId !== req.user!.id) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      
      if (appointment.status !== "completed") {
        return res.status(400).json({ message: "Can only review completed appointments" });
      }

      // Check if already reviewed
      const existingReview = await storage.getReviewByAppointment(appointmentId);
      if (existingReview) {
        return res.status(400).json({ message: "Review already exists for this appointment" });
      }

      const review = await storage.createReview({
        appointmentId,
        patientId: req.user!.id,
        providerId,
        rating,
        comment,
      });

      res.status(201).json(review);
    } catch (error) {
      console.error("Create review error:", error);
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // Get provider appointments
  app.get("/api/appointments/provider", authenticateToken, async (req: AuthRequest, res: Response) => {
    const t0 = Date.now();
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      const t1 = Date.now();
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const appointments = await storage.getAppointmentsByProvider(provider.id);
      const t2 = Date.now();
      res.json(appointments);
      const t3 = Date.now();
      if (t3 - t0 > 1000) {
        console.warn(
          `[slow] /api/appointments/provider total=${t3 - t0}ms ` +
          `getProvider=${t1 - t0}ms getAppointments=${t2 - t1}ms ` +
          `serialize=${t3 - t2}ms rows=${appointments.length}`
        );
      }
    } catch (error) {
      console.error("Get provider appointments error:", error);
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  app.patch("/api/auth/profile", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const allowedFields = [
        "firstName", "lastName", "phone", "mobileNumber",
        "address", "city", "state", "zipCode",
        "avatarUrl", "gallery",
        "gender", "dateOfBirth", "preferredPronouns", "occupation", "maritalStatus",
        "socialNumber",
        "emergencyContactName", "emergencyContactPhone", "emergencyContactRelation",
        "bloodGroup", "heightCm", "weightKg",
        "knownAllergies", "medicalConditions", "currentMedications", "pastSurgeries",
        "insuranceProvider", "insurancePolicyNumber", "primaryCarePhysician",
        "languagePreference",
        "preferredCurrency",
      ] as const;

      const updateData: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }
      // Coerce date string -> Date for timestamp columns.
      if (typeof updateData.dateOfBirth === "string" && updateData.dateOfBirth) {
        updateData.dateOfBirth = new Date(updateData.dateOfBirth);
      } else if (updateData.dateOfBirth === "") {
        updateData.dateOfBirth = null;
      }
      // Coerce numeric fields.
      if (updateData.heightCm !== undefined && updateData.heightCm !== null && updateData.heightCm !== "") {
        const n = Number(updateData.heightCm);
        updateData.heightCm = Number.isFinite(n) ? Math.round(n) : null;
      } else if (updateData.heightCm === "") {
        updateData.heightCm = null;
      }
      if (updateData.weightKg === "") updateData.weightKg = null;

      if (Object.keys(updateData).length === 0) {
        const user = await storage.getUser(req.user!.id);
        if (!user) return res.status(404).json({ message: "User not found" });
        const { password: _, ...userWithoutPassword } = user;
        return res.json({ user: userWithoutPassword });
      }

      const user = await storage.updateUser(req.user!.id, updateData);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      invalidateAuthCache(req.user!.id);
      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Simple base64 image upload (mock/internal storage)
  app.post("/api/upload", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { image } = req.body; // Expecting base64
      if (!image) return res.status(400).json({ message: "No image provided" });
      
      res.json({ url: image });
    } catch (error) {
      res.status(500).json({ message: "Upload failed" });
    }
  });

  // ============ REAL-TIME CHAT ROUTES ============
  app.get("/api/chat/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const convs = await storage.getRealtimeConversations(req.user!.id);
      res.json(convs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get conversations" });
    }
  });

  app.get("/api/chat/messages/:conversationId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const msgs = await storage.getRealtimeMessages(req.params.conversationId);
      res.json(msgs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/chat/conversations", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { participantId } = req.body;
      const conv = await storage.getOrCreateConversation(req.user!.id, participantId);
      res.json(conv);
    } catch (error) {
      res.status(500).json({ message: "Failed to create conversation" });
    }
  });

  // Get all providers
  app.get("/api/providers", async (req: Request, res: Response) => {
    try {
      const providers = await storage.getAllProviders();
      const sanitized = providers.map(p => sanitizeProviderListItem(p));
      res.set("Cache-Control", "public, max-age=30");
      res.json(sanitized);
    } catch (error) {
      console.error("Get providers error:", error);
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  // Get provider by ID
  app.get("/api/providers/:id", async (req: Request, res: Response) => {
    try {
      const provider = await storage.getProviderWithServices(req.params.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      res.json(sanitizeProviderWithUser(provider));
    } catch (error) {
      console.error("Get provider error:", error);
      res.status(500).json({ message: "Failed to get provider" });
    }
  });

  // Get provider reviews
  app.get("/api/providers/:id/reviews", async (req: Request, res: Response) => {
    try {
      const reviews = await storage.getReviewsByProvider(req.params.id);
      res.json(reviews);
    } catch (error) {
      res.status(500).json({ message: "Failed to get reviews" });
    }
  });

  // Get provider's average response time (minutes)
  app.get("/api/providers/:id/response-time", async (req: Request, res: Response) => {
    try {
      const minutes = await storage.getProviderResponseTimeMinutes(req.params.id);
      res.json({ minutes });
    } catch (error) {
      console.error("Response time error:", error);
      res.status(500).json({ message: "Failed to get response time" });
    }
  });

  // Get available time slots for a provider on a given date.
  // Combines the provider's published slots with their existing appointments
  // so the booking UI can disable already-booked times.
  app.get("/api/providers/:id/available-slots", async (req: Request, res: Response) => {
    try {
      const { date } = req.query as { date?: string };
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ message: "date query param required (YYYY-MM-DD)" });
      }
      // Run in parallel; the booked-times query is a lightweight scan with no joins.
      const [slots, blockedList] = await Promise.all([
        storage.getTimeSlotsByProvider(req.params.id, date),
        storage.getProviderBookedStartTimes(req.params.id, date),
      ]);
      const blockedTimes = new Set(blockedList);

      // Mark each slot as available/booked. If provider hasn't published any slots,
      // return an empty array — booking UI will fall back to the default catalogue.
      const result = slots.map(s => ({
        id: s.id,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        isBooked: s.isBooked || blockedTimes.has(s.startTime),
        isBlocked: s.isBlocked,
      }));
      res.json(result);
    } catch (error) {
      console.error("Available slots error:", error);
      res.status(500).json({ message: "Failed to get available slots" });
    }
  });

  // ============ SAVED PROVIDERS (favourites) ============
  app.get("/api/saved-providers", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Patient access required" });
      }
      const list = await storage.listSavedProviders(req.user.id);
      res.json(list);
    } catch (error) {
      console.error("List saved providers error:", error);
      res.status(500).json({ message: "Failed to list saved providers" });
    }
  });

  app.get("/api/saved-providers/:providerId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") return res.json({ saved: false });
      const saved = await storage.isProviderSaved(req.user.id, req.params.providerId);
      res.json({ saved });
    } catch (error) {
      console.error("Check saved provider error:", error);
      res.status(500).json({ message: "Failed to check saved status" });
    }
  });

  app.post("/api/saved-providers/:providerId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Patient access required" });
      }
      const provider = await storage.getProvider(req.params.providerId);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const saved = await storage.addSavedProvider(req.user.id, req.params.providerId);
      res.status(201).json(saved);
    } catch (error) {
      console.error("Add saved provider error:", error);
      res.status(500).json({ message: "Failed to save provider" });
    }
  });

  app.delete("/api/saved-providers/:providerId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "patient") {
        return res.status(403).json({ message: "Patient access required" });
      }
      await storage.removeSavedProvider(req.user.id, req.params.providerId);
      res.status(204).end();
    } catch (error) {
      console.error("Remove saved provider error:", error);
      res.status(500).json({ message: "Failed to remove saved provider" });
    }
  });

  // Create support ticket
  app.post("/api/support/tickets", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const result = insertSupportTicketSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ message: "Invalid ticket data", errors: result.error.errors });
      }

      const ticket = await storage.createSupportTicket({
        ...result.data,
        userId: req.user?.id || null,
        status: "open",
      });
      res.status(201).json(ticket);
    } catch (error) {
      console.error("Create ticket error:", error);
      res.status(500).json({ message: "Failed to create support ticket" });
    }
  });

  // Update user suspension status
  app.patch("/api/admin/users/:id/suspend", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { isSuspended, suspensionReason } = req.body;
      const user = await storage.updateUser(req.params.id, {
        isSuspended,
        suspensionReason: isSuspended ? suspensionReason : null
      });
      if (!user) return res.status(404).json({ message: "User not found" });
      invalidateAuthCache(req.params.id);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // Get all users (Admin)
  app.get("/api/admin/users", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const users = await storage.getAllUsers();
      res.json(users.map(u => sanitizeUser(u, { strip: "public" })));
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  // Get current provider (for logged in provider)
  app.get("/api/provider/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });

      const provider = await storage.getProviderByUserId(userId);
      if (!provider) return res.status(404).json({ message: "Provider profile not found" });
      
      const providerWithServices = await storage.getProviderWithServices(provider.id);
      res.json(providerWithServices || provider);
    } catch (error) {
      console.error("Error fetching provider/me:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/services/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const service = await storage.updateService(req.params.id, req.body);
      res.json(service);
    } catch (error) {
      res.status(400).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/services/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deleteService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete service" });
    }
  });

  app.patch("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const practitioner = await storage.updatePractitioner(req.params.id, req.body);
      res.json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Failed to update practitioner" });
    }
  });

  app.delete("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.deletePractitioner(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to delete practitioner" });
    }
  });

  app.patch("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const updates: any = {};
      if (req.body.fee !== undefined) updates.fee = req.body.fee;
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      
      let sp;
      if (updates.fee !== undefined) {
        sp = await storage.updateServicePractitionerFee(req.params.id, updates.fee);
      }
      
      if (updates.isActive !== undefined) {
        const [updated] = await db.update(servicePractitioners)
          .set({ isActive: updates.isActive })
          .where(eq(servicePractitioners.id, req.params.id))
          .returning();
        sp = updated;
      }
      
      res.json(sp);
    } catch (error) {
      res.status(400).json({ message: "Failed to update assignment" });
    }
  });

  app.delete("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.removePractitionerFromService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to remove assignment" });
    }
  });

  // Notifications
  app.get("/api/notifications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const notifications = await storage.getUserNotifications(req.user!.id);
      res.json(notifications);
    } catch (error) {
      res.status(500).json({ message: "Failed to get notifications" });
    }
  });

  app.patch("/api/notifications/:id/read", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to mark notification as read" });
    }
  });

  app.get("/api/notifications/unread-count", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const c = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count: c });
    } catch (error) {
      res.status(500).json({ message: "Failed to get unread count" });
    }
  });

  app.post("/api/notifications/mark-all-read", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.markAllNotificationsRead(req.user!.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to mark all read" });
    }
  });

  // Provider's own reviews list
  app.get("/api/reviews/provider/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider only" });
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const list = await storage.getReviewsByProvider(provider.id);
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "Failed to load reviews" });
    }
  });

  // Reply to a review
  app.patch("/api/reviews/:id/reply", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { reply } = req.body as { reply?: string };
      if (!reply || !reply.trim()) return res.status(400).json({ message: "Reply text required" });
      const review = await storage.getReview(req.params.id);
      if (!review) return res.status(404).json({ message: "Review not found" });
      if (req.user?.role !== "admin") {
        if (req.user?.role !== "provider") return res.status(403).json({ message: "Forbidden" });
        const provider = await storage.getProviderByUserId(req.user.id);
        if (!provider || provider.id !== review.providerId) {
          return res.status(403).json({ message: "Not your review" });
        }
      }
      const updated = await storage.replyToReview(req.params.id, reply.trim());
      // notify the patient
      try {
        await storage.createUserNotification({
          userId: review.patientId,
          type: "review",
          title: "Provider replied to your review",
          message: reply.trim().slice(0, 140),
          isRead: false,
        });
      } catch {}
      try {
        const provWithUser = await storage.getProviderWithUser(review.providerId);
        const provName = provWithUser ? `${provWithUser.user.firstName} ${provWithUser.user.lastName}` : "Your provider";
        notify.reviewReplied(review.patientId, {
          providerName: provName,
          reviewId: review.id,
        }).catch(err => console.error("[notify] reviewReplied", err));
      } catch (e) { console.error("[notify] reviewReplied dispatch failed:", e); }
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Failed to reply" });
    }
  });

  // Duplicate service
  app.post("/api/services/:id/duplicate", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const src = await storage.getService(req.params.id);
      if (!src) return res.status(404).json({ message: "Service not found" });
      if (req.user?.role !== "admin") {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== src.providerId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }
      const copy = await storage.duplicateService(req.params.id);
      res.status(201).json(copy);
    } catch (error) {
      res.status(500).json({ message: "Failed to duplicate service" });
    }
  });

  // Reorder services
  app.patch("/api/services/reorder", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { updates } = req.body as { updates: { id: string; sortOrder: number }[] };
      if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ message: "Updates required" });
      }
      // Authorisation: every service must belong to caller (or admin)
      if (req.user?.role !== "admin") {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider) return res.status(403).json({ message: "Forbidden" });
        for (const u of updates) {
          const s = await storage.getService(u.id);
          if (!s || s.providerId !== provider.id) {
            return res.status(403).json({ message: "Not your service" });
          }
        }
      }
      await storage.reorderServices(updates);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to reorder" });
    }
  });

  // Bulk availability (weekly slot generator)
  app.post("/api/availability/bulk", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user?.role !== "provider" && req.user?.role !== "admin") {
        return res.status(403).json({ message: "Provider only" });
      }
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider && req.user?.role !== "admin") {
        return res.status(404).json({ message: "Provider not found" });
      }
      const { dates, slots, replaceExisting } = req.body as {
        dates: string[];
        slots: { startTime: string; endTime: string }[];
        replaceExisting?: boolean;
      };
      if (!Array.isArray(dates) || dates.length === 0 || !Array.isArray(slots) || slots.length === 0) {
        return res.status(400).json({ message: "dates and slots required" });
      }
      const providerId = provider!.id;
      if (replaceExisting) {
        for (const d of dates) {
          await storage.deleteTimeSlotsByProviderAndDate(providerId, d);
        }
      }
      const toCreate = dates.flatMap((date) =>
        slots.map((s) => ({
          providerId,
          date,
          startTime: s.startTime,
          endTime: s.endTime,
          isBooked: false,
          isBlocked: false,
        })),
      );
      const created = await storage.bulkCreateTimeSlots(toCreate as any);
      res.status(201).json({ count: created.length });
    } catch (error) {
      console.error("[availability/bulk] error:", error);
      res.status(500).json({ message: "Failed to create slots" });
    }
  });

  // Reschedule / edit appointment fields (date, time, privateNote)
  app.patch("/api/appointments/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await storage.getAppointment(req.params.id);
      if (!existing) return res.status(404).json({ message: "Appointment not found" });

      // Authorisation: admin OR provider owning the appointment
      if (req.user?.role !== "admin") {
        if (req.user?.role !== "provider") return res.status(403).json({ message: "Forbidden" });
        const provider = await storage.getProviderByUserId(req.user.id);
        if (!provider || provider.id !== existing.providerId) {
          return res.status(403).json({ message: "Forbidden" });
        }
      }

      const allowed: any = {};
      const { date, startTime, endTime, privateNote, notes } = req.body as any;
      if (date) allowed.date = String(date);
      if (startTime) allowed.startTime = startTime;
      if (endTime) allowed.endTime = endTime;
      if (typeof privateNote === "string") allowed.privateNote = privateNote;
      if (typeof notes === "string") allowed.notes = notes;

      const isReschedule = !!(date || startTime || endTime);
      if (isReschedule) {
        allowed.status = "rescheduled";
      }

      const updated = await storage.updateAppointment(req.params.id, allowed);

      if (isReschedule && updated) {
        try {
          await storage.createUserNotification({
            userId: updated.patientId,
            type: "appointment",
            title: "Appointment rescheduled",
            message: `Your appointment was rescheduled to ${updated.date} at ${updated.startTime}.`,
            isRead: false,
          });
        } catch {}
      }
      res.json(updated);
    } catch (error) {
      console.error("[PATCH /api/appointments/:id] error:", error);
      res.status(500).json({ message: "Failed to update appointment" });
    }
  });

  // Setup provider profile
  app.post("/api/provider/setup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { practitioners, ...providerData } = req.body;
      const userId = req.user!.id;

      // Safely format licenseExpiryDate only if it's a non-empty valid date string
      if (providerData.licenseExpiryDate && typeof providerData.licenseExpiryDate === "string" && providerData.licenseExpiryDate.trim() !== "") {
        const parsed = new Date(providerData.licenseExpiryDate);
        if (!isNaN(parsed.getTime())) {
          providerData.licenseExpiryDate = parsed.toISOString();
        } else {
          delete providerData.licenseExpiryDate;
        }
      } else {
        delete providerData.licenseExpiryDate;
      }

      const existingProvider = await storage.getProviderByUserId(userId);

      let provider;
      if (existingProvider) {
        // Update existing provider profile
        provider = await storage.updateProvider(existingProvider.id, {
          ...providerData,
          userId,
        });
      } else {
        // Create new provider profile
        provider = await storage.createProvider({
          ...providerData,
          userId,
          status: "pending",
          isVerified: false,
          isActive: true,
        });
      }

      // Update user role to provider
      await storage.updateUser(userId, { role: "provider" });
      invalidateAuthCache(userId);

      // Upsert practitioners if provided
      if (practitioners && Array.isArray(practitioners)) {
        for (const p of practitioners) {
          if (p.name && p.name.trim() !== "") {
            await storage.createMedicalPractitioner({
              ...p,
              providerId: provider!.id,
            });
          }
        }
      }

      res.status(200).json(provider);
    } catch (error: any) {
      console.error("Provider setup error:", error);
      res.status(500).json({ message: error.message || "Failed to setup provider profile" });
    }
  });

  // Get platform settings
  app.get("/api/admin/settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const settings = await storage.getAllPlatformSettings();
      res.json(settings);
    } catch (error) {
      res.status(500).json({ message: "Failed to get platform settings" });
    }
  });

  // Get provider with booking statistics for admin
  app.get("/api/admin/providers/:id/stats", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const providerId = req.params.id;
      const appointments = await storage.getAppointmentsByProvider(providerId);
      
      const stats = {
        total: appointments.length,
        pending: appointments.filter(a => a.status === "pending").length,
        confirmed: appointments.filter(a => a.status === "confirmed").length,
        completed: appointments.filter(a => a.status === "completed").length,
        cancelled: appointments.filter(a => a.status === "cancelled").length,
        bookings: appointments.map(a => ({
          id: a.id,
          date: a.date,
          startTime: a.startTime,
          status: a.status,
          patientName: `${a.patient.firstName} ${a.patient.lastName}`,
          amount: a.totalAmount
        }))
      };
      
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider statistics" });
    }
  });

  // Update provider detail (including dates and status)
  app.patch("/api/admin/providers/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }
      if (provider.userId) invalidateAuthCache(provider.userId);
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  // Update platform settings
  app.post("/api/admin/settings", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "admin") {
        return res.status(403).json({ message: "Admin access required" });
      }
      const { key, value } = req.body;
      if (key === undefined || value === undefined) {
        return res.status(400).json({ message: "Key and value are required" });
      }
      const setting = await storage.updatePlatformSetting(key, String(value));
      if (!setting) {
        return res.status(404).json({ message: "Setting not found" });
      }
      res.json(setting);
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Failed to update platform setting" });
    }
  });

  // ============ PROVIDER SERVICES & PRACTITIONERS ============
  app.get("/api/providers/:providerId/services", async (req, res) => {
    try {
      const providerServices = await storage.getServicesByProvider(req.params.providerId);
      res.json(providerServices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/providers/:providerId/practitioners", async (req, res) => {
    try {
      const providerPractitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(providerPractitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.get("/api/services/:serviceId/practitioners", async (req, res) => {
    try {
      const servicePractitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(servicePractitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(403).json({ message: "Unauthorized" });
      }
      const data = insertPractitionerSchema.parse({ ...req.body, providerId: provider.id });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.post("/api/service-practitioners", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(403).json({ message: "Unauthorized" });
      }

      const data = insertServicePractitionerSchema.parse(req.body);
      const result = await storage.addPractitionerToService(data);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: "Invalid assignment data" });
    }
  });

  app.delete("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      await storage.removePractitionerFromService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(400).json({ message: "Failed to remove assignment" });
    }
  });

  app.patch("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res) => {
    try {
      const { isActive } = req.body;
      // Note: storage.ts might need a more general update method, but for now we use what's there
      // or assume the storage interface supports Partial updates if I added them
      const result = await db.update(servicePractitioners).set({ isActive }).where(eq(servicePractitioners.id, req.params.id)).returning();
      res.json(result[0]);
    } catch (error) {
      res.status(400).json({ message: "Failed to update assignment" });
    }
  });

  // Services & Practitioners
  app.get("/api/providers/:providerId/services", async (req, res) => {
    try {
      const services = await storage.getServicesByProvider(req.params.providerId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch services" });
    }
  });

  app.get("/api/services/:serviceId/practitioners", async (req, res) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/services", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const data = insertServiceSchema.parse({ ...req.body, providerId: provider.id });
      const service = await storage.createService(data);
      res.status(201).json(service);
    } catch (error) {
      res.status(400).json({ message: "Invalid service data" });
    }
  });

  app.post("/api/practitioners", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const data = insertPractitionerSchema.parse({ ...req.body, providerId: provider.id });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  // ========== SERVICE PACKAGES ==========
  // Public: list active packages for a provider (used on provider profile)
  app.get("/api/providers/:providerId/packages", async (req: Request, res: Response) => {
    try {
      const packages = await storage.getPackagesByProvider(req.params.providerId, { activeOnly: true });
      res.json(packages);
    } catch (error) {
      console.error("Error fetching provider packages:", error);
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  // Provider: list own packages (active + inactive)
  app.get("/api/provider/packages", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const packages = await storage.getPackagesByProvider(provider.id);
      res.json(packages);
    } catch (error) {
      console.error("Error fetching packages:", error);
      res.status(500).json({ message: "Failed to fetch packages" });
    }
  });

  // Provider: create a new package
  app.post("/api/provider/packages", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const { serviceIds, ...rest } = req.body as { serviceIds?: string[]; [k: string]: any };
      if (!Array.isArray(serviceIds) || serviceIds.length < 2) {
        return res.status(400).json({ message: "A package must include at least 2 services" });
      }
      // Verify all services belong to this provider
      const providerServices = await storage.getServicesByProvider(provider.id);
      const ownedIds = new Set(providerServices.map(s => s.id));
      if (!serviceIds.every(id => ownedIds.has(id))) {
        return res.status(400).json({ message: "All services must belong to your account" });
      }
      const data = insertServicePackageSchema.parse({ ...rest, providerId: provider.id });
      const pkg = await storage.createServicePackage(data, serviceIds);
      res.status(201).json(pkg);
    } catch (error: any) {
      console.error("Error creating package:", error);
      res.status(400).json({ message: error?.message || "Invalid package data" });
    }
  });

  // Provider: update a package
  app.patch("/api/provider/packages/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const existing = await storage.getServicePackage(req.params.id);
      if (!existing || existing.providerId !== provider.id) {
        return res.status(404).json({ message: "Package not found" });
      }
      const { serviceIds, providerId: _ignored, ...rest } = req.body as { serviceIds?: string[]; providerId?: string; [k: string]: any };
      if (serviceIds !== undefined) {
        if (!Array.isArray(serviceIds) || serviceIds.length < 2) {
          return res.status(400).json({ message: "A package must include at least 2 services" });
        }
        const providerServices = await storage.getServicesByProvider(provider.id);
        const ownedIds = new Set(providerServices.map(s => s.id));
        if (!serviceIds.every(id => ownedIds.has(id))) {
          return res.status(400).json({ message: "All services must belong to your account" });
        }
      }
      const updated = await storage.updateServicePackage(req.params.id, rest, serviceIds);
      res.json(updated);
    } catch (error: any) {
      console.error("Error updating package:", error);
      res.status(400).json({ message: error?.message || "Invalid package data" });
    }
  });

  // Provider: delete a package
  app.delete("/api/provider/packages/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const provider = await storage.getProviderByUserId(req.user.id);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      const existing = await storage.getServicePackage(req.params.id);
      if (!existing || existing.providerId !== provider.id) {
        return res.status(404).json({ message: "Package not found" });
      }
      await storage.deleteServicePackage(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting package:", error);
      res.status(500).json({ message: "Failed to delete package" });
    }
  });

  app.post("/api/service-practitioners", authenticateToken, async (req: AuthRequest, res) => {
    if (req.user?.role !== "provider") return res.status(403).json({ message: "Provider access required" });
    try {
      const data = insertServicePractitionerSchema.parse(req.body);
      const sp = await storage.addPractitionerToService(data);
      res.status(201).json(sp);
    } catch (error) {
      res.status(400).json({ message: "Invalid service practitioner data" });
    }
  });

  // Validate / lookup a promo code (used by booking page)
  app.post("/api/promo-codes/validate", optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const { code, amount, providerId } = req.body as { code?: string; amount?: number; providerId?: string };
      if (!code) return res.status(400).json({ message: "Code required" });
      const promo = await storage.getPromoCodeByCode(String(code).trim().toUpperCase());
      if (!promo || !promo.isActive) {
        return res.status(404).json({ message: "Invalid promo code" });
      }
      const now = new Date();
      if (new Date(promo.validFrom) > now || new Date(promo.validUntil) < now) {
        return res.status(400).json({ message: "Promo code is not active" });
      }
      if (promo.maxUses != null && (promo.usedCount ?? 0) >= promo.maxUses) {
        return res.status(400).json({ message: "Promo code has reached its usage limit" });
      }
      if (promo.applicableProviders && promo.applicableProviders.length > 0 && providerId && !promo.applicableProviders.includes(providerId)) {
        return res.status(400).json({ message: "Promo code not valid for this provider" });
      }
      const baseAmount = Number(amount ?? 0);
      if (promo.minAmount != null && baseAmount < Number(promo.minAmount)) {
        return res.status(400).json({ message: `Minimum order amount is ${promo.minAmount}` });
      }
      let discount = 0;
      if (promo.discountType === "percentage") {
        discount = (baseAmount * Number(promo.discountValue)) / 100;
      } else {
        discount = Number(promo.discountValue);
      }
      if (discount > baseAmount) discount = baseAmount;
      res.json({
        code: promo.code,
        discountType: promo.discountType,
        discountValue: promo.discountValue,
        discount: Number(discount.toFixed(2)),
      });
    } catch (e) {
      console.error("Promo validate error:", e);
      res.status(500).json({ message: "Failed to validate promo code" });
    }
  });

  // Create appointment
  app.post("/api/appointments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { providerId, serviceId, practitionerId, date, startTime, endTime, visitType, paymentMethod, notes, patientAddress, patientLatitude, patientLongitude, totalAmount, promoCode, contactMobile, familyMemberId } = req.body;
      const userId = req.user?.id;

      // Validate family member ownership if provided
      let validatedFamilyMemberId: string | null = null;
      if (familyMemberId) {
        const member = await storage.getFamilyMember(familyMemberId);
        if (!member || member.primaryUserId !== userId) {
          return res.status(403).json({ message: "Family member not found or not yours." });
        }
        validatedFamilyMemberId = member.id;
      }

      // Log appointment request for debugging but keep it concise to avoid large base64 strings
      console.log(`Received appointment request for provider ${providerId} on ${date}`);

      if (!userId) {
        console.log("Booking failed: User not authenticated");
        return res.status(401).json({ message: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.isEmailVerified) {
        console.log("Booking failed: Email not verified for user", userId);
        return res.status(403).json({ message: "Email verification required to book" });
      }

      // Reject past dates / past time slots
      try {
        const slotDate = new Date(`${date}T${startTime || "00:00"}:00`);
        if (isNaN(slotDate.getTime())) {
          return res.status(400).json({ message: "Invalid date or time." });
        }
        if (slotDate.getTime() < Date.now() - 60_000) {
          return res.status(400).json({ message: "You cannot book an appointment in the past." });
        }
      } catch {
        return res.status(400).json({ message: "Invalid date or time." });
      }

      // Get provider to calculate fee if not provided
      const provider = await storage.getProvider(providerId);
      if (!provider) {
        console.log("Booking failed: Provider not found", providerId);
        return res.status(404).json({ message: "Provider not found" });
      }

      // Prevent double-booking: refuse if the same provider already has an active
      // appointment overlapping this exact date+time (any non-terminal status).
      try {
        const existingForProvider = await storage.getAppointmentsByProvider(providerId);
        const conflict = existingForProvider.find(a =>
          a.date === date &&
          a.startTime === startTime &&
          !["cancelled", "rejected"].includes(a.status)
        );
        if (conflict) {
          return res.status(409).json({ message: "This time slot is no longer available. Please pick another time." });
        }
      } catch (conflictErr) {
        console.error("Conflict check failed (continuing):", conflictErr);
      }

      // Prevent the same patient from booking themselves twice into the same slot
      try {
        const patientAppointments = await storage.getAppointmentsByPatient(userId);
        const dup = patientAppointments.find(a =>
          a.providerId === providerId &&
          a.date === date &&
          a.startTime === startTime &&
          !["cancelled", "rejected"].includes(a.status)
        );
        if (dup) {
          return res.status(409).json({ message: "You already have an appointment at this time." });
        }
      } catch (dupErr) {
        console.error("Duplicate check failed (continuing):", dupErr);
      }

      // Validate practitioner and fee if provided
      let fee: any = totalAmount;
      if (serviceId && practitionerId) {
        const servicePractitioners = await storage.getServicePractitioners(serviceId);
        const sp = servicePractitioners.find(p => p.practitionerId === practitionerId);
        if (!sp) {
          return res.status(400).json({ message: "Practitioner not assigned to this service" });
        }
        fee = sp.fee;
      } else if (!totalAmount) {
        fee = visitType === "home" && provider.homeVisitFee
          ? provider.homeVisitFee
          : provider.consultationFee;
      }

      // Compute platform fee from sub-service the service points to (if any)
      let platformFee = 0;
      let promoDiscount = 0;
      let appliedPromoCode: string | null = null;
      try {
        if (serviceId) {
          const svc = await storage.getService(serviceId);
          if (svc?.subServiceId) {
            const sub = await storage.getSubService(svc.subServiceId);
            if (sub?.platformFee) platformFee = Number(sub.platformFee);
          }
        }
      } catch (e) {
        console.error("[booking] platform fee lookup failed:", e);
      }

      // Apply promo code if provided
      if (promoCode && typeof promoCode === "string" && promoCode.trim()) {
        try {
          const promo = await storage.getPromoCodeByCode(promoCode.trim().toUpperCase());
          if (promo && promo.isActive) {
            const now = new Date();
            const okWindow = new Date(promo.validFrom) <= now && new Date(promo.validUntil) >= now;
            const okUses = promo.maxUses == null || (promo.usedCount ?? 0) < promo.maxUses;
            const okProvider = !promo.applicableProviders || promo.applicableProviders.length === 0 || promo.applicableProviders.includes(providerId);
            const baseForDiscount = Number(fee) + platformFee;
            const okMin = promo.minAmount == null || baseForDiscount >= Number(promo.minAmount);
            if (okWindow && okUses && okProvider && okMin) {
              if (promo.discountType === "percentage") {
                promoDiscount = (baseForDiscount * Number(promo.discountValue)) / 100;
              } else {
                promoDiscount = Number(promo.discountValue);
              }
              if (promoDiscount > baseForDiscount) promoDiscount = baseForDiscount;
              appliedPromoCode = promo.code;
              try {
                await storage.updatePromoCode(promo.id, { usedCount: (promo.usedCount ?? 0) + 1 } as any);
              } catch {}
            }
          }
        } catch (promoErr) {
          console.error("[booking] promo apply failed:", promoErr);
        }
      }

      const finalTotal = Math.max(0, Number(fee) + platformFee - promoDiscount);
      fee = finalTotal;

      // Create appointment
      console.log("Creating appointment with data:", {
        patientId: userId,
        providerId,
        serviceId,
        practitionerId,
        date,
        startTime,
        endTime,
        visitType,
        totalAmount: fee.toString()
      });

      // Reserve the time slot atomically (find-or-create then mark booked).
      // If another patient already reserved this exact slot we abort with 409.
      let reservedSlotId: string | null = null;
      try {
        const reserved = await storage.reserveTimeSlot(providerId, date, startTime, endTime);
        reservedSlotId = reserved.id;
      } catch (slotErr: any) {
        console.warn("Slot reservation failed:", slotErr?.message);
        return res.status(409).json({ message: slotErr?.message || "This time slot is no longer available." });
      }

      const appointment = await storage.createAppointment({
        patientId: userId,
        familyMemberId: validatedFamilyMemberId,
        providerId,
        serviceId: serviceId || null,
        practitionerId: practitionerId || null,
        timeSlotId: reservedSlotId,
        date,
        startTime,
        endTime,
        visitType: visitType || "online",
        status: "pending",
        notes: notes || null,
        patientAddress: patientAddress || null,
        patientLatitude: typeof patientLatitude === "number" ? patientLatitude : null,
        patientLongitude: typeof patientLongitude === "number" ? patientLongitude : null,
        totalAmount: fee.toString(),
        platformFeeAmount: platformFee.toFixed(2),
        promoCode: appliedPromoCode,
        promoDiscount: promoDiscount.toFixed(2),
      } as any);

      // Optionally save the address to the patient's profile for next time.
      if (req.body.saveAddressToProfile === true && patientAddress) {
        try {
          await storage.updateUser(userId, {
            address: patientAddress,
            ...(typeof patientLatitude === "number" ? { savedLatitude: patientLatitude } : {}),
            ...(typeof patientLongitude === "number" ? { savedLongitude: patientLongitude } : {}),
          } as any);
        } catch (saveErr) {
          console.error("Failed to save address to profile:", saveErr);
        }
      }

      console.log("Appointment created:", appointment.id);

      // Create payment record with payment method
      const payment = await storage.createPayment({
        appointmentId: appointment.id,
        patientId: userId,
        amount: fee.toString(),
        paymentMethod: paymentMethod || "card",
        status: "pending",
      });

      console.log("Payment record created:", payment.id);

      // If paying from in-app wallet, debit immediately and confirm the appointment.
      let walletPaid = false;
      if (paymentMethod === "wallet") {
        try {
          const wallet = await storage.getOrCreateWallet(userId);
          if (wallet.isFrozen) {
            throw new Error("Wallet is frozen");
          }
          const idempotencyKey = `appointment:${appointment.id}`;
          await storage.debitWallet(userId, Number(fee), {
            description: `Appointment payment`,
            referenceType: "appointment",
            referenceId: appointment.id,
            idempotencyKey,
          });
          await storage.updatePayment(payment.id, {
            status: "completed",
            paymentMethod: "wallet",
          });
          await storage.updateAppointment(appointment.id, { status: "confirmed" });
          walletPaid = true;
        } catch (walletErr: any) {
          // Mark the appointment cancelled so the patient can retry with another method.
          try {
            await storage.updateAppointment(appointment.id, { status: "cancelled" });
            await storage.updatePayment(payment.id, { status: "failed" });
          } catch {}
          const msg = walletErr?.message || "Wallet payment failed";
          return res.status(msg.toLowerCase().includes("insufficient") ? 402 : 400).json({ message: msg });
        }
      }

      // If paying by card AND Stripe is configured, create a Checkout Session
      // and capture the URL so we can redirect the patient to Stripe.
      let checkoutUrl: string | null = null;
      if (!walletPaid && (paymentMethod === "card" || !paymentMethod) && isStripeConfigured()) {
        try {
          const origin =
            (req.headers.origin as string) ||
            `${req.protocol}://${req.get("host")}`;
          const providerWithUser = await storage.getProviderWithUser(providerId);
          const providerName = providerWithUser
            ? `${providerWithUser.user.firstName} ${providerWithUser.user.lastName}`
            : "Provider";
          const session = await createCheckoutSession({
            appointmentId: appointment.id,
            amount: Number(fee),
            description: `Appointment with ${providerName} on ${date} at ${startTime}`,
            customerEmail: user.email,
            successUrl: `${origin}/booking?stripe=success&appointment=${appointment.id}`,
            cancelUrl: `${origin}/booking?stripe=cancelled&appointment=${appointment.id}`,
            metadata: {
              patientId: userId,
              providerId,
            },
          });
          checkoutUrl = session.url;
          await storage.updatePayment(payment.id, {
            stripeSessionId: session.sessionId,
          });
          console.log("Stripe checkout session created:", session.sessionId);
        } catch (stripeErr) {
          console.error("Stripe checkout creation failed:", stripeErr);
          // Don't fail the whole booking — patient can pay later or admin can recover.
        }
      }

      // Create notifications for both patient and provider
      try {
        const providerWithUser = await storage.getProviderWithUser(providerId);
        
        // Notification for Patient
        await storage.createUserNotification({
          userId: userId,
          type: "appointment",
          title: "Booking Confirmed",
          message: `Your appointment with ${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName} has been successfully booked for ${date} at ${startTime}.`,
          isRead: false,
        });

        // Notification for Provider
        await storage.createUserNotification({
          userId: providerWithUser!.userId,
          type: "appointment",
          title: "New Booking Received",
          message: `You have a new booking from ${user.firstName} ${user.lastName} for ${date} at ${startTime}.`,
          isRead: false,
        });
      } catch (notifyError) {
        console.error("Failed to create booking notifications:", notifyError);
      }

      // Auto-create a chat conversation between patient and provider so they can message immediately
      try {
        const pwu = await storage.getProviderWithUser(providerId);
        if (pwu?.userId && pwu.userId !== userId) {
          await storage.getOrCreateRealtimeConversation(userId, pwu.userId);
        }
      } catch (chatErr) {
        console.error("[chat] auto-create conversation failed:", chatErr);
      }

      // Multi-channel dispatch (email/SMS/WhatsApp/push) for both parties
      try {
        const providerWithUser = await storage.getProviderWithUser(providerId);
        const service = serviceId ? await storage.getService(serviceId) : null;
        const provName = providerWithUser ? `${providerWithUser.user.firstName} ${providerWithUser.user.lastName}` : "your provider";
        notify.appointmentBooked(userId, {
          providerName: provName,
          date, time: startTime, service: service?.name,
          appointmentId: appointment.id,
        }).catch(err => console.error("[notify] appointmentBooked patient", err));
        if (providerWithUser?.userId) {
          dispatchNotification({
            userId: providerWithUser.userId,
            eventKey: "appointment.booked",
            title: "New booking received",
            body: `${user.firstName} ${user.lastName} booked ${date} at ${startTime}.`,
            email: {
              subject: "New booking - GoldenLife",
              headingKey: "appt.confirm.heading",
              intro: `${user.firstName} ${user.lastName} booked an appointment with you.`,
              details: [
                { label: "Date", value: date },
                { label: "Time", value: `${startTime} - ${endTime}` },
                ...(service ? [{ label: "Service", value: service.name }] : []),
                { label: "Visit Type", value: visitType === "home" ? "Home Visit" : visitType === "clinic" ? "Clinic Visit" : "Online Consultation" },
                { label: "Patient Name", value: `${user.firstName} ${user.lastName}` },
                ...(contactMobile ? [{ label: "Patient Phone", value: contactMobile }] : (user.mobileNumber || user.phone) ? [{ label: "Patient Phone", value: (user.mobileNumber || user.phone)! }] : []),
                ...(visitType === "home"
                  ? [{ label: "Patient Address", value: patientAddress || user.address || "Patient will provide address" }]
                  : visitType === "clinic"
                  ? [{ label: "Clinic Address", value: provider.primaryServiceLocation || provider.city || "Clinic" }]
                  : [{ label: "Address", value: "Online (link will be shared)" }]),
                ...(platformFee > 0 ? [{ label: "Platform Fee", value: `$${platformFee.toFixed(2)}` }] : []),
                ...(promoDiscount > 0 ? [{ label: `Promo${appliedPromoCode ? ' (' + appliedPromoCode + ')' : ''}`, value: `-$${promoDiscount.toFixed(2)}` }] : []),
                { label: "Total", value: `$${Number(fee).toFixed(2)}` },
              ],
            },
            data: { appointmentId: appointment.id },
            push: { url: `/provider/appointments/${appointment.id}` },
          }).catch(err => console.error("[notify] appointmentBooked provider", err));
        }
      } catch (e) {
        console.error("[notify] booking dispatch failed:", e);
      }

      // Send booking confirmation email
      if (resend) {
        try {
          const providerWithUser = await storage.getProviderWithUser(providerId);
          const service = serviceId ? await storage.getService(serviceId) : null;
          
          console.log(`Attempting to send booking confirmation to ${user.email}`);
          
          const ics = icsAttachment(`appointment-${appointment.id}.ics`, {
            uid: appointment.id,
            title: `GoldenLife appointment with ${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName}`,
            description: `${service ? service.name + " — " : ""}${visitType === "home" ? "Home visit" : "Online consultation"}`,
            location: visitType === "home" ? (patientAddress || "Patient address") : "Online",
            date,
            startTime,
            endTime,
            organizerName: "GoldenLife",
            organizerEmail: "no-reply@goldenlife.health",
          });

          const providerAddressLine = provider.primaryServiceLocation || provider.city || "";
          const patientAddressLine = patientAddress || user.address || "";
          const emailResult = await resend.emails.send({
            from: FROM_EMAIL,
            to: user.email,
            subject: "Booking Confirmation - GoldenLife",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0f172a;">Booking Confirmed!</h2>
                <p>Hello ${user.firstName},</p>
                <p>Your appointment with <strong>${providerWithUser?.user.firstName} ${providerWithUser?.user.lastName}</strong> has been successfully booked.</p>
                
                <div style="background-color: #f8fafc; padding: 15px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #1e293b;">Appointment Details</h3>
                  <p style="margin: 5px 0;"><strong>Date:</strong> ${date}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> ${startTime} - ${endTime}</p>
                  ${service ? `<p style="margin: 5px 0;"><strong>Service:</strong> ${service.name}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Visit Type:</strong> ${visitType === 'home' ? 'Home Visit' : visitType === 'clinic' ? 'Clinic Visit' : 'Online Consultation'}</p>
                  ${visitType === 'home' && patientAddressLine ? `<p style="margin: 5px 0;"><strong>Visit Address:</strong> ${patientAddressLine}</p>` : ''}
                  ${visitType === 'clinic' && providerAddressLine ? `<p style="margin: 5px 0;"><strong>Clinic Address:</strong> ${providerAddressLine}</p>` : ''}
                  ${platformFee > 0 ? `<p style="margin: 5px 0;"><strong>Platform Fee:</strong> $${platformFee.toFixed(2)}</p>` : ''}
                  ${promoDiscount > 0 ? `<p style="margin: 5px 0; color:#059669;"><strong>Promo Discount${appliedPromoCode ? ' (' + appliedPromoCode + ')' : ''}:</strong> -$${promoDiscount.toFixed(2)}</p>` : ''}
                  <p style="margin: 5px 0;"><strong>Total Amount:</strong> $${Number(fee).toFixed(2)}</p>
                </div>

                <p>A calendar invite (<code>.ics</code>) is attached — open it to add this appointment to your calendar.</p>
                <p>You can view and manage your appointment in your patient dashboard.</p>
                <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">
                  Thank you for choosing GoldenLife.<br>
                  <em>This is an automated message, please do not reply.</em>
                </p>
              </div>
            `,
            attachments: [ics as any],
          });
          console.log("Email send result:", emailResult);
        } catch (emailError) {
          console.error("Failed to send booking confirmation email:", emailError);
        }
      }

      res.status(201).json({ ...appointment, checkoutUrl });
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  // Admin: Stripe configuration status (does not return any keys)
  app.get(
    "/api/admin/stripe/status",
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
      try {
        if (req.user?.role !== "admin") {
          return res.status(403).json({ message: "Admin access required" });
        }
        res.json({
          configured: isStripeConfigured(),
          mode: getStripeMode(),
          webhookSecretConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
          publishableKeyConfigured: Boolean(
            process.env.VITE_STRIPE_PUBLISHABLE_KEY,
          ),
        });
      } catch (error) {
        console.error("Stripe status error:", error);
        res.status(500).json({ message: "Failed to get Stripe status" });
      }
    },
  );

  // Update appointment status
  app.patch("/api/appointments/:id/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body as { status: string };
      const validStatuses = ["pending", "approved", "confirmed", "completed", "cancelled", "rejected", "rescheduled"];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const existing = await storage.getAppointment(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Authorisation: admin OR the provider who owns the appointment OR the patient (cancel-only)
      if (req.user?.role !== "admin") {
        if (req.user?.role === "provider") {
          const provider = await storage.getProviderByUserId(req.user!.id);
          if (!provider || provider.id !== existing.providerId) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else if (req.user?.role === "patient") {
          if (existing.patientId !== req.user.id || status !== "cancelled") {
            return res.status(403).json({ message: "Access denied" });
          }
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const appointment = await storage.updateAppointment(req.params.id, { status: status as any });
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Auto-generate invoice when an appointment is completed (provider/admin path).
      let invoiceResult: { created: boolean; invoiceNumber?: string } | undefined;
      if (status === "completed") {
        try {
          invoiceResult = await createInvoiceForAppointment(req.params.id);
        } catch (invErr) {
          console.error("[routes] auto invoice generation failed:", invErr);
        }
      }

      // Create notification for patient about status change
      try {
        const patientId = appointment.patientId;
        const statusMessages: Record<string, string> = {
          confirmed: "Your appointment has been confirmed by the provider.",
          cancelled: "Your appointment has been cancelled.",
          completed: invoiceResult?.created
            ? `Your appointment has been completed. Invoice ${invoiceResult.invoiceNumber} is now available in your dashboard.`
            : "Your appointment has been marked as completed. Please leave a review!",
          rescheduled: "Your appointment has been rescheduled."
        };

        if (statusMessages[status]) {
          await storage.createUserNotification({
            userId: patientId,
            type: "appointment",
            title: `Appointment ${status.charAt(0).toUpperCase() + status.slice(1)}`,
            message: statusMessages[status],
            isRead: false,
          });
        }

        // Email the patient when their appointment is completed (review request)
        if (status === "completed") {
          const patient = await storage.getUser(patientId);
          const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
          if (patient) {
            await sendAppointmentEmail({
              to: patient.email,
              subject: "How was your appointment? - GoldenLife",
              heading: "Your appointment is complete",
              intro: `Hello ${patient.firstName}, your appointment with ${providerWithUser?.user.firstName ?? ""} ${providerWithUser?.user.lastName ?? ""} on ${appointment.date} at ${appointment.startTime} has been marked as completed.`,
              details: [
                { label: "Date", value: appointment.date },
                { label: "Time", value: `${appointment.startTime} - ${appointment.endTime}` },
                ...(invoiceResult?.invoiceNumber ? [{ label: "Invoice", value: invoiceResult.invoiceNumber }] : []),
              ],
              cta: "Please take a moment to leave a review for your provider — your feedback helps other patients choose the right care.",
            });
          }
        }
      } catch (notifyError) {
        console.error("Failed to create status update notification:", notifyError);
      }

      res.json({ ...appointment, invoice: invoiceResult });
    } catch (error) {
      res.status(500).json({ message: "Failed to update appointment status" });
    }
  });

  // Mark a cash/bank-transfer payment as received (provider or admin only)
  app.patch("/api/appointments/:id/payment-status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body as { status: "completed" | "pending" | "refunded" | "failed" };
      if (!["completed", "pending", "refunded", "failed"].includes(status)) {
        return res.status(400).json({ message: "Invalid payment status" });
      }

      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });

      // Authorisation: admin OR the provider who owns the appointment
      if (req.user?.role !== "admin") {
        const provider = await storage.getProviderByUserId(req.user!.id);
        if (!provider || provider.id !== appointment.providerId) {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      const payment = await storage.getPaymentByAppointment(req.params.id);
      if (!payment) return res.status(404).json({ message: "Payment record not found" });

      const updated = await storage.updatePayment(payment.id, { status });

      // If we just marked it paid AND the appointment is already completed, regenerate / refresh the invoice status.
      if (status === "completed" && appointment.status === "completed" && !appointment.invoiceGenerated) {
        try {
          await createInvoiceForAppointment(appointment.id);
        } catch (invErr) {
          console.error("[routes] invoice generation after payment update failed:", invErr);
        }
      }

      // Notify patient that payment was recorded
      if (status === "completed") {
        try {
          await storage.createUserNotification({
            userId: appointment.patientId,
            type: "payment",
            title: "Payment received",
            message: `Your payment of ${Number(payment.amount).toFixed(0)} HUF has been recorded.`,
            isRead: false,
          });
        } catch {}

        // Email payment receipt to the patient
        try {
          const patient = await storage.getUser(appointment.patientId);
          const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
          if (patient) {
            await sendAppointmentEmail({
              to: patient.email,
              subject: "Payment receipt - GoldenLife",
              heading: "Payment received",
              intro: `Hello ${patient.firstName}, we've recorded your payment for your appointment with ${providerWithUser?.user.firstName ?? ""} ${providerWithUser?.user.lastName ?? ""}.`,
              details: [
                { label: "Date", value: appointment.date },
                { label: "Time", value: `${appointment.startTime} - ${appointment.endTime}` },
                { label: "Amount", value: `${Number(payment.amount).toFixed(0)} HUF` },
                { label: "Method", value: payment.paymentMethod || "card" },
              ],
              cta: "An invoice for your records is available in your patient dashboard.",
            });
          }
          notify.paymentReceived(appointment.patientId, {
            amount: Number(payment.amount).toFixed(0),
            currency: "HUF",
            appointmentId: appointment.id,
          }).catch(err => console.error("[notify] paymentReceived", err));
        } catch (e) {
          console.error("Payment receipt email failed:", e);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Update payment status error:", error);
      res.status(500).json({ message: "Failed to update payment status" });
    }
  });

  // Auto-cancel past appointments
  // ============ MEDICAL RECORDS ROUTES ============

  // Get prescriptions for a patient
  app.get("/api/prescriptions/patient/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const prescriptions = await storage.getPrescriptionsByPatient(req.params.id);
      res.json(prescriptions);
    } catch (error) {
      console.error("Get prescriptions error:", error);
      res.status(500).json({ message: "Failed to get prescriptions" });
    }
  });

  // Get medical history for a patient
  app.get("/api/medical-history/patient/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const history = await storage.getMedicalHistoryByPatient(req.params.id);
      res.json(history);
    } catch (error) {
      console.error("Get medical history error:", error);
      res.status(500).json({ message: "Failed to get medical history" });
    }
  });

  // Health Metrics — patients can list, log, and delete their own readings
  app.get("/api/health-metrics", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const limit = req.query.limit ? Math.min(500, parseInt(req.query.limit as string, 10) || 200) : 200;
      const metrics = await storage.getHealthMetricsByPatient(req.user!.id, limit);
      res.json(metrics);
    } catch (error) {
      console.error("Get health metrics error:", error);
      res.status(500).json({ message: "Failed to load health metrics" });
    }
  });

  app.post("/api/health-metrics", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const body = { ...req.body, patientId: req.user!.id };
      if (body.measuredAt && typeof body.measuredAt === "string") {
        body.measuredAt = new Date(body.measuredAt);
      }
      const parsed = insertHealthMetricSchema.parse(body);

      const hasAtLeastOne = [
        parsed.weightKg, parsed.heightCm, parsed.systolic, parsed.diastolic,
        parsed.heartRate, parsed.bloodGlucose, parsed.temperatureC, parsed.oxygenSaturation,
      ].some((v) => v !== undefined && v !== null && `${v}`.length > 0);
      if (!hasAtLeastOne) {
        return res.status(400).json({ message: "Please record at least one measurement." });
      }

      const created = await storage.createHealthMetric(parsed);
      res.status(201).json(created);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid health metric data", errors: error.errors });
      }
      console.error("Create health metric error:", error);
      res.status(500).json({ message: "Failed to save health metric" });
    }
  });

  app.delete("/api/health-metrics/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteHealthMetric(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Reading not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete health metric error:", error);
      res.status(500).json({ message: "Failed to delete reading" });
    }
  });

  // Family members
  app.get("/api/family-members", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const members = await storage.getFamilyMembersByUser(req.user!.id);
      res.json(members);
    } catch (error) {
      console.error("Get family members error:", error);
      res.status(500).json({ message: "Failed to load family members" });
    }
  });

  app.post("/api/family-members", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertFamilyMemberSchema.parse(req.body);
      const member = await storage.createFamilyMember(req.user!.id, parsed);
      res.status(201).json(member);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid family member data", errors: error.errors });
      }
      console.error("Create family member error:", error);
      res.status(500).json({ message: "Failed to add family member" });
    }
  });

  app.patch("/api/family-members/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertFamilyMemberSchema.partial().parse(req.body);
      const updated = await storage.updateFamilyMember(req.params.id, req.user!.id, parsed);
      if (!updated) return res.status(404).json({ message: "Family member not found" });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid family member data", errors: error.errors });
      }
      console.error("Update family member error:", error);
      res.status(500).json({ message: "Failed to update family member" });
    }
  });

  app.delete("/api/family-members/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteFamilyMember(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Family member not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete family member error:", error);
      res.status(500).json({ message: "Failed to remove family member" });
    }
  });

  // Medications
  app.get("/api/medications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const meds = await storage.getMedicationsByUser(req.user!.id);
      res.json(meds);
    } catch (error) {
      console.error("Get medications error:", error);
      res.status(500).json({ message: "Failed to load medications" });
    }
  });

  app.post("/api/medications", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMedicationSchema.parse(req.body);
      // Validate family member ownership if provided
      if (parsed.familyMemberId) {
        const fm = await storage.getFamilyMember(parsed.familyMemberId);
        if (!fm || fm.primaryUserId !== req.user!.id) {
          return res.status(403).json({ message: "Family member not found or not yours." });
        }
      }
      const med = await storage.createMedication(req.user!.id, parsed);
      res.status(201).json(med);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid medication data", errors: error.errors });
      }
      console.error("Create medication error:", error);
      res.status(500).json({ message: "Failed to add medication" });
    }
  });

  app.patch("/api/medications/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMedicationSchema.partial().parse(req.body);
      if (parsed.familyMemberId) {
        const fm = await storage.getFamilyMember(parsed.familyMemberId);
        if (!fm || fm.primaryUserId !== req.user!.id) {
          return res.status(403).json({ message: "Family member not found or not yours." });
        }
      }
      const updated = await storage.updateMedication(req.params.id, req.user!.id, parsed);
      if (!updated) return res.status(404).json({ message: "Medication not found" });
      res.json(updated);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid medication data", errors: error.errors });
      }
      console.error("Update medication error:", error);
      res.status(500).json({ message: "Failed to update medication" });
    }
  });

  app.delete("/api/medications/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteMedication(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Medication not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete medication error:", error);
      res.status(500).json({ message: "Failed to remove medication" });
    }
  });

  app.get("/api/medication-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { medicationId, from, to } = req.query as Record<string, string | undefined>;
      const logs = await storage.getMedicationLogs(req.user!.id, { medicationId, from, to });
      res.json(logs);
    } catch (error) {
      console.error("Get medication logs error:", error);
      res.status(500).json({ message: "Failed to load medication logs" });
    }
  });

  app.post("/api/medication-logs", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = insertMedicationLogSchema.parse(req.body);
      // Verify the medication belongs to this user
      const med = await storage.getMedication(parsed.medicationId);
      if (!med || med.userId !== req.user!.id) {
        return res.status(404).json({ message: "Medication not found" });
      }
      const log = await storage.logMedicationDose(req.user!.id, parsed);
      res.status(201).json(log);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({ message: "Invalid log data", errors: error.errors });
      }
      console.error("Log dose error:", error);
      res.status(500).json({ message: "Failed to log dose" });
    }
  });

  app.delete("/api/medication-logs/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const deleted = await storage.deleteMedicationLog(req.params.id, req.user!.id);
      if (!deleted) return res.status(404).json({ message: "Log not found" });
      res.json({ ok: true });
    } catch (error) {
      console.error("Delete log error:", error);
      res.status(500).json({ message: "Failed to delete log" });
    }
  });

  app.post("/api/appointments/cleanup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      const now = new Date();
      let cancelledCount = 0;

      // Anything still 'pending' past its start time → cancelled (no-show / never confirmed)
      // Anything 'approved'/'confirmed'/'rescheduled' that is more than 24h past end time
      // and never marked completed → silently cancelled so it doesn't clutter dashboards.
      for (const apt of appointments) {
        const [hh, mm] = apt.startTime.split(':');
        const aptStart = new Date(apt.date);
        aptStart.setHours(parseInt(hh), parseInt(mm), 0, 0);

        const [eh, em] = (apt.endTime || apt.startTime).split(':');
        const aptEnd = new Date(apt.date);
        aptEnd.setHours(parseInt(eh), parseInt(em), 0, 0);
        const dayAfterEnd = new Date(aptEnd.getTime() + 24 * 60 * 60 * 1000);

        if (apt.status === 'pending' && aptStart < now) {
          await storage.updateAppointment(apt.id, { status: 'cancelled' });
          cancelledCount++;
        } else if (
          ['approved', 'confirmed', 'rescheduled'].includes(apt.status) &&
          dayAfterEnd < now
        ) {
          await storage.updateAppointment(apt.id, { status: 'cancelled' });
          cancelledCount++;
        }
      }
      res.json({ message: "Past appointments cleaned up", cancelledCount });
    } catch (error) {
      console.error("Cleanup error:", error);
      res.status(500).json({ message: "Failed to cleanup appointments" });
    }
  });

  // Cancel appointment
  app.patch("/api/appointments/:id/cancel", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const existing = await storage.getAppointment(req.params.id);
      if (!existing) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Authorisation: admin OR the patient who owns the appointment OR the provider who owns it
      if (req.user?.role !== "admin") {
        if (req.user?.role === "patient") {
          if (existing.patientId !== req.user.id) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else if (req.user?.role === "provider") {
          const provider = await storage.getProviderByUserId(req.user.id);
          if (!provider || provider.id !== existing.providerId) {
            return res.status(403).json({ message: "Access denied" });
          }
        } else {
          return res.status(403).json({ message: "Access denied" });
        }
      }

      // Don't re-cancel terminal-state appointments
      if (["cancelled", "completed", "rejected"].includes(existing.status)) {
        return res.status(400).json({ message: `Cannot cancel an appointment in '${existing.status}' state` });
      }

      const appointment = await storage.updateAppointment(req.params.id, { status: "cancelled" });
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Free the time slot if one was reserved
      if (appointment.timeSlotId) {
        try {
          await storage.updateTimeSlot(appointment.timeSlotId, { isBooked: false });
        } catch (e) {
          console.error("Failed to free time slot on cancel:", e);
        }
      }

      // Notify the other party + send cancellation emails to both sides
      try {
        const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
        const patient = await storage.getUser(appointment.patientId);
        const cancelledBy = req.user?.role === "patient" ? "patient" : req.user?.role === "provider" ? "provider" : "admin";
        const recipientUserId = cancelledBy === "patient" ? providerWithUser?.userId : appointment.patientId;
        if (recipientUserId) {
          await storage.createUserNotification({
            userId: recipientUserId,
            type: "appointment",
            title: "Appointment cancelled",
            message: `An appointment on ${appointment.date} at ${appointment.startTime} was cancelled by the ${cancelledBy}.`,
            isRead: false,
          });
        }

        const details = [
          { label: "Date", value: appointment.date },
          { label: "Time", value: `${appointment.startTime} - ${appointment.endTime}` },
          { label: "Cancelled by", value: cancelledBy },
        ];
        if (patient) {
          await sendAppointmentEmail({
            to: patient.email,
            subject: "Appointment cancelled - GoldenLife",
            heading: "Appointment cancelled",
            intro: `Hello ${patient.firstName}, your appointment with ${providerWithUser?.user.firstName ?? ""} ${providerWithUser?.user.lastName ?? ""} has been cancelled.`,
            details,
            cta: cancelledBy === "patient" ? undefined : "If this was unexpected, you can rebook from your patient dashboard.",
          });
        }
        if (providerWithUser?.user?.email) {
          await sendAppointmentEmail({
            to: providerWithUser.user.email,
            subject: "Appointment cancelled - GoldenLife",
            heading: "Appointment cancelled",
            intro: `Hello ${providerWithUser.user.firstName}, an appointment in your schedule has been cancelled.`,
            details: [
              ...details,
              { label: "Patient", value: patient ? `${patient.firstName} ${patient.lastName}` : "Patient" },
            ],
          });
        }
      } catch (e) {
        console.error("Cancel notification/email failed:", e);
      }

      // Multi-channel cancellation dispatch
      try {
        const providerWithUser = await storage.getProviderWithUser(appointment.providerId);
        notify.appointmentCancelled(appointment.patientId, {
          date: appointment.date, time: appointment.startTime, appointmentId: appointment.id,
        }).catch(err => console.error("[notify] cancel patient", err));
        if (providerWithUser?.userId) {
          notify.appointmentCancelled(providerWithUser.userId, {
            date: appointment.date, time: appointment.startTime, appointmentId: appointment.id,
          }).catch(err => console.error("[notify] cancel provider", err));
        }
      } catch (e) {
        console.error("[notify] cancel dispatch failed:", e);
      }

      res.json(appointment);
    } catch (error) {
      console.error("Cancel appointment error:", error);
      res.status(500).json({ message: "Failed to cancel appointment" });
    }
  });

  // ============ WALLET ROUTES ============

  // Helper to round currency safely
  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Get the current user's wallet (creates one on first read so the patient
  // dashboard always has something to show).
  app.get("/api/wallet", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const wallet = await storage.getOrCreateWallet(req.user.id);
      res.json(wallet);
    } catch (error: any) {
      console.error("Get wallet error:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  // Get the current user's wallet transaction history (most recent first).
  app.get("/api/wallet/transactions", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const limitRaw = Number(req.query.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
      const txs = await storage.getWalletTransactions(req.user.id, limit);
      res.json(txs);
    } catch (error: any) {
      console.error("Get wallet transactions error:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Start a Stripe Checkout session that, when paid, will credit the wallet via
  // the webhook. Refuses to run when Stripe isn't configured rather than silently
  // failing — this keeps the wallet free of phantom credits.
  app.post("/api/wallet/topup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Amount must be a positive number" });
      }
      if (amount > 1_000_000) {
        return res.status(400).json({ message: "Amount exceeds maximum allowed top-up" });
      }
      if (!isStripeConfigured()) {
        return res.status(503).json({ message: "Online top-up is not available right now. Please contact support." });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Make sure a wallet row exists so we have an id to reference.
      const wallet = await storage.getOrCreateWallet(req.user.id);

      const origin = (req.headers.origin as string) || `${req.protocol}://${req.get("host")}`;
      const session = await createCheckoutSession({
        appointmentId: `wallet:${wallet.id}`,
        amount: round2(amount),
        currency: (wallet.currency || "huf").toLowerCase(),
        description: `Wallet top-up (${round2(amount)} ${wallet.currency})`,
        customerEmail: user.email,
        successUrl: `${origin}/wallet?topup=success`,
        cancelUrl: `${origin}/wallet?topup=cancelled`,
        metadata: {
          type: "wallet_topup",
          walletUserId: req.user.id,
          walletId: wallet.id,
          amount: String(round2(amount)),
        },
      });
      res.json({ url: session.url, sessionId: session.sessionId });
    } catch (error: any) {
      console.error("Wallet topup error:", error);
      res.status(500).json({ message: error?.message || "Failed to start top-up" });
    }
  });

  // Pay for an appointment using wallet credit. Atomic — debits the wallet,
  // marks the payment completed, and confirms the appointment in a single
  // logical step. If the wallet is short, returns 402 with a precise message.
  app.post("/api/wallet/pay-appointment", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const appointmentId = String(req.body?.appointmentId || "");
      if (!appointmentId) return res.status(400).json({ message: "appointmentId is required" });

      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment) return res.status(404).json({ message: "Appointment not found" });
      if (appointment.patientId !== req.user.id) {
        return res.status(403).json({ message: "You can only pay for your own appointments" });
      }
      if (appointment.status === "cancelled" || appointment.status === "rejected") {
        return res.status(400).json({ message: "This appointment cannot be paid for" });
      }

      const existingPayment = await storage.getPaymentByAppointment(appointmentId);
      if (existingPayment && existingPayment.status === "completed") {
        return res.status(400).json({ message: "This appointment is already paid" });
      }

      const amount = Number(appointment.totalAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Invalid appointment amount" });
      }

      const wallet = await storage.getOrCreateWallet(req.user.id);
      if (Number(wallet.balance) + 1e-6 < amount) {
        return res.status(402).json({
          message: "Insufficient wallet balance",
          balance: Number(wallet.balance),
          required: amount,
        });
      }

      // Idempotency key ties the debit to this specific appointment so retries
      // can't double-charge the patient.
      const idempotencyKey = `appointment:${appointmentId}`;
      const { wallet: updatedWallet, transaction } = await storage.debitWallet(
        req.user.id,
        amount,
        {
          description: `Payment for appointment ${appointmentId}`,
          referenceType: "appointment",
          referenceId: appointmentId,
          idempotencyKey,
        },
      );

      // Mark payment + appointment as paid/confirmed.
      if (existingPayment) {
        await storage.updatePayment(existingPayment.id, {
          status: "completed",
          paymentMethod: "wallet",
        });
      } else {
        await storage.createPayment({
          appointmentId,
          patientId: req.user.id,
          amount: amount.toFixed(2),
          paymentMethod: "wallet",
          status: "completed",
        });
      }
      await storage.updateAppointment(appointmentId, { status: "confirmed" });

      res.json({
        ok: true,
        wallet: updatedWallet,
        transaction,
      });
    } catch (error: any) {
      console.error("Wallet pay-appointment error:", error);
      const msg = error?.message || "Payment failed";
      const code = msg.includes("Insufficient") ? 402 : 500;
      res.status(code).json({ message: msg });
    }
  });

  // Admin: list all wallets with the owning user.
  app.get("/api/admin/wallets", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const list = await storage.getAllWallets();
      res.json(list);
    } catch (error) {
      console.error("Admin list wallets error:", error);
      res.status(500).json({ message: "Failed to list wallets" });
    }
  });

  // Admin: list a specific user's transactions (for support/audit).
  app.get("/api/admin/wallets/:userId/transactions", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const txs = await storage.getWalletTransactions(req.params.userId, 500);
      res.json(txs);
    } catch (error) {
      console.error("Admin list wallet txs error:", error);
      res.status(500).json({ message: "Failed to list transactions" });
    }
  });

  // Admin: manually adjust a wallet (positive credits, negative debits).
  // Always recorded with a reason and the admin's user id for audit.
  app.post("/api/admin/wallets/:userId/adjust", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) return res.status(401).json({ message: "Unauthorized" });
      const amount = Number(req.body?.amount);
      const reason = String(req.body?.reason || "").trim();
      if (!Number.isFinite(amount) || amount === 0) {
        return res.status(400).json({ message: "Amount must be a non-zero number" });
      }
      if (!reason) return res.status(400).json({ message: "A reason is required" });

      const targetUser = await storage.getUser(req.params.userId);
      if (!targetUser) return res.status(404).json({ message: "User not found" });

      const result = await storage.adminAdjustWallet(req.params.userId, round2(amount), {
        reason,
        adminId: req.user.id,
      });
      res.json(result);
    } catch (error: any) {
      console.error("Admin wallet adjust error:", error);
      res.status(error?.message?.includes("Insufficient") ? 400 : 500).json({
        message: error?.message || "Failed to adjust wallet",
      });
    }
  });

  // ============ ADMIN ROUTES ============

  app.post("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, ...providerData } = req.body;
      
      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user first
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone: phone || "",
        role: "provider",
        isEmailVerified: true,
      });

      // Then create provider profile
      const provider = await storage.createProvider({
        ...providerData,
        userId: user.id,
        consultationFee: providerData.consultationFee.toString(),
        homeVisitFee: providerData.homeVisitFee ? providerData.homeVisitFee.toString() : null,
        isVerified: true,
        isActive: true,
      });

      res.status(201).json(provider);
    } catch (error: any) {
      console.error("Admin provider creation error:", error);
      res.status(500).json({ message: error.message || "Failed to create provider" });
    }
  });

  // FAQs
  app.get("/api/admin/faqs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faqs = await storage.getAllFaqs();
      res.json(faqs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get FAQs" });
    }
  });

  app.post("/api/admin/faqs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const faq = await storage.createFaq(req.body);
      res.status(201).json(faq);
    } catch (error) {
      res.status(500).json({ message: "Failed to create FAQ" });
    }
  });

  app.delete("/api/admin/faqs/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteFaq(req.params.id);
      res.json({ message: "FAQ deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete FAQ" });
    }
  });

  // Announcements
  app.get("/api/admin/announcements", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const announcements = await storage.getAllAnnouncements();
      res.json(announcements);
    } catch (error) {
      res.status(500).json({ message: "Failed to get announcements" });
    }
  });

  app.post("/api/admin/announcements", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const announcement = await storage.createAnnouncement(req.body);
      res.status(201).json(announcement);
    } catch (error) {
      res.status(500).json({ message: "Failed to create announcement" });
    }
  });

  app.delete("/api/admin/announcements/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteAnnouncement(req.params.id);
      res.json({ message: "Announcement deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete announcement" });
    }
  });

  // Support Tickets
  app.get("/api/admin/support-tickets", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const tickets = await storage.getAllSupportTickets();
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const enriched = tickets.map(t => {
        const u = t.userId ? userMap.get(t.userId) : null;
        const a = t.assignedTo ? userMap.get(t.assignedTo) : null;
        return {
          ...t,
          creator: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role } : null,
          assignee: a ? { id: a.id, firstName: a.firstName, lastName: a.lastName } : null,
        };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to get support tickets" });
    }
  });

  app.get("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const messages = await storage.getTicketMessages(req.params.id);
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const enriched = messages.map(m => {
        const u = userMap.get(m.userId);
        return {
          ...m,
          sender: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role } : null,
        };
      });
      res.json(enriched);
    } catch (error) {
      res.status(500).json({ message: "Failed to get ticket messages" });
    }
  });

  app.patch("/api/admin/support-tickets/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await storage.updateSupportTicket(req.params.id, req.body);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      res.json(ticket);
    } catch (error) {
      res.status(500).json({ message: "Failed to update ticket" });
    }
  });

  app.post("/api/admin/support-tickets/:id/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const ticket = await storage.getSupportTicket(req.params.id);
      if (!ticket) return res.status(404).json({ message: "Ticket not found" });
      if (!req.body?.message) return res.status(400).json({ message: "Message required" });
      const isInternal = !!req.body.isInternal;
      const message = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId: req.user!.id,
        message: req.body.message,
        isInternal,
      });
      // Auto-promote ticket from open → in_progress when admin first replies
      if (!isInternal && ticket.status === "open") {
        await storage.updateSupportTicket(ticket.id, { status: "in_progress" });
      }
      // Notify the ticket creator about the public reply
      if (!isInternal && ticket.userId) {
        notify.ticketReplied(ticket.userId, { ticketId: ticket.id, subject: ticket.subject }).catch(() => {});
      }
      res.status(201).json(message);
    } catch (error) {
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // Analytics
  app.get("/api/admin/analytics", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const stats = await storage.getAnalyticsStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "Failed to get analytics" });
    }
  });

  // Bookings/Appointments
  app.get("/api/admin/bookings", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAllAppointments();
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get bookings" });
    }
  });

  app.patch("/api/admin/bookings/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body;
      const booking = await storage.getAppointment(req.params.id);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      const updated = await storage.updateAppointment(req.params.id, req.body);
      if (!updated) return res.status(404).json({ message: "Booking not found" });

      // Automatically generate invoice if status is changed to completed and it hasn't been generated yet
      if (status === "completed" && !booking.invoiceGenerated) {
        try {
          const appointment = await storage.getAppointmentWithDetails(booking.id);
          if (appointment) {
            const invoiceNumber = `INV-${Date.now()}-${booking.id.slice(0, 4)}`.toUpperCase();
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);

            const invoice = await storage.createInvoice({
              appointmentId: booking.id,
              patientId: booking.patientId,
              providerId: booking.providerId,
              invoiceNumber,
              dueDate,
              subtotal: booking.totalAmount,
              taxAmount: "0.00",
              totalAmount: booking.totalAmount,
              status: "paid"
            }, [{
              invoiceId: "", // Will be set by storage.createInvoice
              description: appointment.service?.name || "Healthcare Service",
              quantity: 1,
              unitPrice: booking.totalAmount,
              totalPrice: booking.totalAmount,
              practitionerId: null
            }]);

            // Try to send email
            if (resend) {
              const pdfBuffer = await generateInvoicePDF(
                invoice,
                appointment.patient,
                appointment.provider,
                [{
                  description: appointment.service?.name || "Healthcare Service",
                  quantity: 1,
                  unitPrice: booking.totalAmount,
                  totalPrice: booking.totalAmount
                }]
              );

              await resend.emails.send({
                from: FROM_EMAIL,
                to: appointment.patient.email,
                subject: `Invoice for your appointment ${invoiceNumber}`,
                text: `Dear ${appointment.patient.firstName}, please find attached the invoice for your recent appointment.`,
                attachments: [
                  {
                    filename: `invoice-${invoiceNumber}.pdf`,
                    content: pdfBuffer,
                  },
                ],
              });
            }
          }
        } catch (genError) {
          console.error("Auto invoice generation error:", genError);
        }
      }

      res.json(updated);
    } catch (error) {
      console.error("Failed to update booking status:", error);
      res.status(500).json({ message: "Failed to update booking" });
    }
  });

  app.get("/api/admin/invoices", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const allInvoices = await storage.getAllInvoices();
      res.json(allInvoices);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  // Audit Logs
  app.get("/api/admin/audit-logs", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const logs = await storage.getAllAuditLogs();
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Failed to get audit logs" });
    }
  });

  // Users
  app.get("/api/admin/users", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: "Failed to get users" });
    }
  });

  // Pricing Overrides
  app.get("/api/admin/pricing-overrides", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const overrides = await storage.getAllPricingOverrides();
      res.json(overrides);
    } catch (error) {
      res.status(500).json({ message: "Failed to get pricing overrides" });
    }
  });

  app.post("/api/admin/pricing-overrides", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const override = await storage.createProviderPricingOverride(req.body);
      res.status(201).json(override);
    } catch (error) {
      res.status(500).json({ message: "Failed to create pricing override" });
    }
  });

  app.patch("/api/admin/pricing-overrides/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const override = await storage.updateProviderPricingOverride(req.params.id, req.body);
      if (!override) return res.status(404).json({ message: "Override not found" });
      res.json(override);
    } catch (error) {
      res.status(500).json({ message: "Failed to update pricing override" });
    }
  });

  app.delete("/api/admin/pricing-overrides/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteProviderPricingOverride(req.params.id);
      res.json({ message: "Override deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete pricing override" });
    }
  });

  // Promo Codes
  app.get("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const codes = await storage.getAllPromoCodes();
      res.json(codes);
    } catch (error) {
      res.status(500).json({ message: "Failed to get promo codes" });
    }
  });

  // Promo code input validator with proper coercion
  const promoCodeBaseSchema = z.object({
    code: z.string().trim().min(2, "Code must be at least 2 characters").max(40).transform((s) => s.toUpperCase()),
    description: z.string().max(500).optional().nullable(),
    discountType: z.enum(["percentage", "fixed"]),
    discountValue: z.coerce.number().positive("Discount must be greater than 0"),
    maxUses: z.coerce.number().int().positive().nullable().optional(),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date(),
    isActive: z.boolean().optional(),
    applicableProviders: z.array(z.string()).nullable().optional(),
    minAmount: z.coerce.number().nonnegative().nullable().optional(),
  });
  const validateCrossFields = (d: any, ctx: z.RefinementCtx) => {
    if (d.validFrom && d.validUntil && d.validFrom > d.validUntil) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "Valid-until must be on or after valid-from" });
    }
    if (d.discountType === "percentage" && d.discountValue != null && d.discountValue > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountValue"], message: "Percentage discount cannot exceed 100" });
    }
  };
  const promoCodeCreateSchema = promoCodeBaseSchema.superRefine(validateCrossFields);
  const promoCodeUpdateSchema = promoCodeBaseSchema.partial().superRefine(validateCrossFields);

  app.post("/api/admin/promo-codes", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = promoCodeCreateSchema.parse(req.body);
      // Reject duplicate codes with a clear message
      const existing = await storage.getPromoCodeByCode(parsed.code);
      if (existing) {
        return res.status(409).json({ message: `Promo code "${parsed.code}" already exists.` });
      }
      const code = await storage.createPromoCode({
        code: parsed.code,
        description: parsed.description ?? null,
        discountType: parsed.discountType,
        discountValue: parsed.discountValue.toString(),
        maxUses: parsed.maxUses ?? null,
        validFrom: parsed.validFrom,
        validUntil: parsed.validUntil,
        isActive: parsed.isActive ?? true,
        applicableProviders: parsed.applicableProviders ?? null,
        minAmount: parsed.minAmount != null ? parsed.minAmount.toString() : null,
      } as any);
      res.status(201).json(code);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({
          message: error.errors?.[0]?.message || "Invalid promo code data",
          errors: error.errors,
        });
      }
      console.error("Create promo code error:", error);
      res.status(500).json({ message: "Failed to create promo code" });
    }
  });

  app.patch("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const parsed = promoCodeUpdateSchema.parse(req.body);
      // If code is being changed, ensure it doesn't collide
      if (parsed.code) {
        const existing = await storage.getPromoCodeByCode(parsed.code);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({ message: `Promo code "${parsed.code}" already exists.` });
        }
      }
      const update: any = { ...parsed };
      if (parsed.discountValue != null) update.discountValue = parsed.discountValue.toString();
      if (parsed.minAmount != null) update.minAmount = parsed.minAmount.toString();
      if (parsed.minAmount === null) update.minAmount = null;
      const code = await storage.updatePromoCode(req.params.id, update);
      if (!code) return res.status(404).json({ message: "Promo code not found" });
      res.json(code);
    } catch (error: any) {
      if (error?.name === "ZodError") {
        return res.status(400).json({
          message: error.errors?.[0]?.message || "Invalid promo code data",
          errors: error.errors,
        });
      }
      console.error("Update promo code error:", error);
      res.status(500).json({ message: "Failed to update promo code" });
    }
  });

  app.delete("/api/admin/promo-codes/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePromoCode(req.params.id);
      res.json({ message: "Promo code deleted successfully" });
    } catch (error) {
      console.error("Delete promo code error:", error);
      res.status(500).json({ message: "Failed to delete promo code" });
    }
  });

  // Providers Management
  app.get("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const providers = await storage.getAllProviders();
      res.json(providers);
    } catch (error) {
      res.status(500).json({ message: "Failed to get providers" });
    }
  });

  app.patch("/api/admin/providers/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.updateProvider(req.params.id, req.body);
      if (!provider) return res.status(404).json({ message: "Provider not found" });
      if (provider.userId) invalidateAuthCache(provider.userId);
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to update provider" });
    }
  });

  app.get("/api/admin/services-overview", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const allServices = await db.select().from(services);
      const allProviders = await storage.getAllProviders();
      const providerMap = new Map(allProviders.map((p: any) => [p.id, p]));
      const enriched = allServices.map((s: any) => {
        const prov: any = providerMap.get(s.providerId);
        return {
          ...s,
          providerName: prov?.businessName || prov?.user?.name || "—",
          providerCity: prov?.city || null,
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("services-overview error", error);
      res.status(500).json({ message: "Failed to fetch services overview" });
    }
  });

  app.get("/api/admin/practitioners", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      const allPractitioners = await db.select().from(practitioners);
      const allProviders = await storage.getAllProviders();
      const providerMap = new Map(allProviders.map((p: any) => [p.id, p]));
      const enriched = allPractitioners.map((p: any) => {
        const prov: any = providerMap.get(p.providerId);
        return {
          ...p,
          providerName: prov?.businessName || prov?.user?.name || "—",
        };
      });
      res.json(enriched);
    } catch (error) {
      console.error("practitioners list error", error);
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.get("/api/admin/providers/:id/services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const services = await storage.getServicesByProvider(req.params.id);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider services" });
    }
  });

  app.post("/api/admin/providers/:id/services", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const service = await storage.createService({
        ...req.body,
        providerId: req.params.id
      });
      res.status(201).json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to create service" });
    }
  });

  app.patch("/api/admin/services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const service = await storage.updateService(req.params.id, req.body);
      if (!service) return res.status(404).json({ message: "Service not found" });
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service" });
    }
  });

  app.delete("/api/admin/services/:id", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deleteService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete service" });
    }
  });

  app.get("/api/admin/providers/:id/revenue", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      // SQL aggregate — no joins, no row hydration.
      const totalRevenue = await storage.getProviderRevenueTotal(req.params.id);
      res.json({ totalRevenue: totalRevenue.toFixed(2) });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate revenue" });
    }
  });

  // Practitioners management
  app.get("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioners = await storage.getPractitionersByProvider(req.params.providerId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch practitioners" });
    }
  });

  app.post("/api/providers/:providerId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertPractitionerSchema.parse({
        ...req.body,
        providerId: req.params.providerId
      });
      const practitioner = await storage.createPractitioner(data);
      res.status(201).json(practitioner);
    } catch (error) {
      res.status(400).json({ message: "Invalid practitioner data" });
    }
  });

  app.patch("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioner = await storage.updatePractitioner(req.params.id, req.body);
      res.json(practitioner);
    } catch (error) {
      res.status(500).json({ message: "Failed to update practitioner" });
    }
  });

  app.delete("/api/practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.deletePractitioner(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete practitioner" });
    }
  });

  // Service Practitioners management
  app.get("/api/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const practitioners = await storage.getServicePractitioners(req.params.serviceId);
      res.json(practitioners);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch service practitioners" });
    }
  });

  app.post("/api/services/:serviceId/practitioners", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const data = insertServicePractitionerSchema.parse({
        ...req.body,
        serviceId: req.params.serviceId
      });
      const result = await storage.addPractitionerToService(data);
      res.status(201).json(result);
    } catch (error) {
      res.status(400).json({ message: "Invalid service practitioner data" });
    }
  });

  app.patch("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const result = await storage.updateServicePractitionerFee(req.params.id, req.body.fee);
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: "Failed to update service practitioner fee" });
    }
  });

  app.delete("/api/service-practitioners/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.removePractitionerFromService(req.params.id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove practitioner from service" });
    }
  });

  // ═══════════════ COMMUNICATIONS ═══════════════

  // ----- Capability check (lets the UI hide/disable channels we can't deliver) -----
  app.get("/api/comms/capabilities", (_req, res) => {
    res.json({
      email: isEmailConfigured(),
      sms: isSmsConfigured(),
      whatsapp: isWhatsAppConfigured(),
      push: isPushConfigured(),
      vapidPublicKey: VAPID_PUBLIC_KEY || null,
    });
  });

  // ----- Notification preferences -----
  app.get("/api/notification-preferences", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const prefs = (await storage.getNotificationPreferences(req.user!.id)) ||
        (await storage.upsertNotificationPreferences(req.user!.id, {} as any));
      res.json(prefs);
    } catch (e) {
      res.status(500).json({ message: "Failed to load preferences" });
    }
  });

  app.patch("/api/notification-preferences", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const allowed = [
        "emailEnabled","smsEnabled","whatsappEnabled","pushEnabled","inAppEnabled",
        "eventOverrides","quietHoursStart","quietHoursEnd","emailDigest","language",
      ];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      const updated = await storage.upsertNotificationPreferences(req.user!.id, patch);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ message: "Failed to update preferences" });
    }
  });

  // ----- Web Push subscriptions -----
  app.get("/api/push/vapid-public-key", (_req, res) => {
    res.json({ key: VAPID_PUBLIC_KEY || null, configured: isPushConfigured() });
  });

  app.post("/api/push/subscribe", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { endpoint, keys, userAgent } = req.body || {};
      if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ message: "Invalid subscription" });
      const sub = await storage.addPushSubscription({
        userId: req.user!.id,
        endpoint,
        p256dh: keys.p256dh,
        authKey: keys.auth,
        userAgent: userAgent || req.headers["user-agent"] || null,
      } as any);
      res.json(sub);
    } catch (e) {
      res.status(500).json({ message: "Failed to save subscription" });
    }
  });

  app.post("/api/push/unsubscribe", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (!req.body?.endpoint) return res.status(400).json({ message: "endpoint required" });
      await storage.removePushSubscription(req.body.endpoint);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ message: "Failed to unsubscribe" });
    }
  });

  // ----- Chat: start a conversation with another user (patient↔provider, *-↔admin) -----
  app.post("/api/chat/start", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { participantId } = req.body || {};
      if (!participantId) return res.status(400).json({ message: "participantId required" });
      if (participantId === req.user!.id) return res.status(400).json({ message: "Cannot chat with yourself" });
      const conv = await storage.getOrCreateRealtimeConversation(req.user!.id, participantId);
      res.json(conv);
    } catch (e) {
      console.error("chat/start error:", e);
      res.status(500).json({ message: "Failed to start conversation" });
    }
  });

  // ----- Support: open a chat with the GoldenLife support team -----
  app.post("/api/support/contact", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const allUsers = await storage.getAllUsers();
      // Prefer dedicated support inboxes, then admin@goldenlife.com, then any admin.
      const supportEmails = ["support@goldenlife.com", "support@goldenlife.health", "help@goldenlife.com"];
      let admin = allUsers.find(u => u.role === "admin" && u.email && supportEmails.includes(u.email.toLowerCase()));
      if (!admin) admin = allUsers.find(u => u.role === "admin" && u.email?.toLowerCase() === "admin@goldenlife.com");
      if (!admin) admin = allUsers.find(u => u.role === "admin" && /goldenlife/i.test(u.email || ""));
      if (!admin) admin = allUsers.find(u => u.role === "admin");
      if (!admin) return res.status(503).json({ message: "No support agent available right now." });

      // Make sure the admin profile shows as GoldenLife Support, not their personal display name.
      try {
        if (admin.firstName !== "GoldenLife" || admin.lastName !== "Support") {
          await storage.updateUser(admin.id, { firstName: "GoldenLife", lastName: "Support" } as any);
          admin = { ...admin, firstName: "GoldenLife", lastName: "Support" };
        }
      } catch (renameErr) {
        console.warn("[support] could not normalize support display name:", renameErr);
      }

      const conv = await storage.getOrCreateRealtimeConversation(req.user!.id, admin.id);
      res.json({ conversation: conv, adminId: admin.id });
    } catch (e) {
      console.error("support/contact error:", e);
      res.status(500).json({ message: "Failed to contact support" });
    }
  });

  // ----- Chat: list conversations enriched with the other participant's basic info -----
  app.get("/api/chat/conversations-rich", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const me = req.user!.id;
      const convs = await storage.getRealtimeConversations(me);
      const counts = await storage.getUnreadChatCounts(me);
      const otherIds = Array.from(new Set(convs.map(c => c.participant1Id === me ? c.participant2Id : c.participant1Id)));
      const others = await Promise.all(otherIds.map(id => storage.getUser(id)));
      const map = new Map(others.filter(Boolean).map(u => [u!.id, u!]));
      const out = convs.map(c => {
        const otherId = c.participant1Id === me ? c.participant2Id : c.participant1Id;
        const u = map.get(otherId);
        return {
          ...c,
          other: u ? {
            id: u.id,
            name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
            role: u.role,
            avatar: (u as any).avatarUrl ?? null,
          } : { id: otherId, name: "Unknown", role: "user", avatar: null },
          unread: counts[c.id] ?? 0,
          pinned: (c.pinnedBy ?? []).includes(me),
          muted: (c.mutedBy ?? []).includes(me),
        };
      });
      out.sort((a, b) => Number(b.pinned) - Number(a.pinned)
        || new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());
      res.json(out);
    } catch (e) {
      console.error("conversations-rich error:", e);
      res.status(500).json([]);
    }
  });

  // ----- Chat: presence — which of the listed user ids currently have a live socket -----
  app.get("/api/chat/online-status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const idsParam = (req.query.ids as string) || "";
      const ids = idsParam.split(",").map(s => s.trim()).filter(Boolean);
      const out: Record<string, boolean> = {};
      for (const id of ids) out[id] = isUserOnline(id);
      res.json(out);
    } catch {
      res.json({});
    }
  });

  // ----- Chat: unread counts (per-conversation badges + total dot) -----
  app.get("/api/chat/unread-counts", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const counts = await storage.getUnreadChatCounts(req.user!.id);
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      res.json({ counts, total });
    } catch (e) {
      res.status(500).json({ counts: {}, total: 0 });
    }
  });

  // ----- Chat: mute / pin a conversation -----
  app.post("/api/chat/conversations/:id/mute", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.toggleConversationFlag(req.params.id, req.user!.id, "mute", !!req.body?.muted);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Failed" }); }
  });
  app.post("/api/chat/conversations/:id/pin", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      await storage.toggleConversationFlag(req.params.id, req.user!.id, "pin", !!req.body?.pinned);
      res.json({ ok: true });
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  // ----- Chat: file uploads (attachments + voice notes) -----
  // Client sends raw bytes; metadata in headers.
  app.post(
    "/api/chat/upload",
    authenticateToken,
    express.raw({ type: "*/*", limit: "12mb" }),
    async (req: AuthRequest, res: Response) => {
      try {
        const buf: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
        if (!buf?.length) return res.status(400).json({ message: "Empty upload" });
        const mimetype = (req.headers["content-type"] as string) || "application/octet-stream";
        const filename = decodeURIComponent((req.headers["x-filename"] as string) || "upload");
        const saved = await saveChatUpload(buf, filename, mimetype.split(";")[0].trim());
        res.json(saved);
      } catch (e: any) {
        res.status(400).json({ message: e?.message || "Upload failed" });
      }
    },
  );

  // ----- Video sessions for telemedicine appointments -----
  app.get("/api/video/room/:appointmentId", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appt = await storage.getAppointment(req.params.appointmentId);
      if (!appt) return res.status(404).json({ message: "Appointment not found" });
      const provUser = await storage.getProviderWithUser(appt.providerId);
      const isParticipant =
        appt.patientId === req.user!.id ||
        (provUser && provUser.userId === req.user!.id) ||
        req.user!.role === "admin";
      if (!isParticipant) return res.status(403).json({ message: "Not allowed" });
      if (appt.visitType !== "online") {
        return res.status(400).json({ message: "Video room only available for online visits" });
      }
      const session = await getOrCreateVideoSession(appt.id);
      res.json(session);
    } catch (e: any) {
      console.error("video room error", e);
      res.status(500).json({ message: "Failed to create video session" });
    }
  });

  // ----- Provider office hours + auto-reply config -----
  app.get("/api/provider/office-hours", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const cfg = await storage.getProviderOfficeHours(req.user!.id);
      res.json(cfg || null);
    } catch { res.status(500).json({ message: "Failed" }); }
  });
  app.patch("/api/provider/office-hours", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      if (req.user!.role !== "provider" && req.user!.role !== "admin") {
        return res.status(403).json({ message: "Provider only" });
      }
      const allowed = ["weeklySchedule", "timezone", "autoReplyEnabled", "autoReplyMessage", "emergencyContact"];
      const patch: Record<string, any> = {};
      for (const k of allowed) if (req.body[k] !== undefined) patch[k] = req.body[k];
      const updated = await storage.upsertProviderOfficeHours(req.user!.id, patch);
      res.json(updated);
    } catch { res.status(500).json({ message: "Failed to save" }); }
  });

  // ----- Support tickets: two-way messaging from the user side -----
  app.get("/api/support/tickets", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const all = await storage.getAllSupportTickets();
      const mine = req.user!.role === "admin" ? all : all.filter(t => t.userId === req.user!.id);
      // Enrich with reply count + last reply timestamp (excludes internal notes)
      const enriched = await Promise.all(mine.map(async (t) => {
        const msgs = await storage.getTicketMessages(t.id);
        const visible = msgs.filter(m => !m.isInternal);
        const last = visible[visible.length - 1];
        return {
          ...t,
          replyCount: visible.length,
          lastMessageAt: last ? last.createdAt : t.createdAt,
          lastMessagePreview: last ? last.message.slice(0, 80) : null,
          hasAdminReply: visible.some(m => m.userId !== t.userId),
        };
      }));
      res.json(enriched);
    } catch { res.status(500).json({ message: "Failed" }); }
  });
  app.get("/api/support/tickets/:id", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const t = await storage.getSupportTicket(req.params.id);
      if (!t) return res.status(404).json({ message: "Not found" });
      const isAdmin = req.user!.role === "admin";
      if (!isAdmin && t.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      const allMessages = await storage.getTicketMessages(req.params.id);
      // Hide internal notes from non-admins
      const messages = isAdmin ? allMessages : allMessages.filter(m => !m.isInternal);
      // Attach minimal sender info
      const allUsers = await storage.getAllUsers();
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const withSenders = messages.map(m => {
        const u = userMap.get(m.userId);
        return {
          ...m,
          sender: u ? { id: u.id, firstName: u.firstName, lastName: u.lastName, role: u.role } : null,
        };
      });
      res.json({ ticket: t, messages: withSenders });
    } catch { res.status(500).json({ message: "Failed" }); }
  });
  app.post("/api/support/tickets/:id/messages", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const t = await storage.getSupportTicket(req.params.id);
      if (!t) return res.status(404).json({ message: "Not found" });
      const isAdmin = req.user!.role === "admin";
      if (!isAdmin && t.userId !== req.user!.id) return res.status(403).json({ message: "Forbidden" });
      if (!req.body?.message) return res.status(400).json({ message: "Message required" });
      const m = await storage.createTicketMessage({
        ticketId: req.params.id,
        userId: req.user!.id,
        message: req.body.message,
        isInternal: !!req.body.isInternal && isAdmin,
      } as any);
      // Notify the other party
      const otherUserId = isAdmin ? t.userId : (t.assignedTo || null);
      if (otherUserId && !m.isInternal) {
        notify.ticketReplied(otherUserId, { ticketId: t.id, subject: t.subject }).catch(() => {});
      }
      res.json(m);
    } catch (e) { console.error(e); res.status(500).json({ message: "Failed" }); }
  });

  // ----- Admin → user direct message (creates a realtime conversation + message) -----
  app.post("/api/admin/messages", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { recipientId, message } = req.body || {};
      if (!recipientId || !message) return res.status(400).json({ message: "recipientId and message required" });
      const conv = await storage.getOrCreateRealtimeConversation(req.user!.id, recipientId);
      const m = await storage.createRealtimeMessage({
        conversationId: conv.id,
        senderId: req.user!.id,
        content: message,
      } as any);
      pushToUser(recipientId, { type: "message", data: m });
      const sender = await storage.getUser(req.user!.id);
      notify.chatMessage(recipientId, {
        senderName: sender ? `${sender.firstName} ${sender.lastName} (Admin)` : "GoldenLife Admin",
        preview: message,
        conversationId: conv.id,
      }).catch(() => {});
      res.json({ conversation: conv, message: m });
    } catch (e) {
      res.status(500).json({ message: "Failed to send admin message" });
    }
  });

  // ----- Admin broadcast -----
  app.post("/api/admin/broadcasts", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const { title, message, audience = "all", channels = ["in_app", "email"] } = req.body || {};
      if (!title || !message) return res.status(400).json({ message: "title and message required" });
      const allUsers = await storage.getAllUsers();
      let recipients = allUsers;
      if (audience === "patients") recipients = allUsers.filter(u => u.role === "patient");
      else if (audience === "providers") recipients = allUsers.filter(u => u.role === "provider");
      else if (audience.startsWith?.("role:")) {
        const role = audience.slice(5);
        recipients = allUsers.filter(u => u.role === role);
      }

      // Persist broadcast record
      const broadcast = await storage.createAdminBroadcast({
        senderId: req.user!.id,
        title,
        message,
        audience,
        channels,
        recipientCount: recipients.length,
      } as any);

      // Fan out asynchronously — don't block the request
      (async () => {
        for (const u of recipients) {
          await dispatchNotification({
            userId: u.id,
            eventKey: "system.broadcast",
            title,
            body: message,
            email: { subject: title, headingKey: "system.broadcast.heading", intro: message },
          }).catch(err => console.error("[broadcast] dispatch failed for", u.id, err));
        }
      })();

      res.json({ broadcast, recipientCount: recipients.length });
    } catch (e) {
      console.error("broadcast error", e);
      res.status(500).json({ message: "Failed to broadcast" });
    }
  });

  app.get("/api/admin/broadcasts", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await storage.getRecentAdminBroadcasts(50));
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  // ----- Admin: notification delivery logs -----
  app.get("/api/admin/notification-logs", authenticateToken, requireAdmin, async (_req: AuthRequest, res: Response) => {
    try {
      res.json(await storage.getRecentDeliveryLogs(200));
    } catch { res.status(500).json({ message: "Failed" }); }
  });

  // Default return
  return httpServer;
}

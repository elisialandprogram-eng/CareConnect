import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomBytes, createHash } from "crypto";
import { loginSchema, registerSchema, insertProviderSchema, insertAppointmentSchema, insertReviewSchema } from "@shared/schema";
import crypto from 'crypto'; // Import crypto module for randomUUID
import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = "GoldenLife <no-reply@goldenlife.health>";

// Helper to hash OTP
const hashOtp = (otp: string) => createHash('sha256').update(otp).digest('hex');

// Helper to generate 6-digit OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Rate limiting map (simple in-memory)
const otpRateLimit = new Map<string, number>();
const OTP_COOLDOWN = 60 * 1000; // 60 seconds
import { registerChatRoutes } from "./replit_integrations/chat";
import { registerImageRoutes } from "./replit_integrations/image";

const JWT_SECRET = process.env.SESSION_SECRET || "careconnect-jwt-secret-key";
const JWT_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60 * 1000; // 7 days

interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string };
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
  // Register AI integrations routes
  registerChatRoutes(app);
  registerImageRoutes(app);

  // Cookie parser middleware
  const cookieParser = await import("cookie-parser");
  app.use(cookieParser.default());

  // ============ AUTH ROUTES ============

  // Register
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName, phone, role } = req.body;

      // Check if user exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
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
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_IN,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.status(201).json({ user: userWithoutPassword, accessToken });
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

      if (!user.isEmailVerified) {
        return res.status(403).json({ 
          message: "Please verify your email before logging in",
          isEmailVerified: false,
          userId: user.id 
        });
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
        maxAge: 15 * 60 * 1000,
      });

      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: REFRESH_TOKEN_EXPIRES_IN,
      });

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
        maxAge: 15 * 60 * 1000,
      });

      res.json({ accessToken });
    } catch (error) {
      res.status(500).json({ message: "Token refresh failed" });
    }
  });

  // Get current user
  app.get("/api/auth/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
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

  // Update user profile
  app.patch("/api/auth/profile", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { firstName, lastName, phone, address } = req.body;
      
      const user = await storage.updateUser(req.user!.id, {
        firstName,
        lastName,
        phone,
        address,
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // ============ PROVIDER ROUTES ============

  // Get all providers
  app.get("/api/providers", async (req: Request, res: Response) => {
    try {
      const providers = await storage.getAllProviders();
      res.json(providers);
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
      res.json(provider);
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

  // Get current provider (for logged in provider)
  app.get("/api/provider/me", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider profile not found" });
      }
      res.json(provider);
    } catch (error) {
      res.status(500).json({ message: "Failed to get provider" });
    }
  });

  // Setup provider profile
  app.post("/api/provider/setup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { type, specialization, bio, yearsExperience, education, consultationFee, homeVisitFee, city, languages, availableDays } = req.body;

      // Update user city
      await storage.updateUser(req.user!.id, { city });

      // Create provider profile
      const provider = await storage.createProvider({
        userId: req.user!.id,
        type,
        specialization,
        bio,
        yearsExperience,
        education,
        consultationFee: consultationFee.toString(),
        homeVisitFee: homeVisitFee ? homeVisitFee.toString() : null,
        languages,
        availableDays,
        isVerified: false,
        isActive: true,
      });

      // Update user role to provider if not already
      await storage.updateUser(req.user!.id, { role: "provider" });

      res.status(201).json(provider);
    } catch (error) {
      console.error("Provider setup error:", error);
      res.status(500).json({ message: "Failed to setup provider profile" });
    }
  });

  // ============ APPOINTMENT ROUTES ============

  // Create appointment
  app.post("/api/appointments", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      console.log("Received appointment request body:", req.body);
      const { providerId, serviceId, date, startTime, endTime, visitType, paymentMethod, notes, patientAddress, totalAmount } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        console.log("Booking failed: User not authenticated");
        return res.status(401).json({ message: "User not authenticated" });
      }

      const user = await storage.getUser(userId);
      if (!user?.isEmailVerified) {
        console.log("Booking failed: Email not verified for user", userId);
        return res.status(403).json({ message: "Email verification required to book" });
      }

      // Get provider to calculate fee if not provided
      const provider = await storage.getProvider(providerId);
      if (!provider) {
        console.log("Booking failed: Provider not found", providerId);
        return res.status(404).json({ message: "Provider not found" });
      }

      const fee = totalAmount || (visitType === "home" && provider.homeVisitFee
        ? provider.homeVisitFee
        : provider.consultationFee);

      // Create appointment
      console.log("Creating appointment with data:", {
        patientId: userId,
        providerId,
        serviceId,
        date,
        startTime,
        endTime,
        visitType,
        totalAmount: fee.toString()
      });

      const appointment = await storage.createAppointment({
        patientId: userId,
        providerId,
        serviceId: serviceId || null,
        date,
        startTime,
        endTime,
        visitType: visitType || "online",
        status: "pending",
        notes: notes || null,
        patientAddress: patientAddress || null,
        totalAmount: fee.toString(),
      });

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

      // Send booking confirmation email
      if (resend) {
        try {
          const providerWithUser = await storage.getProviderWithUser(providerId);
          const service = serviceId ? await storage.getService(serviceId) : null;
          
          console.log(`Attempting to send booking confirmation to ${user.email}`);
          
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
                  <p style="margin: 5px 0;"><strong>Date:</strong> \${date}</p>
                  <p style="margin: 5px 0;"><strong>Time:</strong> \${startTime} - \${endTime}</p>
                  \${service ? \`<p style="margin: 5px 0;"><strong>Service:</strong> \${service.name}</p>\` : ''}
                  <p style="margin: 5px 0;"><strong>Visit Type:</strong> \${visitType === 'home' ? 'Home Visit' : 'Online Consultation'}</p>
                  <p style="margin: 5px 0;"><strong>Total Amount:</strong> $\${fee}</p>
                </div>

                <p>You can view and manage your appointment in your patient dashboard.</p>
                <p style="color: #64748b; font-size: 0.875rem; margin-top: 30px;">
                  Thank you for choosing GoldenLife.<br>
                  <em>This is an automated message, please do not reply.</em>
                </p>
              </div>
            `,
          });
          console.log("Email send result:", emailResult);
        } catch (emailError) {
          console.error("Failed to send booking confirmation email:", emailError);
        }
      }

      res.status(201).json(appointment);
    } catch (error) {
      console.error("Create appointment error:", error);
      res.status(500).json({ message: "Failed to create appointment" });
    }
  });

  app.get("/api/appointments/patient", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Get provider appointments
  app.get("/api/appointments/provider", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const provider = await storage.getProviderByUserId(req.user!.id);
      if (!provider) {
        return res.status(404).json({ message: "Provider not found" });
      }

      const appointments = await storage.getAppointmentsByProvider(provider.id);
      res.json(appointments);
    } catch (error) {
      res.status(500).json({ message: "Failed to get appointments" });
    }
  });

  // Update appointment status
  app.patch("/api/appointments/:id/status", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { status } = req.body;
      const appointment = await storage.updateAppointment(req.params.id, { status });
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to update appointment status" });
    }
  });

  // Auto-cancel past appointments
  app.post("/api/appointments/cleanup", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointments = await storage.getAppointmentsByPatient(req.user!.id);
      const now = new Date();
      
      for (const apt of appointments) {
        const aptDate = new Date(apt.date);
        const [hours, minutes] = apt.startTime.split(':');
        aptDate.setHours(parseInt(hours), parseInt(minutes));
        
        if (aptDate < now && apt.status === 'pending') {
          await storage.updateAppointment(apt.id, { status: 'cancelled' });
        }
      }
      res.json({ message: "Past appointments cleaned up" });
    } catch (error) {
      res.status(500).json({ message: "Failed to cleanup appointments" });
    }
  });

  // Cancel appointment
  app.patch("/api/appointments/:id/cancel", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const appointment = await storage.updateAppointment(req.params.id, { status: "cancelled" });
      if (!appointment) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error) {
      res.status(500).json({ message: "Failed to cancel appointment" });
    }
  });

  // ============ REVIEW ROUTES ============

  // Create review
  app.post("/api/reviews", authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
      const { appointmentId, providerId, rating, comment } = req.body;

      const review = await storage.createReview({
        appointmentId,
        patientId: req.user!.id,
        providerId,
        rating,
        comment,
      });

      res.status(201).json(review);
    } catch (error) {
      res.status(500).json({ message: "Failed to create review" });
    }
  });

  // ============ ADMIN ROUTES ============

  // Middleware to check admin role
  const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };

  // Admin: Create provider directly
  app.post("/api/admin/providers", authenticateToken, requireAdmin, async (req: AuthRequest, res: Response) => {
    try {
      const {
        email, password, firstName, lastName, phone, city,
        type, specialization, bio, yearsExperience, education,
        consultationFee, homeVisitFee, languages, availableDays
      } = req.body;

      // Check if user exists
      let user = await storage.getUserByEmail(email);

      if (!user) {
        // Create user account
        const hashedPassword = await bcrypt.hash(password, 10);
        user = await storage.createUser({
          email,
          password: hashedPassword,
          firstName,
          lastName,
          phone: phone || "",
          role: "provider",
          city,
        });
      } else {
        // Update existing user to provider role
        await storage.updateUser(user.id, { role: "provider", city });
      }

      // Check if provider profile already exists
      const existingProvider = await storage.getProviderByUserId(user.id);
      if (existingProvider) {
        return res.status(400).json({ message: "Provider profile already exists for this user" });
      }

      // Create provider profile
      const provider = await storage.createProvider({
        userId: user.id,
        type,
        specialization,
        bio,
        yearsExperience,
        education,
        consultationFee: consultationFee.toString(),
        homeVisitFee: homeVisitFee ? homeVisitFee.toString() : null,
        languages,
        availableDays,
        isVerified: true, // Admin-created providers are auto-verified
        isActive: true,
      });

      res.status(201).json(provider);
    } catch (error) {
      console.error("Admin provider creation error:", error);
      res.status(500).json({ message: "Failed to create provider" });
    }
  });

  // Default return
  return httpServer;
}

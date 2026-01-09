import {
  users,
  providers,
  services,
  timeSlots,
  appointments,
  reviews,
  payments,
  refreshTokens,
  promoCodes,
  providerPricingOverrides,
  auditLogs,
  supportTickets,
  ticketMessages,
  contentBlocks,
  faqs,
  blogPosts,
  announcements,
  emailTemplates,
  notificationQueue,
  platformSettings,
  serviceCategories,
  locations,
  dailyMetrics,
  prescriptions,
  medicalHistory,
  userNotifications,
  chatConversations,
  chatMessages,
  realtimeConversations,
  realtimeMessages,
  type User,
  type InsertUser,
  type Provider,
  type InsertProvider,
  type Service,
  type InsertService,
  type TimeSlot,
  type InsertTimeSlot,
  type Appointment,
  type InsertAppointment,
  type Review,
  type InsertReview,
  type Payment,
  type InsertPayment,
  type RefreshToken,
  type InsertRefreshToken,
  type PromoCode,
  type InsertPromoCode,
  type ProviderPricingOverride,
  type InsertProviderPricingOverride,
  type AuditLog,
  type InsertAuditLog,
  type SupportTicket,
  type InsertSupportTicket,
  type TicketMessage,
  type InsertTicketMessage,
  type ContentBlock,
  type InsertContentBlock,
  type Faq,
  type InsertFaq,
  type BlogPost,
  type InsertBlogPost,
  type Announcement,
  type InsertAnnouncement,
  type EmailTemplate,
  type InsertEmailTemplate,
  type Notification,
  type InsertNotification,
  type PlatformSetting,
  type InsertPlatformSetting,
  type ServiceCategory,
  type InsertServiceCategory,
  type Location,
  type InsertLocation,
  type DailyMetric,
  type InsertDailyMetric,
  type Prescription,
  type InsertPrescription,
  type MedicalHistory,
  type InsertMedicalHistory,
  type UserNotification,
  type InsertUserNotification,
  type ChatConversation,
  type ChatMessage,
  type InsertChatMessage,
  type RealtimeConversation,
  type RealtimeMessage,
  type ProviderWithUser,
  type ProviderWithServices,
  type AppointmentWithDetails,
  type ReviewWithPatient,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, or, sql, count, asc } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  // Real-time Chat Methods
  getRealtimeConversations(userId: string): Promise<RealtimeConversation[]>;
  getRealtimeMessages(conversationId: string): Promise<RealtimeMessage[]>;
  createRealtimeMessage(message: any): Promise<RealtimeMessage>;
  getOrCreateRealtimeConversation(p1: string, p2: string): Promise<RealtimeConversation>;

  // AI Chat Integration Methods
  getConversation(id: string): Promise<ChatConversation | undefined>;
  getAllConversations(): Promise<ChatConversation[]>;
  createConversation(title: string): Promise<ChatConversation>;
  deleteConversation(id: string): Promise<void>;
  getMessagesByConversation(conversationId: string): Promise<ChatMessage[]>;
  createMessage(conversationId: string, role: string, content: string): Promise<ChatMessage>;

  // OTP and Email Verification
  updateUserOtp(id: string, data: { 
    emailOtpHash: string | null; 
    emailOtpExpiresAt: Date | null; 
    otpAttempts: number; 
    lastOtpSentAt?: Date;
  }): Promise<void>;
  verifyUserEmail(id: string): Promise<void>;

  // Providers
  getProvider(id: string): Promise<Provider | undefined>;
  getProviderByUserId(userId: string): Promise<Provider | undefined>;
  getProviderWithUser(id: string): Promise<ProviderWithUser | undefined>;
  getProviderWithServices(id: string): Promise<ProviderWithServices | undefined>;
  getAllProviders(): Promise<ProviderWithUser[]>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined>;

  // Services
  getService(id: string): Promise<Service | undefined>;
  getServicesByProvider(providerId: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;

  // Time Slots
  getTimeSlot(id: string): Promise<TimeSlot | undefined>;
  getTimeSlotsByProvider(providerId: string, date?: string): Promise<TimeSlot[]>;
  createTimeSlot(slot: InsertTimeSlot): Promise<TimeSlot>;
  updateTimeSlot(id: string, data: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined>;
  deleteTimeSlot(id: string): Promise<void>;

  // Appointments
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentWithDetails(id: string): Promise<AppointmentWithDetails | undefined>;
  getAppointmentsByPatient(patientId: string): Promise<AppointmentWithDetails[]>;
  getAppointmentsByProvider(providerId: string): Promise<AppointmentWithDetails[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;

  // Reviews
  getReview(id: string): Promise<Review | undefined>;
  getReviewsByProvider(providerId: string): Promise<ReviewWithPatient[]>;
  createReview(review: InsertReview): Promise<Review>;

  // Payments
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByAppointment(appointmentId: string): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined>;

  // Refresh Tokens
  getRefreshToken(token: string): Promise<RefreshToken | undefined>;
  createRefreshToken(refreshToken: InsertRefreshToken): Promise<RefreshToken>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteRefreshTokensByUser(userId: string): Promise<void>;

  // Promo Codes
  createPromoCode(data: InsertPromoCode): Promise<PromoCode>;
  getAllPromoCodes(): Promise<PromoCode[]>;
  getPromoCodeByCode(code: string): Promise<PromoCode | undefined>;
  updatePromoCode(id: string, data: Partial<PromoCode>): Promise<PromoCode | undefined>;
  deletePromoCode(id: string): Promise<void>;

  // Provider Pricing Overrides
  createProviderPricingOverride(data: InsertProviderPricingOverride): Promise<ProviderPricingOverride>;
  getProviderPricingOverride(providerId: string): Promise<ProviderPricingOverride | undefined>;
  getAllPricingOverrides(): Promise<ProviderPricingOverride[]>;
  updateProviderPricingOverride(id: string, data: Partial<ProviderPricingOverride>): Promise<ProviderPricingOverride | undefined>;
  deleteProviderPricingOverride(id: string): Promise<void>;

  // ========== ADMIN DASHBOARD METHODS ==========

  // Analytics
  getAllAppointments(): Promise<AppointmentWithDetails[]>;
  getAllPayments(): Promise<Payment[]>;
  getAnalyticsStats(): Promise<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
  }>;

  // Audit Logs
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;
  getAllAuditLogs(): Promise<AuditLog[]>;
  getAuditLogsByUser(userId: string): Promise<AuditLog[]>;

  // Support Tickets
  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;
  getSupportTicket(id: string): Promise<SupportTicket | undefined>;
  getAllSupportTickets(): Promise<SupportTicket[]>;
  updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined>;
  deleteSupportTicket(id: string): Promise<void>;

  // Ticket Messages
  createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage>;
  getTicketMessages(ticketId: string): Promise<TicketMessage[]>;

  // Content Blocks
  createContentBlock(data: InsertContentBlock): Promise<ContentBlock>;
  getContentBlock(id: string): Promise<ContentBlock | undefined>;
  getContentBlockByKey(key: string): Promise<ContentBlock | undefined>;
  getAllContentBlocks(): Promise<ContentBlock[]>;
  updateContentBlock(id: string, data: Partial<ContentBlock>): Promise<ContentBlock | undefined>;
  deleteContentBlock(id: string): Promise<void>;

  // FAQs
  createFaq(data: InsertFaq): Promise<Faq>;
  getFaq(id: string): Promise<Faq | undefined>;
  getAllFaqs(): Promise<Faq[]>;
  updateFaq(id: string, data: Partial<Faq>): Promise<Faq | undefined>;
  deleteFaq(id: string): Promise<void>;

  // Blog Posts
  createBlogPost(data: InsertBlogPost): Promise<BlogPost>;
  getBlogPost(id: string): Promise<BlogPost | undefined>;
  getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>;
  getAllBlogPosts(): Promise<BlogPost[]>;
  updateBlogPost(id: string, data: Partial<BlogPost>): Promise<BlogPost | undefined>;
  deleteBlogPost(id: string): Promise<void>;

  // Announcements
  createAnnouncement(data: InsertAnnouncement): Promise<Announcement>;
  getAnnouncement(id: string): Promise<Announcement | undefined>;
  getAllAnnouncements(): Promise<Announcement[]>;
  getActiveAnnouncements(): Promise<Announcement[]>;
  updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement | undefined>;
  deleteAnnouncement(id: string): Promise<void>;

  // Email Templates
  createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate>;
  getEmailTemplate(id: string): Promise<EmailTemplate | undefined>;
  getEmailTemplateByName(name: string): Promise<EmailTemplate | undefined>;
  getAllEmailTemplates(): Promise<EmailTemplate[]>;
  updateEmailTemplate(id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate | undefined>;
  deleteEmailTemplate(id: string): Promise<void>;

  // Notifications
  createNotification(data: InsertNotification): Promise<Notification>;
  getNotification(id: string): Promise<Notification | undefined>;
  getAllNotifications(): Promise<Notification[]>;
  getPendingNotifications(): Promise<Notification[]>;
  updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined>;

  // Platform Settings
  createPlatformSetting(data: InsertPlatformSetting): Promise<PlatformSetting>;
  getPlatformSetting(key: string): Promise<PlatformSetting | undefined>;
  getAllPlatformSettings(): Promise<PlatformSetting[]>;
  getPlatformSettingsByCategory(category: string): Promise<PlatformSetting[]>;
  updatePlatformSetting(key: string, value: string): Promise<PlatformSetting | undefined>;
  deletePlatformSetting(id: string): Promise<void>;

  // Service Categories
  createServiceCategory(data: InsertServiceCategory): Promise<ServiceCategory>;
  getServiceCategory(id: string): Promise<ServiceCategory | undefined>;
  getAllServiceCategories(): Promise<ServiceCategory[]>;
  updateServiceCategory(id: string, data: Partial<ServiceCategory>): Promise<ServiceCategory | undefined>;
  deleteServiceCategory(id: string): Promise<void>;

  // Locations
  createLocation(data: InsertLocation): Promise<Location>;
  getLocation(id: string): Promise<Location | undefined>;
  getAllLocations(): Promise<Location[]>;
  updateLocation(id: string, data: Partial<Location>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<void>;

  // Daily Metrics
  createDailyMetric(data: InsertDailyMetric): Promise<DailyMetric>;
  getDailyMetricByDate(date: string): Promise<DailyMetric | undefined>;
  getDailyMetrics(startDate: string, endDate: string): Promise<DailyMetric[]>;
  updateDailyMetric(id: string, data: Partial<DailyMetric>): Promise<DailyMetric | undefined>;

  // AI Chat Integration Methods
  getConversation(id: number): Promise<Conversation | undefined>;
  getAllConversations(): Promise<Conversation[]>;
  createConversation(title: string): Promise<Conversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<Message[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<Message>;

  // Prescriptions
  getPrescription(id: string): Promise<Prescription | undefined>;
  getPrescriptionsByPatient(patientId: string): Promise<Prescription[]>;
  createPrescription(prescription: InsertPrescription): Promise<Prescription>;

  // Medical History
  getMedicalHistoryByPatient(patientId: string): Promise<MedicalHistory[]>;
  createMedicalHistory(history: InsertMedicalHistory): Promise<MedicalHistory>;

  // User Notifications
  getUserNotifications(userId: string): Promise<UserNotification[]>;
  createUserNotification(data: InsertUserNotification): Promise<UserNotification>;
  markNotificationRead(id: string): Promise<void>;

  // Messaging
  getChatConversations(userId: string, role: string): Promise<any[]>;
  getChatMessages(conversationId: string): Promise<ChatMessage[]>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  getOrCreateConversation(patientId: string, providerId: string): Promise<ChatConversation>;

  // User management enhancements
  deleteUser(id: string): Promise<void>;
  
  // Provider management enhancements  
  deleteProvider(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(desc(users.createdAt));
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  async updateUserOtp(id: string, data: { 
    emailOtpHash: string | null; 
    emailOtpExpiresAt: Date | null; 
    otpAttempts: number; 
    lastOtpSentAt?: Date;
  }): Promise<void> {
    await db.update(users).set(data).where(eq(users.id, id));
  }

  async verifyUserEmail(id: string): Promise<void> {
    await db.update(users).set({ 
      isEmailVerified: true,
      emailOtpHash: null,
      emailOtpExpiresAt: null,
      otpAttempts: 0
    }).where(eq(users.id, id));
  }

  // Providers
  async getProvider(id: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.id, id));
    return provider || undefined;
  }

  async getProviderByUserId(userId: string): Promise<Provider | undefined> {
    const [provider] = await db.select().from(providers).where(eq(providers.userId, userId));
    return provider || undefined;
  }

  async getProviderWithUser(id: string): Promise<ProviderWithUser | undefined> {
    const result = await db
      .select()
      .from(providers)
      .innerJoin(users, eq(providers.userId, users.id))
      .where(eq(providers.id, id));

    if (result.length === 0) return undefined;

    return {
      ...result[0].providers,
      user: result[0].users,
    };
  }

  async getProviderWithServices(id: string): Promise<ProviderWithServices | undefined> {
    const providerWithUser = await this.getProviderWithUser(id);
    if (!providerWithUser) return undefined;

    const providerServices = await this.getServicesByProvider(id);

    return {
      ...providerWithUser,
      services: providerServices,
    };
  }

  async getAllProviders(): Promise<ProviderWithUser[]> {
    const result = await db
      .select()
      .from(providers)
      .innerJoin(users, eq(providers.userId, users.id))
      .where(eq(providers.isActive, true))
      .orderBy(desc(providers.rating));

    return result.map((r) => ({
      ...r.providers,
      user: r.users,
    }));
  }

  async createProvider(insertProvider: InsertProvider): Promise<Provider> {
    const [provider] = await db.insert(providers).values(insertProvider).returning();
    return provider;
  }

  async updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined> {
    const [provider] = await db.update(providers).set(data).where(eq(providers.id, id)).returning();
    return provider || undefined;
  }

  // Services
  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service || undefined;
  }

  async getServicesByProvider(providerId: string): Promise<Service[]> {
    return db.select().from(services).where(
      and(eq(services.providerId, providerId), eq(services.isActive, true))
    );
  }

  async createService(insertService: InsertService): Promise<Service> {
    const [service] = await db.insert(services).values(insertService).returning();
    return service;
  }

  async updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined> {
    const [service] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    return service || undefined;
  }

  async deleteService(id: string): Promise<void> {
    await db.update(services).set({ isActive: false }).where(eq(services.id, id));
  }

  // Time Slots
  async getTimeSlot(id: string): Promise<TimeSlot | undefined> {
    const [slot] = await db.select().from(timeSlots).where(eq(timeSlots.id, id));
    return slot || undefined;
  }

  async getTimeSlotsByProvider(providerId: string, date?: string): Promise<TimeSlot[]> {
    const conditions = [eq(timeSlots.providerId, providerId)];
    if (date) {
      conditions.push(eq(timeSlots.date, date));
    }
    return db.select().from(timeSlots).where(and(...conditions));
  }

  async createTimeSlot(insertSlot: InsertTimeSlot): Promise<TimeSlot> {
    const [slot] = await db.insert(timeSlots).values(insertSlot).returning();
    return slot;
  }

  async updateTimeSlot(id: string, data: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined> {
    const [slot] = await db.update(timeSlots).set(data).where(eq(timeSlots.id, id)).returning();
    return slot || undefined;
  }

  async deleteTimeSlot(id: string): Promise<void> {
    await db.delete(timeSlots).where(eq(timeSlots.id, id));
  }

  // Appointments
  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(appointments).where(eq(appointments.id, id));
    return appointment || undefined;
  }

  async getAppointmentWithDetails(id: string): Promise<AppointmentWithDetails | undefined> {
    const result = await db
      .select()
      .from(appointments)
      .innerJoin(users, eq(appointments.patientId, users.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.id, id));

    if (result.length === 0) return undefined;

    const row = result[0];
    const providerUser = await this.getUser(row.providers.userId);

    return {
      ...row.appointments,
      patient: row.users,
      provider: {
        ...row.providers,
        user: providerUser!,
      },
      service: row.services,
    };
  }

  async getAppointmentsByPatient(patientId: string): Promise<AppointmentWithDetails[]> {
    const result = await db
      .select()
      .from(appointments)
      .innerJoin(users, eq(appointments.patientId, users.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.patientId, patientId))
      .orderBy(desc(appointments.date), desc(appointments.startTime));

    const appointmentsWithDetails: AppointmentWithDetails[] = [];

    for (const row of result) {
      const providerUser = await this.getUser(row.providers.userId);
      appointmentsWithDetails.push({
        ...row.appointments,
        patient: row.users,
        provider: {
          ...row.providers,
          user: providerUser!,
        },
        service: row.services,
      });
    }

    return appointmentsWithDetails;
  }

  async getAppointmentsByProvider(providerId: string): Promise<AppointmentWithDetails[]> {
    const result = await db
      .select()
      .from(appointments)
      .innerJoin(users, eq(appointments.patientId, users.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .where(eq(appointments.providerId, providerId))
      .orderBy(desc(appointments.date));

    const appointmentsWithDetails: AppointmentWithDetails[] = [];

    for (const row of result) {
      const providerUser = await this.getUser(row.providers.userId);
      appointmentsWithDetails.push({
        ...row.appointments,
        patient: row.users,
        provider: {
          ...row.providers,
          user: providerUser!,
        },
        service: row.services,
      });
    }

    return appointmentsWithDetails;
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(appointments).values(insertAppointment).returning();
    return appointment;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const updateData = { ...data, updatedAt: new Date() };
    const [appointment] = await db.update(appointments).set(updateData).where(eq(appointments.id, id)).returning();
    return appointment || undefined;
  }

  // Reviews
  async getReview(id: string): Promise<Review | undefined> {
    const [review] = await db.select().from(reviews).where(eq(reviews.id, id));
    return review || undefined;
  }

  async getReviewsByProvider(providerId: string): Promise<ReviewWithPatient[]> {
    const result = await db
      .select()
      .from(reviews)
      .innerJoin(users, eq(reviews.patientId, users.id))
      .where(eq(reviews.providerId, providerId))
      .orderBy(desc(reviews.createdAt));

    return result.map((r) => ({
      ...r.reviews,
      patient: r.users,
    }));
  }

  async createReview(insertReview: InsertReview): Promise<Review> {
    const [review] = await db.insert(reviews).values(insertReview).returning();

    // Update provider rating
    const providerReviews = await this.getReviewsByProvider(insertReview.providerId);
    const avgRating = providerReviews.reduce((sum, r) => sum + r.rating, 0) / providerReviews.length;
    await this.updateProvider(insertReview.providerId, {
      rating: avgRating.toFixed(1),
      totalReviews: providerReviews.length,
    } as any);

    return review;
  }

  // Payments
  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment || undefined;
  }

  async getPaymentByAppointment(appointmentId: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.appointmentId, appointmentId));
    return payment || undefined;
  }

  async createPayment(insertPayment: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(insertPayment).returning();
    return payment;
  }

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [payment] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
    return payment || undefined;
  }

  // Refresh Tokens
  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const [refreshToken] = await db.select().from(refreshTokens).where(eq(refreshTokens.token, token));
    return refreshToken || undefined;
  }

  async createRefreshToken(insertToken: InsertRefreshToken): Promise<RefreshToken> {
    const [token] = await db.insert(refreshTokens).values(insertToken).returning();
    return token;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteRefreshTokensByUser(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  // Promo code operations
  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [promoCode] = await db.insert(promoCodes).values(data).returning();
    return promoCode;
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  }

  async getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
    const [promoCode] = await db.select().from(promoCodes).where(eq(promoCodes.code, code.toUpperCase()));
    return promoCode;
  }

  async updatePromoCode(id: string, data: Partial<PromoCode>): Promise<PromoCode | undefined> {
    const [updated] = await db.update(promoCodes).set(data).where(eq(promoCodes.id, id)).returning();
    return updated;
  }

  async deletePromoCode(id: string): Promise<void> {
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
  }

  // Provider pricing override operations
  async createProviderPricingOverride(data: InsertProviderPricingOverride): Promise<ProviderPricingOverride> {
    const [override] = await db.insert(providerPricingOverrides).values(data).returning();
    return override;
  }

  async getProviderPricingOverride(providerId: string): Promise<ProviderPricingOverride | undefined> {
    const [override] = await db.select()
      .from(providerPricingOverrides)
      .where(and(
        eq(providerPricingOverrides.providerId, providerId),
        eq(providerPricingOverrides.isActive, true)
      ));
    return override;
  }

  async getAllPricingOverrides(): Promise<ProviderPricingOverride[]> {
    return await db.select().from(providerPricingOverrides).orderBy(desc(providerPricingOverrides.createdAt));
  }

  async updateProviderPricingOverride(id: string, data: Partial<ProviderPricingOverride>): Promise<ProviderPricingOverride | undefined> {
    const [updated] = await db.update(providerPricingOverrides)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(providerPricingOverrides.id, id))
      .returning();
    return updated;
  }

  // Prescriptions
  async getPrescription(id: string): Promise<Prescription | undefined> {
    const [prescription] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    return prescription || undefined;
  }

  async getPrescriptionsByPatient(patientId: string): Promise<Prescription[]> {
    return db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.issuedAt));
  }

  async createPrescription(data: InsertPrescription): Promise<Prescription> {
    const [prescription] = await db.insert(prescriptions).values(data).returning();
    return prescription;
  }

  // Medical History
  async getMedicalHistoryByPatient(patientId: string): Promise<MedicalHistory[]> {
    return db.select().from(medicalHistory).where(eq(medicalHistory.patientId, patientId)).orderBy(desc(medicalHistory.date));
  }

  async createMedicalHistory(data: InsertMedicalHistory): Promise<MedicalHistory> {
    const [history] = await db.insert(medicalHistory).values(data).returning();
    return history;
  }

  async deleteProviderPricingOverride(id: string): Promise<void> {
    await db.delete(providerPricingOverrides).where(eq(providerPricingOverrides.id, id));
  }

  // ========== ADMIN DASHBOARD IMPLEMENTATIONS ==========

  // Analytics
  async getAllAppointments(): Promise<AppointmentWithDetails[]> {
    const result = await db
      .select()
      .from(appointments)
      .innerJoin(users, eq(appointments.patientId, users.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .orderBy(desc(appointments.createdAt));

    const appointmentsWithDetails: AppointmentWithDetails[] = [];
    for (const row of result) {
      const providerUser = await this.getUser(row.providers.userId);
      appointmentsWithDetails.push({
        ...row.appointments,
        patient: row.users,
        provider: { ...row.providers, user: providerUser! },
        service: row.services,
      });
    }
    return appointmentsWithDetails;
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }


    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  async getAllAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsByUser(userId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt));
  }

  // Support Tickets
  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [ticket] = await db.insert(supportTickets).values(data).returning();
    return ticket;
  }

  async getSupportTicket(id: string): Promise<SupportTicket | undefined> {
    const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return ticket;
  }

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const [ticket] = await db.update(supportTickets).set({ ...data, updatedAt: new Date() }).where(eq(supportTickets.id, id)).returning();
    return ticket;
  }

  async deleteSupportTicket(id: string): Promise<void> {
    await db.delete(ticketMessages).where(eq(ticketMessages.ticketId, id));
    await db.delete(supportTickets).where(eq(supportTickets.id, id));
  }

  // Ticket Messages
  async createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const [message] = await db.insert(ticketMessages).values(data).returning();
    return message;
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    return db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId)).orderBy(ticketMessages.createdAt);
  }

  // Content Blocks
  async createContentBlock(data: InsertContentBlock): Promise<ContentBlock> {
    const [block] = await db.insert(contentBlocks).values(data).returning();
    return block;
  }

  async getContentBlock(id: string): Promise<ContentBlock | undefined> {
    const [block] = await db.select().from(contentBlocks).where(eq(contentBlocks.id, id));
    return block;
  }

  async getContentBlockByKey(key: string): Promise<ContentBlock | undefined> {
    const [block] = await db.select().from(contentBlocks).where(eq(contentBlocks.key, key));
    return block;
  }

  async getAllContentBlocks(): Promise<ContentBlock[]> {
    return db.select().from(contentBlocks).orderBy(contentBlocks.key);
  }

  async updateContentBlock(id: string, data: Partial<ContentBlock>): Promise<ContentBlock | undefined> {
    const [block] = await db.update(contentBlocks).set({ ...data, updatedAt: new Date() }).where(eq(contentBlocks.id, id)).returning();
    return block;
  }

  async deleteContentBlock(id: string): Promise<void> {
    await db.delete(contentBlocks).where(eq(contentBlocks.id, id));
  }

  // FAQs
  async createFaq(data: InsertFaq): Promise<Faq> {
    const [faq] = await db.insert(faqs).values(data).returning();
    return faq;
  }

  async getFaq(id: string): Promise<Faq | undefined> {
    const [faq] = await db.select().from(faqs).where(eq(faqs.id, id));
    return faq;
  }

  async getAllFaqs(): Promise<Faq[]> {
    return db.select().from(faqs).orderBy(faqs.sortOrder);
  }

  async updateFaq(id: string, data: Partial<Faq>): Promise<Faq | undefined> {
    const [faq] = await db.update(faqs).set({ ...data, updatedAt: new Date() }).where(eq(faqs.id, id)).returning();
    return faq;
  }

  async deleteFaq(id: string): Promise<void> {
    await db.delete(faqs).where(eq(faqs.id, id));
  }

  // Blog Posts
  async createBlogPost(data: InsertBlogPost): Promise<BlogPost> {
    const [post] = await db.insert(blogPosts).values(data).returning();
    return post;
  }

  async getBlogPost(id: string): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return post;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
    return post;
  }

  async getAllBlogPosts(): Promise<BlogPost[]> {
    return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
  }

  async updateBlogPost(id: string, data: Partial<BlogPost>): Promise<BlogPost | undefined> {
    const [post] = await db.update(blogPosts).set({ ...data, updatedAt: new Date() }).where(eq(blogPosts.id, id)).returning();
    return post;
  }

  async deleteBlogPost(id: string): Promise<void> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
  }

  // Announcements
  async createAnnouncement(data: InsertAnnouncement): Promise<Announcement> {
    const [announcement] = await db.insert(announcements).values(data).returning();
    return announcement;
  }

  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    const [announcement] = await db.select().from(announcements).where(eq(announcements.id, id));
    return announcement;
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).orderBy(desc(announcements.createdAt));
  }

  async getActiveAnnouncements(): Promise<Announcement[]> {
    const now = new Date();
    return db.select().from(announcements).where(
      and(eq(announcements.isActive, true), lte(announcements.startDate, now))
    ).orderBy(desc(announcements.createdAt));
  }

  async updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement | undefined> {
    const [announcement] = await db.update(announcements).set(data).where(eq(announcements.id, id)).returning();
    return announcement;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  // Email Templates
  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [template] = await db.insert(emailTemplates).values(data).returning();
    return template;
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return template;
  }

  async getEmailTemplateByName(name: string): Promise<EmailTemplate | undefined> {
    const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
    return template;
  }

  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates).orderBy(emailTemplates.name);
  }

  async updateEmailTemplate(id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const [template] = await db.update(emailTemplates).set({ ...data, updatedAt: new Date() }).where(eq(emailTemplates.id, id)).returning();
    return template;
  }

  async deleteEmailTemplate(id: string): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // Notifications
  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notificationQueue).values(data).returning();
    return notification;
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(notificationQueue).where(eq(notificationQueue.id, id));
    return notification;
  }

  async getAllNotifications(): Promise<Notification[]> {
    return db.select().from(notificationQueue).orderBy(desc(notificationQueue.createdAt));
  }

  async getPendingNotifications(): Promise<Notification[]> {
    return db.select().from(notificationQueue).where(eq(notificationQueue.status, "pending")).orderBy(notificationQueue.createdAt);
  }

  async updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined> {
    const [notification] = await db.update(notificationQueue).set(data).where(eq(notificationQueue.id, id)).returning();
    return notification;
  }

  // Platform Settings
  async createPlatformSetting(data: InsertPlatformSetting): Promise<PlatformSetting> {
    const [setting] = await db.insert(platformSettings).values(data).returning();
    return setting;
  }

  async getPlatformSetting(key: string): Promise<PlatformSetting | undefined> {
    const [setting] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return setting;
  }

  async getAllPlatformSettings(): Promise<PlatformSetting[]> {
    return db.select().from(platformSettings).orderBy(platformSettings.category, platformSettings.key);
  }

  async getPlatformSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    return db.select().from(platformSettings).where(eq(platformSettings.category, category)).orderBy(platformSettings.key);
  }

  async updatePlatformSetting(key: string, value: string): Promise<PlatformSetting | undefined> {
    const [setting] = await db
      .insert(platformSettings)
      .values({ key, value, category: "general" })
      .onConflictDoUpdate({
        target: platformSettings.key,
        set: { value, updatedAt: new Date() },
      })
      .returning();
    return setting;
  }

  async deletePlatformSetting(id: string): Promise<void> {
    await db.delete(platformSettings).where(eq(platformSettings.id, id));
  }

  // Service Categories
  async createServiceCategory(data: InsertServiceCategory): Promise<ServiceCategory> {
    const [category] = await db.insert(serviceCategories).values(data).returning();
    return category;
  }

  async getServiceCategory(id: string): Promise<ServiceCategory | undefined> {
    const [category] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    return category;
  }

  async getAllServiceCategories(): Promise<ServiceCategory[]> {
    return db.select().from(serviceCategories).orderBy(serviceCategories.sortOrder);
  }

  async updateServiceCategory(id: string, data: Partial<ServiceCategory>): Promise<ServiceCategory | undefined> {
    const [category] = await db.update(serviceCategories).set(data).where(eq(serviceCategories.id, id)).returning();
    return category;
  }

  async deleteServiceCategory(id: string): Promise<void> {
    await db.delete(serviceCategories).where(eq(serviceCategories.id, id));
  }

  // Locations
  async createLocation(data: InsertLocation): Promise<Location> {
    const [location] = await db.insert(locations).values(data).returning();
    return location;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locations).where(eq(locations.id, id));
    return location;
  }

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations).orderBy(locations.name);
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location | undefined> {
    const [location] = await db.update(locations).set(data).where(eq(locations.id, id)).returning();
    return location;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  // Daily Metrics
  async createDailyMetric(data: InsertDailyMetric): Promise<DailyMetric> {
    const [metric] = await db.insert(dailyMetrics).values(data).returning();
    return metric;
  }

  async getDailyMetricByDate(date: string): Promise<DailyMetric | undefined> {
    const [metric] = await db.select().from(dailyMetrics).where(eq(dailyMetrics.date, date));
    return metric;
  }

  async getDailyMetrics(startDate: string, endDate: string): Promise<DailyMetric[]> {
    return db.select().from(dailyMetrics).where(
      and(gte(dailyMetrics.date, startDate), lte(dailyMetrics.date, endDate))
    ).orderBy(dailyMetrics.date);
  }

  async updateDailyMetric(id: string, data: Partial<DailyMetric>): Promise<DailyMetric | undefined> {
    const [metric] = await db.update(dailyMetrics).set(data).where(eq(dailyMetrics.id, id)).returning();
    return metric;
  }

  async getConversation(id: string): Promise<ChatConversation | undefined> {
    const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, id));
    return (conversation as any) || undefined;
  }

  async getAllConversations(): Promise<ChatConversation[]> {
    return (db.select().from(chatConversations).orderBy(desc(chatConversations.createdAt)) as any);
  }

  async createConversation(title: string): Promise<ChatConversation> {
    const [conversation] = await db.insert(chatConversations).values({ title, patientId: "system", providerId: "system" } as any).returning();
    return (conversation as any);
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.conversationId, id));
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  }

  async getMessage(id: string): Promise<ChatMessage | undefined> {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return (message as any) || undefined;
  }

  // Real-time Chat Methods
  async getRealtimeConversations(userId: string): Promise<RealtimeConversation[]> {
    return db.select()
      .from(realtimeConversations)
      .where(or(eq(realtimeConversations.participant1Id, userId), eq(realtimeConversations.participant2Id, userId)))
      .orderBy(desc(realtimeConversations.lastMessageAt));
  }

  async getRealtimeMessages(conversationId: string): Promise<RealtimeMessage[]> {
    return db.select()
      .from(realtimeMessages)
      .where(eq(realtimeMessages.conversationId, conversationId))
      .orderBy(asc(realtimeMessages.createdAt));
  }

  async createRealtimeMessage(message: any): Promise<RealtimeMessage> {
    const [newMessage] = await db.insert(realtimeMessages).values(message).returning();
    await db.update(realtimeConversations)
      .set({ lastMessage: message.content, lastMessageAt: new Date() })
      .where(eq(realtimeConversations.id, message.conversationId));
    return newMessage;
  }

  async getOrCreateRealtimeConversation(p1: string, p2: string): Promise<RealtimeConversation> {
    const [existing] = await db.select()
      .from(realtimeConversations)
      .where(or(
        and(eq(realtimeConversations.participant1Id, p1), eq(realtimeConversations.participant2Id, p2)),
        and(eq(realtimeConversations.participant1Id, p2), eq(realtimeConversations.participant2Id, p1))
      ));
    
    if (existing) return existing;
    
    const [created] = await db.insert(realtimeConversations)
      .values({ participant1Id: p1, participant2Id: p2 })
      .returning();
    return created;
  }

  // AI Chat Integration Methods
  async getConversation(id: string): Promise<ChatConversation | undefined> {
    const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, id));
    return conversation || undefined;
  }

  async getAllConversations(): Promise<ChatConversation[]> {
    return db.select().from(chatConversations).orderBy(desc(chatConversations.createdAt));
  }

  async createConversation(title: string): Promise<ChatConversation> {
    const [conversation] = await db.insert(chatConversations).values({ title, patientId: "system", providerId: "system" } as any).returning();
    return conversation;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.conversationId, id));
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  }

  async getMessage(id: string): Promise<ChatMessage | undefined> {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return message || undefined;
  }

  async createMessage(conversationId: string, role: string, content: string): Promise<ChatMessage> {
    const [message] = await db.insert(chatMessages).values({ conversationId, senderId: "system", content } as any).returning();
    return message;
  }

  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(chatMessages.createdAt);
  }

  // User Notifications

  // User management enhancements
  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Provider management enhancements
  async deleteProvider(id: string): Promise<void> {
    await db.update(providers).set({ isActive: false }).where(eq(providers.id, id));
  }
}

export const storage = new DatabaseStorage();
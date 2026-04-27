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
  subServices,
  practitioners,
  servicePractitioners,
  taxSettings,
  patientConsents,
  medicalPractitioners,
  invoices,
  invoiceItems,
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
  type SubService,
  type InsertSubService,
  type TaxSetting,
  type InsertTaxSetting,
  type PatientConsent,
  type InsertPatientConsent,
  type MedicalPractitioner,
  type InsertMedicalPractitioner,
  savedProviders,
  type SavedProvider,
  type InsertSavedProvider,
  type Practitioner,
  type InsertPractitioner,
  type ServicePractitioner,
  type InsertServicePractitioner,
  type Invoice,
  type InsertInvoice,
  type InvoiceItem,
  type InsertInvoiceItem,
  notificationPreferences,
  pushSubscriptions,
  videoSessions,
  providerOfficeHours,
  notificationDeliveryLogs,
  adminBroadcasts,
  wallets,
  walletTransactions,
  type Wallet,
  type WalletTransaction,
  type InsertWalletTransaction,
  type NotificationPreferences,
  type InsertNotificationPreferences,
  type PushSubscription,
  type InsertPushSubscription,
  type VideoSession,
  type ProviderOfficeHours,
  type InsertProviderOfficeHours,
  type NotificationDeliveryLog,
  type AdminBroadcast,
  type InsertAdminBroadcast,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, or, sql, count, asc, aliasedTable } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;

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
  deleteProvider(id: string): Promise<void>;

  // Services
  getService(id: string): Promise<Service | undefined>;
  getServicesByProvider(providerId: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined>;
  deleteService(id: string): Promise<void>;

  // Practitioners
  getPractitioner(id: string): Promise<Practitioner | undefined>;
  getPractitionersByProvider(providerId: string): Promise<Practitioner[]>;
  createPractitioner(practitioner: InsertPractitioner): Promise<Practitioner>;
  updatePractitioner(id: string, data: Partial<InsertPractitioner>): Promise<Practitioner | undefined>;
  deletePractitioner(id: string): Promise<void>;

  // Service Practitioners
  getServicePractitioners(serviceId: string): Promise<(ServicePractitioner & { practitioner: Practitioner })[]>;
  addPractitionerToService(data: InsertServicePractitioner): Promise<ServicePractitioner>;
  removePractitionerFromService(id: string): Promise<void>;
  updateServicePractitionerFee(id: string, fee: string): Promise<ServicePractitioner>;

  // Time Slots
  getTimeSlot(id: string): Promise<TimeSlot | undefined>;
  getTimeSlotsByProvider(providerId: string, date?: string): Promise<TimeSlot[]>;
  createTimeSlot(slot: InsertTimeSlot): Promise<TimeSlot>;
  updateTimeSlot(id: string, data: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined>;
  deleteTimeSlot(id: string): Promise<void>;
  reserveTimeSlot(providerId: string, date: string, startTime: string, endTime: string): Promise<TimeSlot>;

  // Saved Providers (favourites)
  addSavedProvider(patientId: string, providerId: string): Promise<SavedProvider>;
  removeSavedProvider(patientId: string, providerId: string): Promise<void>;
  listSavedProviders(patientId: string): Promise<ProviderWithUser[]>;
  isProviderSaved(patientId: string, providerId: string): Promise<boolean>;

  // Provider stats
  getProviderResponseTimeMinutes(providerId: string): Promise<number | null>;

  // Appointments
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAppointmentWithDetails(id: string): Promise<AppointmentWithDetails | undefined>;
  getAppointmentsByPatient(patientId: string): Promise<AppointmentWithDetails[]>;
  getAppointmentsByProvider(providerId: string): Promise<AppointmentWithDetails[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  getAllAppointments(): Promise<AppointmentWithDetails[]>;

  // Reviews
  getReview(id: string): Promise<Review | undefined>;
  getReviewsByProvider(providerId: string): Promise<ReviewWithPatient[]>;
  createReview(review: InsertReview): Promise<Review>;
  getReviewByAppointment(appointmentId: string): Promise<Review | undefined>;
  replyToReview(reviewId: string, reply: string): Promise<Review | undefined>;

  // Service helpers
  duplicateService(id: string): Promise<Service | undefined>;
  reorderServices(updates: { id: string; sortOrder: number }[]): Promise<void>;

  // Time slot helpers
  bulkCreateTimeSlots(slots: InsertTimeSlot[]): Promise<TimeSlot[]>;
  deleteTimeSlotsByProviderAndDate(providerId: string, date: string): Promise<void>;

  // Notification helpers
  getUnreadNotificationCount(userId: string): Promise<number>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Payments
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByAppointment(appointmentId: string): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined>;
  getAllPayments(): Promise<Payment[]>;

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

  // User Notifications
  getUserNotifications(userId: string): Promise<UserNotification[]>;
  createUserNotification(data: InsertUserNotification): Promise<UserNotification>;
  markNotificationRead(id: string): Promise<void>;

  // Messaging (New)
  getChatConversations(userId: string, role: string): Promise<any[]>;
  getChatMessages(conversationId: string): Promise<ChatMessage[]>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  getOrCreateConversation(patientId: string, providerId: string): Promise<ChatConversation>;

  // Sub-services
  getAllSubServices(): Promise<SubService[]>;
  getSubServicesByCategory(category: string): Promise<SubService[]>;
  createSubService(data: InsertSubService): Promise<SubService>;
  updateSubService(id: string, data: Partial<SubService>): Promise<SubService | undefined>;
  deleteSubService(id: string): Promise<void>;

  // Medical Data
  getPrescription(id: string): Promise<Prescription | undefined>;
  getPrescriptionsByPatient(patientId: string): Promise<Prescription[]>;
  createPrescription(data: InsertPrescription): Promise<Prescription>;
  getMedicalHistoryByPatient(patientId: string): Promise<MedicalHistory[]>;
  createMedicalHistory(data: InsertMedicalHistory): Promise<MedicalHistory>;

  // Medical Practitioners
  createMedicalPractitioner(practitioner: InsertMedicalPractitioner): Promise<MedicalPractitioner>;
  getMedicalPractitionersByProvider(providerId: string): Promise<MedicalPractitioner[]>;

  // Tax Settings
  getAllTaxSettings(): Promise<TaxSetting[]>;
  getTaxSettingByCountry(country: string): Promise<TaxSetting | undefined>;
  createTaxSetting(data: InsertTaxSetting): Promise<TaxSetting>;
  updateTaxSetting(id: string, data: Partial<TaxSetting>): Promise<TaxSetting | undefined>;
  deleteTaxSetting(id: string): Promise<void>;

  // Patient Consents
  createPatientConsent(data: InsertPatientConsent): Promise<PatientConsent>;
  getPatientConsents(userId: string): Promise<PatientConsent[]>;

  // Admin Analytics
  getAnalyticsStats(): Promise<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
    recentPayments: any[];
  }>;

  // Invoices
  getInvoice(id: string): Promise<Invoice | undefined>;
  getInvoiceByAppointment(appointmentId: string): Promise<Invoice | undefined>;
  getInvoicesByPatient(patientId: string): Promise<Invoice[]>;
  getInvoicesByProvider(providerId: string): Promise<Invoice[]>;
  getAllInvoices(): Promise<Invoice[]>;
  createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice>;
  getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]>;
  getPendingInvoiceAppointments(): Promise<any[]>;

  // Notification preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined>;
  upsertNotificationPreferences(userId: string, data: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;
  // Push subscriptions
  addPushSubscription(data: InsertPushSubscription): Promise<PushSubscription>;
  removePushSubscription(endpoint: string): Promise<void>;
  getPushSubscriptions(userId: string): Promise<PushSubscription[]>;
  // Provider office hours
  getProviderOfficeHours(providerUserId: string): Promise<ProviderOfficeHours | undefined>;
  upsertProviderOfficeHours(providerUserId: string, data: Partial<InsertProviderOfficeHours>): Promise<ProviderOfficeHours>;
  // Realtime conversation mute/pin
  toggleConversationFlag(conversationId: string, userId: string, flag: "mute" | "pin", on: boolean): Promise<void>;
  // Admin broadcasts + delivery logs
  createAdminBroadcast(data: InsertAdminBroadcast & { recipientCount?: number }): Promise<AdminBroadcast>;
  getRecentAdminBroadcasts(limit?: number): Promise<AdminBroadcast[]>;

  // Wallet
  getOrCreateWallet(userId: string): Promise<Wallet>;
  getWalletByUserId(userId: string): Promise<Wallet | undefined>;
  getAllWallets(): Promise<Array<Wallet & { user: User }>>;
  getWalletTransactions(userId: string, limit?: number): Promise<WalletTransaction[]>;
  getWalletTransactionByIdempotencyKey(key: string): Promise<WalletTransaction | undefined>;
  topUpWallet(userId: string, amount: number, opts: {
    description?: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
    createdById?: string | null;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction }>;
  debitWallet(userId: string, amount: number, opts: {
    description: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction }>;
  refundWallet(userId: string, amount: number, opts: {
    description: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
    createdById?: string | null;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction }>;
  adminAdjustWallet(userId: string, signedAmount: number, opts: {
    reason: string;
    adminId: string;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction }>;
  getRecentDeliveryLogs(limit?: number): Promise<NotificationDeliveryLog[]>;
  // Unread chat counts
  getUnreadChatCounts(userId: string): Promise<Record<string, number>>;
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

  async deleteUser(id: string): Promise<void> {
    await db.delete(providers).where(eq(providers.userId, id));
    await db.delete(users).where(eq(users.id, id));
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

  // Real-time Chat
  async getRealtimeConversations(userId: string): Promise<RealtimeConversation[]> {
    return db.select().from(realtimeConversations).where(
      or(eq(realtimeConversations.participant1Id, userId), eq(realtimeConversations.participant2Id, userId))
    );
  }

  async getRealtimeMessages(conversationId: string): Promise<RealtimeMessage[]> {
    return db.select().from(realtimeMessages).where(eq(realtimeMessages.conversationId, conversationId)).orderBy(asc(realtimeMessages.createdAt));
  }

  async createRealtimeMessage(message: any): Promise<RealtimeMessage> {
    const [msg] = await db.insert(realtimeMessages).values(message).returning();
    // Keep the conversation row's preview + timestamp in sync so the list view
    // shows the latest snippet instead of "No messages yet".
    try {
      const preview =
        message?.content?.toString().slice(0, 200) ||
        (message?.voiceNoteUrl ? "🎤 Voice note" : message?.attachmentName ? `📎 ${message.attachmentName}` : "");
      await db
        .update(realtimeConversations)
        .set({ lastMessage: preview, lastMessageAt: msg.createdAt ?? new Date() })
        .where(eq(realtimeConversations.id, message.conversationId));
    } catch {
      // best-effort: never let preview update break the message insert path
    }
    return msg;
  }

  async getOrCreateRealtimeConversation(p1: string, p2: string): Promise<RealtimeConversation> {
    const [existing] = await db.select().from(realtimeConversations).where(
      or(
        and(eq(realtimeConversations.participant1Id, p1), eq(realtimeConversations.participant2Id, p2)),
        and(eq(realtimeConversations.participant1Id, p2), eq(realtimeConversations.participant2Id, p1))
      )
    );
    if (existing) return existing;
    const [created] = await db.insert(realtimeConversations).values({ participant1Id: p1, participant2Id: p2 }).returning();
    return created;
  }

  // AI Chat
  async getConversation(id: string): Promise<ChatConversation | undefined> {
    const [conv] = await db.select().from(chatConversations).where(eq(chatConversations.id, id));
    return conv || undefined;
  }

  async getAllConversations(): Promise<ChatConversation[]> {
    return db.select().from(chatConversations).orderBy(desc(chatConversations.createdAt));
  }

  async createConversation(title: string): Promise<any> {
    const [conv] = await db.insert(chatConversations).values({ patientId: "", providerId: "" } as any).returning();
    return conv;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  }

  async getMessagesByConversation(conversationId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(asc(chatMessages.createdAt));
  }

  async createMessage(conversationId: string, role: string, content: string): Promise<any> {
    const [msg] = await db.insert(chatMessages).values({ conversationId, senderId: "", content }).returning();
    return msg;
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
    
    // Direct query to services table to handle schema/table issues
    const providerServices = await db.select().from(services).where(eq(services.providerId, id));
    
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
      .orderBy(desc(providers.createdAt));

    return result.map(r => ({
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

  async deleteProvider(id: string): Promise<void> {
    await db.delete(providers).where(eq(providers.id, id));
  }

  // Services
  async getService(id: string): Promise<Service | undefined> {
    const [service] = await db.select().from(services).where(eq(services.id, id));
    return service || undefined;
  }

  async getServicesByProvider(providerId: string): Promise<Service[]> {
    return db.select().from(services).where(eq(services.providerId, providerId));
  }

  async createService(service: InsertService): Promise<Service> {
    const [newService] = await db.insert(services).values(service).returning();
    return newService;
  }

  async updateService(id: string, data: Partial<InsertService>): Promise<Service | undefined> {
    const [updatedService] = await db.update(services).set(data).where(eq(services.id, id)).returning();
    return updatedService || undefined;
  }

  async deleteService(id: string): Promise<void> {
    await db.delete(services).where(eq(services.id, id));
  }

  // Practitioners (Extended)
  async getPractitioner(id: string): Promise<Practitioner | undefined> {
    const [result] = await db.select().from(practitioners).where(eq(practitioners.id, id));
    return result || undefined;
  }

  async getPractitionersByProvider(providerId: string): Promise<Practitioner[]> {
    return db.select().from(practitioners).where(eq(practitioners.providerId, providerId));
  }

  async createPractitioner(practitioner: InsertPractitioner): Promise<Practitioner> {
    const [result] = await db.insert(practitioners).values(practitioner).returning();
    return result;
  }

  async updatePractitioner(id: string, data: Partial<InsertPractitioner>): Promise<Practitioner | undefined> {
    const [result] = await db.update(practitioners).set(data).where(eq(practitioners.id, id)).returning();
    return result || undefined;
  }

  async deletePractitioner(id: string): Promise<void> {
    await db.delete(servicePractitioners).where(eq(servicePractitioners.practitionerId, id));
    await db.delete(practitioners).where(eq(practitioners.id, id));
  }

  // Service Practitioners
  async getServicePractitioners(serviceId: string): Promise<(ServicePractitioner & { practitioner: Practitioner })[]> {
    const results = await db
      .select()
      .from(servicePractitioners)
      .innerJoin(practitioners, eq(servicePractitioners.practitionerId, practitioners.id))
      .where(eq(servicePractitioners.serviceId, serviceId));
    
    return results.map(r => ({
      ...r.service_practitioners,
      practitioner: r.practitioners
    }));
  }

  async addPractitionerToService(data: InsertServicePractitioner): Promise<ServicePractitioner> {
    const [result] = await db.insert(servicePractitioners).values(data).returning();
    return result;
  }

  async removePractitionerFromService(id: string): Promise<void> {
    await db.delete(servicePractitioners).where(eq(servicePractitioners.id, id));
  }

  async updateServicePractitionerFee(id: string, fee: string): Promise<ServicePractitioner> {
    const [result] = await db.update(servicePractitioners).set({ fee }).where(eq(servicePractitioners.id, id)).returning();
    return result;
  }

  // Time Slots
  async getTimeSlot(id: string): Promise<TimeSlot | undefined> {
    const [slot] = await db.select().from(timeSlots).where(eq(timeSlots.id, id));
    return slot || undefined;
  }

  async getTimeSlotsByProvider(providerId: string, date?: string): Promise<TimeSlot[]> {
    let query = db.select().from(timeSlots).where(eq(timeSlots.providerId, providerId));
    if (date) {
      query = db.select().from(timeSlots).where(and(eq(timeSlots.providerId, providerId), eq(timeSlots.date, date)));
    }
    return query;
  }

  async createTimeSlot(slot: InsertTimeSlot): Promise<TimeSlot> {
    const [newSlot] = await db.insert(timeSlots).values(slot).returning();
    return newSlot;
  }

  async updateTimeSlot(id: string, data: Partial<InsertTimeSlot>): Promise<TimeSlot | undefined> {
    const [updatedSlot] = await db.update(timeSlots).set(data).where(eq(timeSlots.id, id)).returning();
    return updatedSlot || undefined;
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
    const patientUsers = aliasedTable(users, "patientUsers");
    const providerUsers = aliasedTable(users, "providerUsers");
    const result = await db
      .select({
        appointments: appointments,
        patientUser: patientUsers,
        providers: providers,
        providerUser: providerUsers,
        services: services,
        practitioners: practitioners
      })
      .from(appointments)
      .innerJoin(patientUsers, eq(appointments.patientId, patientUsers.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .innerJoin(providerUsers, eq(providers.userId, providerUsers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
      .where(eq(appointments.id, id));

    if (result.length === 0) return undefined;

    const r = result[0];
    return {
      ...r.appointments,
      patient: r.patientUser,
      provider: {
        ...r.providers,
        user: r.providerUser,
      },
      service: r.services || undefined,
      practitioner: (r.practitioners as any) || undefined,
    };
  }

  async getAppointmentsByPatient(patientId: string): Promise<AppointmentWithDetails[]> {
    const patientUsers = aliasedTable(users, "patientUsers");
    const providerUsers = aliasedTable(users, "providerUsers");
    const result = await db
      .select({
        appointments: appointments,
        users: patientUsers,
        providers: providers,
        users_2: providerUsers,
        services: services,
        practitioners: practitioners,
        payments: payments,
      })
      .from(appointments)
      .innerJoin(patientUsers, eq(appointments.patientId, patientUsers.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .innerJoin(providerUsers, eq(providers.userId, providerUsers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
      .leftJoin(payments, eq(payments.appointmentId, appointments.id))
      .where(eq(appointments.patientId, patientId))
      .orderBy(desc(appointments.createdAt));

    return result.map(r => ({
      ...r.appointments,
      patient: r.users,
      provider: {
        ...r.providers,
        user: r.users_2,
      },
      service: r.services || undefined,
      practitioner: (r.practitioners as any) || undefined,
      payment: r.payments || undefined,
    }));
  }

  async getAppointmentsByProvider(providerId: string): Promise<AppointmentWithDetails[]> {
    const patientUsers = aliasedTable(users, "patientUsers");
    const providerUsers = aliasedTable(users, "providerUsers");
    const result = await db
      .select({
        appointments: appointments,
        users: patientUsers,
        providers: providers,
        users_2: providerUsers,
        services: services,
        practitioners: practitioners,
        payments: payments,
      })
      .from(appointments)
      .innerJoin(patientUsers, eq(appointments.patientId, patientUsers.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .innerJoin(providerUsers, eq(providers.userId, providerUsers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
      .leftJoin(payments, eq(payments.appointmentId, appointments.id))
      .where(eq(appointments.providerId, providerId))
      .orderBy(desc(appointments.createdAt));

    return result.map(r => ({
      ...r.appointments,
      patient: r.users,
      provider: {
        ...r.providers,
        user: r.users_2,
      },
      service: r.services || undefined,
      practitioner: (r.practitioners as any) || undefined,
      payment: r.payments || undefined,
    }));
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    const [newAppointment] = await db.insert(appointments).values(appointment).returning();
    return newAppointment;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updatedAppointment] = await db.update(appointments).set(data).where(eq(appointments.id, id)).returning();
    return updatedAppointment || undefined;
  }

  async getAllAppointments(): Promise<AppointmentWithDetails[]> {
    const patientUsers = aliasedTable(users, "patientUsers");
    const providerUsers = aliasedTable(users, "providerUsers");
    const result = await db
      .select({
        appointments: appointments,
        users: patientUsers,
        providers: providers,
        users_2: providerUsers,
        services: services,
        practitioners: practitioners
      })
      .from(appointments)
      .innerJoin(patientUsers, eq(appointments.patientId, patientUsers.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .innerJoin(providerUsers, eq(providers.userId, providerUsers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
      .orderBy(desc(appointments.createdAt));

    return result.map(r => ({
      ...r.appointments,
      patient: r.users,
      provider: {
        ...r.providers,
        user: r.users_2,
      },
      service: r.services || undefined,
      practitioner: (r.practitioners as any) || undefined,
    }));
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

    return result.map(r => ({
      ...r.reviews,
      patient: r.users,
    }));
  }

  async createReview(review: InsertReview): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    return newReview;
  }

  async getReviewByAppointment(appointmentId: string): Promise<Review | undefined> {
    const [review] = await db.select().from(reviews).where(eq(reviews.appointmentId, appointmentId));
    return review || undefined;
  }

  async replyToReview(reviewId: string, reply: string): Promise<Review | undefined> {
    const [updated] = await db.update(reviews)
      .set({ providerReply: reply, providerReplyAt: new Date() })
      .where(eq(reviews.id, reviewId))
      .returning();
    return updated || undefined;
  }

  async duplicateService(id: string): Promise<Service | undefined> {
    const [src] = await db.select().from(services).where(eq(services.id, id));
    if (!src) return undefined;
    const { id: _id, createdAt: _ca, ...rest } = src as any;
    const [copy] = await db.insert(services).values({
      ...rest,
      name: `${src.name} (copy)`,
    }).returning();
    return copy;
  }

  async reorderServices(updates: { id: string; sortOrder: number }[]): Promise<void> {
    for (const u of updates) {
      await db.update(services).set({ sortOrder: u.sortOrder }).where(eq(services.id, u.id));
    }
  }

  async bulkCreateTimeSlots(slots: InsertTimeSlot[]): Promise<TimeSlot[]> {
    if (slots.length === 0) return [];
    return db.insert(timeSlots).values(slots).returning();
  }

  async deleteTimeSlotsByProviderAndDate(providerId: string, date: string): Promise<void> {
    await db.delete(timeSlots).where(and(eq(timeSlots.providerId, providerId), eq(timeSlots.date, date)));
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [row] = await db.select({ c: count() }).from(userNotifications)
      .where(and(eq(userNotifications.userId, userId), eq(userNotifications.isRead, false)));
    return Number(row?.c ?? 0);
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db.update(userNotifications).set({ isRead: true }).where(eq(userNotifications.userId, userId));
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

  async createPayment(payment: InsertPayment): Promise<Payment> {
    const [newPayment] = await db.insert(payments).values(payment).returning();
    return newPayment;
  }

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined> {
    const [updatedPayment] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
    return updatedPayment || undefined;
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  // Refresh Tokens
  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const [t] = await db.select().from(refreshTokens).where(eq(refreshTokens.token, token));
    return t || undefined;
  }

  async createRefreshToken(refreshToken: InsertRefreshToken): Promise<RefreshToken> {
    const [t] = await db.insert(refreshTokens).values(refreshToken).returning();
    return t;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteRefreshTokensByUser(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  // Promo Codes
  async createPromoCode(data: InsertPromoCode): Promise<PromoCode> {
    const [c] = await db.insert(promoCodes).values(data).returning();
    return c;
  }

  async getAllPromoCodes(): Promise<PromoCode[]> {
    return db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt));
  }

  async getPromoCodeByCode(code: string): Promise<PromoCode | undefined> {
    const [c] = await db.select().from(promoCodes).where(eq(promoCodes.code, code));
    return c || undefined;
  }

  async updatePromoCode(id: string, data: Partial<PromoCode>): Promise<PromoCode | undefined> {
    const [c] = await db.update(promoCodes).set(data).where(eq(promoCodes.id, id)).returning();
    return c || undefined;
  }

  async deletePromoCode(id: string): Promise<void> {
    await db.delete(promoCodes).where(eq(promoCodes.id, id));
  }

  // Provider Pricing Overrides
  async createProviderPricingOverride(data: InsertProviderPricingOverride): Promise<ProviderPricingOverride> {
    const [o] = await db.insert(providerPricingOverrides).values(data).returning();
    return o;
  }

  async getProviderPricingOverride(providerId: string): Promise<ProviderPricingOverride | undefined> {
    const [o] = await db.select().from(providerPricingOverrides).where(eq(providerPricingOverrides.providerId, providerId));
    return o || undefined;
  }

  async getAllPricingOverrides(): Promise<ProviderPricingOverride[]> {
    return db.select().from(providerPricingOverrides).orderBy(desc(providerPricingOverrides.createdAt));
  }

  async updateProviderPricingOverride(id: string, data: Partial<ProviderPricingOverride>): Promise<ProviderPricingOverride | undefined> {
    const [o] = await db.update(providerPricingOverrides).set(data).where(eq(providerPricingOverrides.id, id)).returning();
    return o || undefined;
  }

  async deleteProviderPricingOverride(id: string): Promise<void> {
    await db.delete(providerPricingOverrides).where(eq(providerPricingOverrides.id, id));
  }

  // Audit Logs
  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [l] = await db.insert(auditLogs).values(data).returning();
    return l;
  }

  async getAllAuditLogs(): Promise<AuditLog[]> {
    return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt));
  }

  async getAuditLogsByUser(userId: string): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.userId, userId)).orderBy(desc(auditLogs.createdAt));
  }

  // Support Tickets
  async createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket> {
    const [t] = await db.insert(supportTickets).values(data).returning();
    return t;
  }

  async getSupportTicket(id: string): Promise<SupportTicket | undefined> {
    const [t] = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return t || undefined;
  }

  async getAllSupportTickets(): Promise<SupportTicket[]> {
    return db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt));
  }

  async updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined> {
    const [t] = await db.update(supportTickets).set(data).where(eq(supportTickets.id, id)).returning();
    return t || undefined;
  }

  async deleteSupportTicket(id: string): Promise<void> {
    await db.delete(supportTickets).where(eq(supportTickets.id, id));
  }

  // Ticket Messages
  async createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage> {
    const [m] = await db.insert(ticketMessages).values(data).returning();
    return m;
  }

  async getTicketMessages(ticketId: string): Promise<TicketMessage[]> {
    return db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, ticketId)).orderBy(asc(ticketMessages.createdAt));
  }

  // Content Blocks
  async createContentBlock(data: InsertContentBlock): Promise<ContentBlock> {
    const [b] = await db.insert(contentBlocks).values(data).returning();
    return b;
  }

  async getContentBlock(id: string): Promise<ContentBlock | undefined> {
    const [b] = await db.select().from(contentBlocks).where(eq(contentBlocks.id, id));
    return b || undefined;
  }

  async getContentBlockByKey(key: string): Promise<ContentBlock | undefined> {
    const [b] = await db.select().from(contentBlocks).where(eq(contentBlocks.key, key));
    return b || undefined;
  }

  async getAllContentBlocks(): Promise<ContentBlock[]> {
    return db.select().from(contentBlocks).orderBy(asc(contentBlocks.key));
  }

  async updateContentBlock(id: string, data: Partial<ContentBlock>): Promise<ContentBlock | undefined> {
    const [b] = await db.update(contentBlocks).set(data).where(eq(contentBlocks.id, id)).returning();
    return b || undefined;
  }

  async deleteContentBlock(id: string): Promise<void> {
    await db.delete(contentBlocks).where(eq(contentBlocks.id, id));
  }

  // FAQs
  async createFaq(data: InsertFaq): Promise<Faq> {
    const [f] = await db.insert(faqs).values(data).returning();
    return f;
  }

  async getFaq(id: string): Promise<Faq | undefined> {
    const [f] = await db.select().from(faqs).where(eq(faqs.id, id));
    return f || undefined;
  }

  async getAllFaqs(): Promise<Faq[]> {
    return db.select().from(faqs).orderBy(asc(faqs.sortOrder));
  }

  async updateFaq(id: string, data: Partial<Faq>): Promise<Faq | undefined> {
    const [f] = await db.update(faqs).set(data).where(eq(faqs.id, id)).returning();
    return f || undefined;
  }

  async deleteFaq(id: string): Promise<void> {
    await db.delete(faqs).where(eq(faqs.id, id));
  }

  // Blog Posts
  async createBlogPost(data: InsertBlogPost): Promise<BlogPost> {
    const [p] = await db.insert(blogPosts).values(data).returning();
    return p;
  }

  async getBlogPost(id: string): Promise<BlogPost | undefined> {
    const [p] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    return p || undefined;
  }

  async getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
    const [p] = await db.select().from(blogPosts).where(eq(blogPosts.slug, slug));
    return p || undefined;
  }

  async getAllBlogPosts(): Promise<BlogPost[]> {
    return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
  }

  async updateBlogPost(id: string, data: Partial<BlogPost>): Promise<BlogPost | undefined> {
    const [p] = await db.update(blogPosts).set(data).where(eq(blogPosts.id, id)).returning();
    return p || undefined;
  }

  async deleteBlogPost(id: string): Promise<void> {
    await db.delete(blogPosts).where(eq(blogPosts.id, id));
  }

  // Announcements
  async createAnnouncement(data: InsertAnnouncement): Promise<Announcement> {
    const [a] = await db.insert(announcements).values(data).returning();
    return a;
  }

  async getAnnouncement(id: string): Promise<Announcement | undefined> {
    const [a] = await db.select().from(announcements).where(eq(announcements.id, id));
    return a || undefined;
  }

  async getAllAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).orderBy(desc(announcements.createdAt));
  }

  async getActiveAnnouncements(): Promise<Announcement[]> {
    return db.select().from(announcements).where(eq(announcements.isActive, true)).orderBy(desc(announcements.createdAt));
  }

  async updateAnnouncement(id: string, data: Partial<Announcement>): Promise<Announcement | undefined> {
    const [a] = await db.update(announcements).set(data).where(eq(announcements.id, id)).returning();
    return a || undefined;
  }

  async deleteAnnouncement(id: string): Promise<void> {
    await db.delete(announcements).where(eq(announcements.id, id));
  }

  // Email Templates
  async createEmailTemplate(data: InsertEmailTemplate): Promise<EmailTemplate> {
    const [t] = await db.insert(emailTemplates).values(data).returning();
    return t;
  }

  async getEmailTemplate(id: string): Promise<EmailTemplate | undefined> {
    const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
    return t || undefined;
  }

  async getEmailTemplateByName(name: string): Promise<EmailTemplate | undefined> {
    const [t] = await db.select().from(emailTemplates).where(eq(emailTemplates.name, name));
    return t || undefined;
  }

  async getAllEmailTemplates(): Promise<EmailTemplate[]> {
    return db.select().from(emailTemplates).orderBy(asc(emailTemplates.name));
  }

  async updateEmailTemplate(id: string, data: Partial<EmailTemplate>): Promise<EmailTemplate | undefined> {
    const [t] = await db.update(emailTemplates).set(data).where(eq(emailTemplates.id, id)).returning();
    return t || undefined;
  }

  async deleteEmailTemplate(id: string): Promise<void> {
    await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
  }

  // Notifications
  async createNotification(data: InsertNotification): Promise<Notification> {
    const [n] = await db.insert(notificationQueue).values(data).returning();
    return n;
  }

  async getNotification(id: string): Promise<Notification | undefined> {
    const [n] = await db.select().from(notificationQueue).where(eq(notificationQueue.id, id));
    return n || undefined;
  }

  async getAllNotifications(): Promise<Notification[]> {
    return db.select().from(notificationQueue).orderBy(desc(notificationQueue.createdAt));
  }

  async getPendingNotifications(): Promise<Notification[]> {
    return db.select().from(notificationQueue).where(eq(notificationQueue.status, "pending")).orderBy(asc(notificationQueue.createdAt));
  }

  async updateNotification(id: string, data: Partial<Notification>): Promise<Notification | undefined> {
    const [n] = await db.update(notificationQueue).set(data).where(eq(notificationQueue.id, id)).returning();
    return n || undefined;
  }

  // Platform Settings
  async createPlatformSetting(data: InsertPlatformSetting): Promise<PlatformSetting> {
    const [s] = await db.insert(platformSettings).values(data).returning();
    return s;
  }

  async getPlatformSetting(key: string): Promise<PlatformSetting | undefined> {
    const [s] = await db.select().from(platformSettings).where(eq(platformSettings.key, key));
    return s || undefined;
  }

  async getAllPlatformSettings(): Promise<PlatformSetting[]> {
    return db.select().from(platformSettings).orderBy(asc(platformSettings.key));
  }

  async getPlatformSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    return db.select().from(platformSettings).where(eq(platformSettings.category, category)).orderBy(asc(platformSettings.key));
  }

  async updatePlatformSetting(key: string, value: string): Promise<PlatformSetting | undefined> {
    const [s] = await db.update(platformSettings).set({ value, updatedAt: new Date() }).where(eq(platformSettings.key, key)).returning();
    return s || undefined;
  }

  async deletePlatformSetting(id: string): Promise<void> {
    await db.delete(platformSettings).where(eq(platformSettings.id, id));
  }

  // Service Categories
  async createServiceCategory(data: InsertServiceCategory): Promise<ServiceCategory> {
    const [c] = await db.insert(serviceCategories).values(data).returning();
    return c;
  }

  async getServiceCategory(id: string): Promise<ServiceCategory | undefined> {
    const [c] = await db.select().from(serviceCategories).where(eq(serviceCategories.id, id));
    return c || undefined;
  }

  async getAllServiceCategories(): Promise<ServiceCategory[]> {
    return db.select().from(serviceCategories).orderBy(asc(serviceCategories.name));
  }

  async updateServiceCategory(id: string, data: Partial<ServiceCategory>): Promise<ServiceCategory | undefined> {
    const [c] = await db.update(serviceCategories).set(data).where(eq(serviceCategories.id, id)).returning();
    return c || undefined;
  }

  async deleteServiceCategory(id: string): Promise<void> {
    await db.delete(serviceCategories).where(eq(serviceCategories.id, id));
  }

  // Locations
  async createLocation(data: InsertLocation): Promise<Location> {
    const [l] = await db.insert(locations).values(data).returning();
    return l;
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [l] = await db.select().from(locations).where(eq(locations.id, id));
    return l || undefined;
  }

  async getAllLocations(): Promise<Location[]> {
    return db.select().from(locations).orderBy(asc(locations.name));
  }

  async updateLocation(id: string, data: Partial<Location>): Promise<Location | undefined> {
    const [l] = await db.update(locations).set(data).where(eq(locations.id, id)).returning();
    return l || undefined;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  // Daily Metrics
  async createDailyMetric(data: InsertDailyMetric): Promise<DailyMetric> {
    const [m] = await db.insert(dailyMetrics).values(data).returning();
    return m;
  }

  async getDailyMetricByDate(date: string): Promise<DailyMetric | undefined> {
    const [m] = await db.select().from(dailyMetrics).where(eq(dailyMetrics.date, date));
    return m || undefined;
  }

  async getDailyMetrics(startDate: string, endDate: string): Promise<DailyMetric[]> {
    return db.select().from(dailyMetrics).orderBy(asc(dailyMetrics.date));
  }

  async updateDailyMetric(id: string, data: Partial<DailyMetric>): Promise<DailyMetric | undefined> {
    const [m] = await db.update(dailyMetrics).set(data).where(eq(dailyMetrics.id, id)).returning();
    return m || undefined;
  }

  // User Notifications
  async getUserNotifications(userId: string): Promise<UserNotification[]> {
    return db.select().from(userNotifications).where(eq(userNotifications.userId, userId)).orderBy(desc(userNotifications.createdAt));
  }

  async createUserNotification(data: InsertUserNotification): Promise<UserNotification> {
    const [n] = await db.insert(userNotifications).values(data).returning();
    return n;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db.update(userNotifications).set({ isRead: true }).where(eq(userNotifications.id, id));
  }

  // Messaging (New)
  async getChatConversations(userId: string, role: string): Promise<any[]> {
    const result = await db
      .select()
      .from(chatConversations)
      .where(or(eq(chatConversations.patientId, userId), eq(chatConversations.providerId, userId)))
      .orderBy(desc(chatConversations.lastMessageAt));
    return result;
  }

  async getChatMessages(conversationId: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages).where(eq(chatMessages.conversationId, conversationId)).orderBy(asc(chatMessages.createdAt));
  }

  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    const [m] = await db.insert(chatMessages).values(data).returning();
    await db.update(chatConversations).set({ lastMessage: data.content, lastMessageAt: new Date() }).where(eq(chatConversations.id, data.conversationId));
    return m;
  }

  async getOrCreateConversation(patientId: string, providerId: string): Promise<ChatConversation> {
    const [existing] = await db.select().from(chatConversations).where(and(eq(chatConversations.patientId, patientId), eq(chatConversations.providerId, providerId)));
    if (existing) return existing;
    const [created] = await db.insert(chatConversations).values({ patientId, providerId }).returning();
    return created;
  }

  // Sub-services
  async getAllSubServices(): Promise<SubService[]> {
    return db.select().from(subServices).orderBy(asc(subServices.name));
  }

  async getSubServicesByCategory(category: string): Promise<SubService[]> {
    return db.select().from(subServices).where(eq(subServices.category, category as any)).orderBy(asc(subServices.name));
  }

  async createSubService(data: InsertSubService): Promise<SubService> {
    const [s] = await db.insert(subServices).values(data).returning();
    return s;
  }

  async updateSubService(id: string, data: Partial<SubService>): Promise<SubService | undefined> {
    const [s] = await db.update(subServices).set(data).where(eq(subServices.id, id)).returning();
    return s || undefined;
  }

  async deleteSubService(id: string): Promise<void> {
    await db.delete(subServices).where(eq(subServices.id, id));
  }

  // Medical Data
  async getPrescription(id: string): Promise<Prescription | undefined> {
    const [p] = await db.select().from(prescriptions).where(eq(prescriptions.id, id));
    return p || undefined;
  }

  async getPrescriptionsByPatient(patientId: string): Promise<Prescription[]> {
    return db.select().from(prescriptions).where(eq(prescriptions.patientId, patientId)).orderBy(desc(prescriptions.issuedAt));
  }

  async createPrescription(data: InsertPrescription): Promise<Prescription> {
    const [p] = await db.insert(prescriptions).values(data).returning();
    return p;
  }

  async getMedicalHistoryByPatient(patientId: string): Promise<MedicalHistory[]> {
    return db.select().from(medicalHistory).where(eq(medicalHistory.patientId, patientId)).orderBy(desc(medicalHistory.date));
  }

  async createMedicalHistory(data: InsertMedicalHistory): Promise<MedicalHistory> {
    const [h] = await db.insert(medicalHistory).values(data).returning();
    return h;
  }

  // Medical Practitioners
  async createMedicalPractitioner(practitioner: InsertMedicalPractitioner): Promise<MedicalPractitioner> {
    const [result] = await db.insert(medicalPractitioners).values(practitioner).returning();
    return result;
  }

  async getMedicalPractitionersByProvider(providerId: string): Promise<MedicalPractitioner[]> {
    return db.select().from(medicalPractitioners).where(eq(medicalPractitioners.providerId, providerId));
  }

  // Tax Settings
  async getAllTaxSettings(): Promise<TaxSetting[]> {
    try {
      return await db.select().from(taxSettings).orderBy(asc(taxSettings.country));
    } catch (error) {
      console.error("Storage: Error fetching tax settings:", error);
      return [];
    }
  }

  async getTaxSettingByCountry(country: string): Promise<TaxSetting | undefined> {
    const [setting] = await db.select().from(taxSettings).where(eq(taxSettings.country, country));
    return setting || undefined;
  }

  async createTaxSetting(data: InsertTaxSetting): Promise<TaxSetting> {
    const [setting] = await db.insert(taxSettings).values(data).returning();
    return setting;
  }

  async updateTaxSetting(id: string, data: Partial<TaxSetting>): Promise<TaxSetting | undefined> {
    const [setting] = await db.update(taxSettings).set(data).where(eq(taxSettings.id, id)).returning();
    return setting || undefined;
  }

  async deleteTaxSetting(id: string): Promise<void> {
    await db.delete(taxSettings).where(eq(taxSettings.id, id));
  }

  // Patient Consents
  async createPatientConsent(data: InsertPatientConsent): Promise<PatientConsent> {
    const [consent] = await db.insert(patientConsents).values(data).returning();
    return consent;
  }

  async getPatientConsents(userId: string): Promise<PatientConsent[]> {
    return db.select().from(patientConsents).where(eq(patientConsents.userId, userId)).orderBy(desc(patientConsents.acceptedAt));
  }

  // Admin Analytics
  async getAnalyticsStats(): Promise<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
    recentPayments: any[];
  }> {
    const [userCount] = await db.select({ count: count() }).from(users);
    const [providerCount] = await db.select({ count: count() }).from(providers);
    const [bookingCount] = await db.select({ count: count() }).from(appointments);
    const [pendingCount] = await db.select({ count: count() }).from(appointments).where(eq(appointments.status, "pending"));
    const [completedCount] = await db.select({ count: count() }).from(appointments).where(eq(appointments.status, "completed"));
    
    const allPayments = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(10);
    const totalPayments = await db.select().from(payments);
    const totalRevenue = totalPayments.reduce((sum, p) => sum + parseFloat(p.amount || "0"), 0);

    return {
      totalUsers: userCount?.count || 0,
      totalProviders: providerCount?.count || 0,
      totalBookings: bookingCount?.count || 0,
      totalRevenue: totalRevenue.toFixed(2),
      pendingBookings: pendingCount?.count || 0,
      completedBookings: completedCount?.count || 0,
      recentPayments: allPayments,
    };
  }

  // Invoices
  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.id, id));
    return invoice || undefined;
  }

  async getInvoiceByAppointment(appointmentId: string): Promise<Invoice | undefined> {
    const [invoice] = await db.select().from(invoices).where(eq(invoices.appointmentId, appointmentId));
    return invoice || undefined;
  }

  async getInvoicesByPatient(patientId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.patientId, patientId)).orderBy(desc(invoices.issueDate));
  }

  async getInvoicesByProvider(providerId: string): Promise<Invoice[]> {
    return db.select().from(invoices).where(eq(invoices.providerId, providerId)).orderBy(desc(invoices.issueDate));
  }

  async getAllInvoices(): Promise<Invoice[]> {
    try {
      return await db.select().from(invoices).orderBy(desc(invoices.issueDate));
    } catch (error) {
      console.error("Storage: Error fetching all invoices:", error);
      return [];
    }
  }

  async createInvoice(invoice: InsertInvoice, items: InsertInvoiceItem[]): Promise<Invoice> {
    return await db.transaction(async (tx) => {
      const [newInvoice] = await tx.insert(invoices).values(invoice).returning();
      if (items.length > 0) {
        await tx.insert(invoiceItems).values(
          items.map(item => ({ ...item, invoiceId: newInvoice.id }))
        );
      }
      await tx.update(appointments)
        .set({ invoiceGenerated: true })
        .where(eq(appointments.id, invoice.appointmentId));
      return newInvoice;
    });
  }

  async getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
    return db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  }

  async getPendingInvoiceAppointments(): Promise<any[]> {
    return db.select().from(appointments)
      .where(and(eq(appointments.status, "completed"), eq(appointments.invoiceGenerated, false)));
  }

  // Find-or-create a time slot for an exact provider/date/time and atomically
  // mark it as booked. If the slot is already booked, throws.
  async reserveTimeSlot(providerId: string, date: string, startTime: string, endTime: string): Promise<TimeSlot> {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(timeSlots)
        .where(and(
          eq(timeSlots.providerId, providerId),
          eq(timeSlots.date, date),
          eq(timeSlots.startTime, startTime),
        ))
        .limit(1);

      if (existing.length > 0) {
        const slot = existing[0];
        if (slot.isBooked) throw new Error("This time slot is already booked.");
        if (slot.isBlocked) throw new Error("This time slot is unavailable.");
        const [updated] = await tx.update(timeSlots)
          .set({ isBooked: true })
          .where(eq(timeSlots.id, slot.id))
          .returning();
        return updated;
      }

      const [created] = await tx.insert(timeSlots).values({
        providerId,
        date,
        startTime,
        endTime,
        isBooked: true,
        isBlocked: false,
      }).returning();
      return created;
    });
  }

  async addSavedProvider(patientId: string, providerId: string): Promise<SavedProvider> {
    const existing = await db.select().from(savedProviders).where(and(
      eq(savedProviders.patientId, patientId),
      eq(savedProviders.providerId, providerId),
    )).limit(1);
    if (existing.length > 0) return existing[0];
    const [created] = await db.insert(savedProviders).values({ patientId, providerId }).returning();
    return created;
  }

  async removeSavedProvider(patientId: string, providerId: string): Promise<void> {
    await db.delete(savedProviders).where(and(
      eq(savedProviders.patientId, patientId),
      eq(savedProviders.providerId, providerId),
    ));
  }

  async listSavedProviders(patientId: string): Promise<ProviderWithUser[]> {
    const result = await db
      .select({ providers: providers, users: users })
      .from(savedProviders)
      .innerJoin(providers, eq(savedProviders.providerId, providers.id))
      .innerJoin(users, eq(providers.userId, users.id))
      .where(eq(savedProviders.patientId, patientId))
      .orderBy(desc(savedProviders.createdAt));
    return result.map(r => ({ ...r.providers, user: r.users }));
  }

  async isProviderSaved(patientId: string, providerId: string): Promise<boolean> {
    const rows = await db.select({ id: savedProviders.id }).from(savedProviders).where(and(
      eq(savedProviders.patientId, patientId),
      eq(savedProviders.providerId, providerId),
    )).limit(1);
    return rows.length > 0;
  }

  // Average minutes between appointment creation and the first non-pending status change.
  // We approximate by using updatedAt - createdAt for appointments that left "pending".
  async getProviderResponseTimeMinutes(providerId: string): Promise<number | null> {
    const recent = await db.select({
      createdAt: appointments.createdAt,
      updatedAt: appointments.updatedAt,
      status: appointments.status,
    })
      .from(appointments)
      .where(and(
        eq(appointments.providerId, providerId),
      ))
      .orderBy(desc(appointments.createdAt))
      .limit(20);

    const responded = recent.filter(a =>
      a.status !== "pending" &&
      a.createdAt && a.updatedAt &&
      a.updatedAt.getTime() > a.createdAt.getTime()
    );
    if (responded.length === 0) return null;
    const totalMinutes = responded.reduce((sum, a) =>
      sum + Math.round((a.updatedAt!.getTime() - a.createdAt!.getTime()) / 60000)
    , 0);
    return Math.round(totalMinutes / responded.length);
  }

  // ──────────── Notification preferences ────────────
  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    const [r] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
    return r;
  }
  async upsertNotificationPreferences(userId: string, data: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    const existing = await this.getNotificationPreferences(userId);
    if (existing) {
      const [updated] = await db.update(notificationPreferences)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(notificationPreferences.userId, userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(notificationPreferences).values({ userId, ...data } as any).returning();
    return created;
  }

  // ──────────── Push subscriptions ────────────
  async addPushSubscription(data: InsertPushSubscription): Promise<PushSubscription> {
    // Replace if endpoint already exists for this user
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, data.endpoint));
    const [created] = await db.insert(pushSubscriptions).values(data).returning();
    return created;
  }
  async removePushSubscription(endpoint: string): Promise<void> {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
  }
  async getPushSubscriptions(userId: string): Promise<PushSubscription[]> {
    return db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  }

  // ──────────── Provider office hours ────────────
  async getProviderOfficeHours(providerUserId: string): Promise<ProviderOfficeHours | undefined> {
    const [r] = await db.select().from(providerOfficeHours).where(eq(providerOfficeHours.providerUserId, providerUserId));
    return r;
  }
  async upsertProviderOfficeHours(providerUserId: string, data: Partial<InsertProviderOfficeHours>): Promise<ProviderOfficeHours> {
    const existing = await this.getProviderOfficeHours(providerUserId);
    if (existing) {
      const [updated] = await db.update(providerOfficeHours)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(eq(providerOfficeHours.providerUserId, providerUserId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(providerOfficeHours).values({ providerUserId, ...data } as any).returning();
    return created;
  }

  // ──────────── Mute / pin a realtime conversation ────────────
  async toggleConversationFlag(conversationId: string, userId: string, flag: "mute" | "pin", on: boolean): Promise<void> {
    const [c] = await db.select().from(realtimeConversations).where(eq(realtimeConversations.id, conversationId));
    if (!c) return;
    const col = flag === "mute" ? "mutedBy" : "pinnedBy";
    const cur = (c as any)[col] as string[] | null;
    const set = new Set(cur || []);
    if (on) set.add(userId); else set.delete(userId);
    const next = Array.from(set);
    await db.update(realtimeConversations)
      .set(flag === "mute" ? { mutedBy: next } : { pinnedBy: next })
      .where(eq(realtimeConversations.id, conversationId));
  }

  // ──────────── Admin broadcasts + delivery logs ────────────
  async createAdminBroadcast(data: InsertAdminBroadcast & { recipientCount?: number }): Promise<AdminBroadcast> {
    const [created] = await db.insert(adminBroadcasts).values(data as any).returning();
    return created;
  }
  async getRecentAdminBroadcasts(limit = 50): Promise<AdminBroadcast[]> {
    return db.select().from(adminBroadcasts).orderBy(desc(adminBroadcasts.createdAt)).limit(limit);
  }
  async getRecentDeliveryLogs(limit = 200): Promise<NotificationDeliveryLog[]> {
    return db.select().from(notificationDeliveryLogs).orderBy(desc(notificationDeliveryLogs.createdAt)).limit(limit);
  }

  // ──────────── Wallet (transactional) ────────────

  async getWalletByUserId(userId: string): Promise<Wallet | undefined> {
    const [w] = await db.select().from(wallets).where(eq(wallets.userId, userId));
    return w;
  }

  async getOrCreateWallet(userId: string): Promise<Wallet> {
    const existing = await this.getWalletByUserId(userId);
    if (existing) return existing;
    try {
      const [created] = await db
        .insert(wallets)
        .values({ userId, balance: "0.00", currency: "HUF" })
        .returning();
      return created;
    } catch {
      // Race: another caller just inserted; re-read.
      const again = await this.getWalletByUserId(userId);
      if (!again) throw new Error("Failed to create wallet");
      return again;
    }
  }

  async getAllWallets(): Promise<Array<Wallet & { user: User }>> {
    const rows = await db
      .select({ wallet: wallets, user: users })
      .from(wallets)
      .innerJoin(users, eq(wallets.userId, users.id))
      .orderBy(desc(wallets.updatedAt));
    return rows.map(r => ({ ...r.wallet, user: r.user }));
  }

  async getWalletTransactions(userId: string, limit = 100): Promise<WalletTransaction[]> {
    return db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit);
  }

  async getWalletTransactionByIdempotencyKey(key: string): Promise<WalletTransaction | undefined> {
    const [tx] = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.idempotencyKey, key))
      .limit(1);
    return tx;
  }

  // Internal helper: applies a signed delta inside a transaction with row lock.
  // Throws on insufficient funds or frozen wallet (for negative deltas).
  // Idempotent when `idempotencyKey` is supplied — returns the prior row instead
  // of double-applying.
  private async applyWalletDelta(args: {
    userId: string;
    deltaCents: number; // signed integer cents
    type: "topup" | "debit" | "refund" | "adjustment" | "reversal";
    description?: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
    createdById?: string | null;
    allowNegative?: boolean;
  }): Promise<{ wallet: Wallet; transaction: WalletTransaction }> {
    if (!Number.isFinite(args.deltaCents) || args.deltaCents === 0) {
      throw new Error("Wallet delta must be a non-zero amount");
    }
    return await db.transaction(async (tx) => {
      // Idempotency short-circuit (read inside the tx so we don't lose serialization).
      if (args.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.idempotencyKey, args.idempotencyKey))
          .limit(1);
        if (existing) {
          const [w] = await tx
            .select()
            .from(wallets)
            .where(eq(wallets.id, existing.walletId));
          return { wallet: w, transaction: existing };
        }
      }

      // Get-or-create wallet inside the tx, then row-lock it.
      let [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, args.userId))
        .for("update");

      if (!wallet) {
        const [created] = await tx
          .insert(wallets)
          .values({ userId: args.userId, balance: "0.00", currency: "HUF" })
          .returning();
        // Re-lock the freshly created row so subsequent updates serialize.
        const [locked] = await tx
          .select()
          .from(wallets)
          .where(eq(wallets.id, created.id))
          .for("update");
        wallet = locked;
      }

      if (wallet.isFrozen && args.deltaCents < 0 && args.type !== "adjustment") {
        throw new Error("Wallet is frozen");
      }

      const currentCents = Math.round(Number(wallet.balance) * 100);
      const nextCents = currentCents + args.deltaCents;
      if (nextCents < 0 && !args.allowNegative) {
        throw new Error("Insufficient wallet balance");
      }

      const nextBalance = (nextCents / 100).toFixed(2);
      const signedAmount = (args.deltaCents / 100).toFixed(2);

      const [updated] = await tx
        .update(wallets)
        .set({ balance: nextBalance, updatedAt: new Date() })
        .where(eq(wallets.id, wallet.id))
        .returning();

      const [txRow] = await tx
        .insert(walletTransactions)
        .values({
          walletId: wallet.id,
          userId: args.userId,
          type: args.type,
          status: "completed",
          amount: signedAmount,
          balanceAfter: nextBalance,
          currency: wallet.currency,
          description: args.description ?? null,
          referenceType: args.referenceType ?? null,
          referenceId: args.referenceId ?? null,
          idempotencyKey: args.idempotencyKey ?? null,
          createdById: args.createdById ?? null,
        })
        .returning();

      return { wallet: updated, transaction: txRow };
    });
  }

  async topUpWallet(userId: string, amount: number, opts: {
    description?: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
    createdById?: string | null;
  }) {
    if (!(amount > 0)) throw new Error("Top-up amount must be positive");
    return this.applyWalletDelta({
      userId,
      deltaCents: Math.round(amount * 100),
      type: "topup",
      description: opts.description ?? "Wallet top-up",
      referenceType: opts.referenceType ?? "stripe_session",
      referenceId: opts.referenceId ?? null,
      idempotencyKey: opts.idempotencyKey,
      createdById: opts.createdById ?? null,
    });
  }

  async debitWallet(userId: string, amount: number, opts: {
    description: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
  }) {
    if (!(amount > 0)) throw new Error("Debit amount must be positive");
    return this.applyWalletDelta({
      userId,
      deltaCents: -Math.round(amount * 100),
      type: "debit",
      description: opts.description,
      referenceType: opts.referenceType ?? "appointment",
      referenceId: opts.referenceId ?? null,
      idempotencyKey: opts.idempotencyKey,
    });
  }

  async refundWallet(userId: string, amount: number, opts: {
    description: string;
    referenceType?: string;
    referenceId?: string | null;
    idempotencyKey?: string;
    createdById?: string | null;
  }) {
    if (!(amount > 0)) throw new Error("Refund amount must be positive");
    return this.applyWalletDelta({
      userId,
      deltaCents: Math.round(amount * 100),
      type: "refund",
      description: opts.description,
      referenceType: opts.referenceType ?? "appointment",
      referenceId: opts.referenceId ?? null,
      idempotencyKey: opts.idempotencyKey,
      createdById: opts.createdById ?? null,
    });
  }

  async adminAdjustWallet(userId: string, signedAmount: number, opts: { reason: string; adminId: string }) {
    if (!Number.isFinite(signedAmount) || signedAmount === 0) {
      throw new Error("Adjustment amount must be non-zero");
    }
    return this.applyWalletDelta({
      userId,
      deltaCents: Math.round(signedAmount * 100),
      type: "adjustment",
      description: opts.reason,
      referenceType: "admin",
      referenceId: opts.adminId,
      createdById: opts.adminId,
      allowNegative: false,
    });
  }

  // ──────────── Unread chat counts per conversation ────────────
  async getUnreadChatCounts(userId: string): Promise<Record<string, number>> {
    const rows = await db
      .select({ conversationId: realtimeMessages.conversationId, c: count() })
      .from(realtimeMessages)
      .innerJoin(realtimeConversations, eq(realtimeMessages.conversationId, realtimeConversations.id))
      .where(and(
        eq(realtimeMessages.isRead, false),
        sql`${realtimeMessages.senderId} <> ${userId}`,
        or(
          eq(realtimeConversations.participant1Id, userId),
          eq(realtimeConversations.participant2Id, userId),
        ),
      ))
      .groupBy(realtimeMessages.conversationId);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.conversationId] = Number(r.c);
    return out;
  }
}

export const storage = new DatabaseStorage();

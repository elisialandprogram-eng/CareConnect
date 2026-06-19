import {
  bugReports,
  bugReportComments,
  type BugReport,
  type InsertBugReport,
  type BugReportComment,
  type InsertBugReportComment,
  users,
  providers,
  services,
  timeSlots,
  providerTimeOff,
  appointments,
  reviews,
  payments,
  refreshTokens,
  promoCodes,
  providerPricingOverrides,
  auditLogs,
  supportTickets,
  ticketMessages,
  faqs,
  announcements,
  emailTemplates,
  notificationQueue,
  platformSettings,
  locations,
  dailyMetrics,
  prescriptions,
  medicalHistory,
  healthMetrics,
  familyMembers,
  medications,
  medicationLogs,
  userNotifications,
  chatConversations,
  patientDocuments,
  type PatientDocument,
  type InsertPatientDocument,
  chatMessages,
  realtimeConversations,
  realtimeMessages,
  messageEditHistory,
  subServices,
  categories,
  catalogServices,
  practitioners,
  practitionerSchedules,
  servicePractitioners,
  servicePackages,
  servicePriceHistory,
  serviceRequests,
  packageServices,
  taxSettings,
  patientConsents,
  invoices,
  invoiceItems,
  providerEarnings,
  appointmentEvents,
  type AppointmentEvent,
  type AppointmentEventWithActor,
  type InsertAppointmentEvent,
  type User,
  type InsertUser,
  type Provider,
  type InsertProvider,
  type Service,
  type InsertService,
  type TimeSlot,
  type InsertTimeSlot,
  type ProviderTimeOff,
  type InsertProviderTimeOff,
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
  type Faq,
  type InsertFaq,
  type Announcement,
  type InsertAnnouncement,
  type EmailTemplate,
  type InsertEmailTemplate,
  type Notification,
  type InsertNotification,
  type PlatformSetting,
  type InsertPlatformSetting,
  type CatalogService,
  type InsertCatalogService,
  type Location,
  type InsertLocation,
  type DailyMetric,
  type InsertDailyMetric,
  type Prescription,
  type InsertPrescription,
  type MedicalHistory,
  type InsertMedicalHistory,
  type HealthMetric,
  type InsertHealthMetric,
  type FamilyMember,
  type InsertFamilyMember,
  type Medication,
  type InsertMedication,
  type MedicationLog,
  type InsertMedicationLog,
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
  type Category,
  type InsertCategory,
  type TaxSetting,
  type InsertTaxSetting,
  type PatientConsent,
  type InsertPatientConsent,
  type ServiceRequest,
  type InsertServiceRequest,
  type ServiceRequestWithProvider,
  savedProviders,
  type SavedProvider,
  type InsertSavedProvider,
  type Practitioner,
  type InsertPractitioner,
  type ServicePractitioner,
  type InsertServicePractitioner,
  type ServicePackage,
  type InsertServicePackage,
  type ServicePackageWithServices,
  type Invoice,
  type InsertInvoice,
  type InvoiceItem,
  type InsertInvoiceItem,
  type ProviderEarning,
  type InsertProviderEarning,
  notificationPreferences,
  pushSubscriptions,
  videoSessions,
  providerOfficeHours,
  notificationDeliveryLogs,
  adminBroadcasts,
  referrals,
  type Referral,
  type InsertReferral,
  waitlistEntries,
  type WaitlistEntry,
  type InsertWaitlistEntry,
  wallets,
  walletTransactions,
  groupSessions,
  groupSessionParticipants,
  type GroupSession,
  type InsertGroupSession,
  type GroupSessionParticipant,
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
  providerGallery,
  type ProviderGalleryImage,
  type InsertProviderGalleryImage,
  providerDocuments,
  type ProviderDocument,
  type InsertProviderDocument,
  providerCredentials,
  type ProviderCredential,
  type InsertProviderCredential,
  providerCategoryPermissions,
  type ProviderCategoryPermission,
  providerBufferSettings,
  type ProviderBufferSettings,
  type InsertProviderBufferSettings,
  providerBlocks,
  type ProviderBlock,
  type InsertProviderBlock,
  appointmentSlotHolds,
  type AppointmentSlotHold,
  type InsertAppointmentSlotHold,
  adminRoles,
  type AdminRole,
  type InsertAdminRole,
  rbacPermissions,
  type RbacPermission,
  rolePermissions,
  adminAssignments,
  type AdminAssignment,
  type InsertAdminAssignment,
  packages,
  type Package,
  type InsertPackage,
  packageBenefits,
  type PackageBenefit,
  type InsertPackageBenefit,
  userPackages,
  type UserPackage,
  type InsertUserPackage,
  type PackageWithBenefits,
  type UserPackageWithDetails,
  membershipBenefitUsage,
  type MembershipBenefitUsage,
  type InsertMembershipBenefitUsage,
  type PractitionerSchedule,
  type InsertPractitionerSchedule,
  systemEvents,
  type SystemEvent,
  type InsertSystemEvent,
  providerWallets,
  type ProviderWallet,
  providerLedger,
  type ProviderLedger,
  type InsertProviderLedger,
} from "@shared/schema";
import { db, pool } from "../db";
import { countryCurrency, type CountryCode } from "../middleware/country";
import { nativeCurrencyForCountry } from "../lib/service-currency-guard";
import { getRates, toUSDSync } from "../services/currency";
import { eq, and, desc, or, sql, count, asc, aliasedTable, inArray, gte, lte, lt, ilike, isNull, type SQL } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(opts?: { limit?: number }): Promise<User[]>;
  getUsersByIds(ids: string[]): Promise<User[]>;
  getUserListPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    countryCode?: string | null;
  }): Promise<{ rows: User[]; total: number }>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<void>;
  purgeUnverifiedUser(id: string): Promise<void>;

  // Real-time Chat Methods
  getRealtimeConversations(userId: string): Promise<RealtimeConversation[]>;
  getRealtimeMessages(conversationId: string): Promise<RealtimeMessage[]>;
  createRealtimeMessage(message: any): Promise<RealtimeMessage>;
  getOrCreateRealtimeConversation(p1: string, p2: string, opts?: { appointmentId?: string; contextType?: string }): Promise<RealtimeConversation>;
  getConversationForAppointment(appointmentId: string): Promise<RealtimeConversation | undefined>;
  lockConversation(conversationId: string, lockedAt: Date): Promise<void>;

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
  getAllProviders(opts?: { countryCode?: "HU" | "IR" | null }): Promise<ProviderWithUser[]>;
  searchProviders(opts: { q?: string; type?: string; city?: string; verifiedOnly?: boolean; countryCode?: "HU" | "IR" | null; limit?: number; offset?: number }): Promise<{ rows: ProviderWithUser[]; total: number }>;
  createProvider(provider: InsertProvider): Promise<Provider>;
  updateProvider(id: string, data: Partial<InsertProvider>): Promise<Provider | undefined>;
  deleteProvider(id: string): Promise<void>;

  // Services
  getService(id: string): Promise<Service | undefined>;
  getServicesByProvider(providerId: string): Promise<Service[]>;
  createService(service: InsertService): Promise<Service>;
  assignSubServicesToProvider(
    providerId: string,
    subServiceIds: string[],
  ): Promise<{ assigned: Service[]; skipped: { subServiceId: string; reason: string }[] }>;
  updateService(id: string, data: Partial<InsertService>, opts?: { changedBy?: string; reason?: string }): Promise<Service | undefined>;
  deleteService(id: string, opts?: { force?: boolean }): Promise<{ ok: true; soft: boolean } | { ok: false; reason: string; appointmentCount: number }>;
  restoreService(id: string): Promise<Service | undefined>;
  getServicePriceHistory(serviceId: string): Promise<any[]>;

  // Service Packages
  getServicePackage(id: string): Promise<ServicePackageWithServices | undefined>;
  getPackagesByProvider(providerId: string, opts?: { activeOnly?: boolean }): Promise<ServicePackageWithServices[]>;
  createServicePackage(pkg: InsertServicePackage, serviceIds: string[]): Promise<ServicePackageWithServices>;
  updateServicePackage(id: string, data: Partial<InsertServicePackage>, serviceIds?: string[]): Promise<ServicePackageWithServices | undefined>;
  deleteServicePackage(id: string): Promise<void>;

  // Practitioners
  getPractitioner(id: string): Promise<Practitioner | undefined>;
  getPractitionersByProvider(providerId: string): Promise<Practitioner[]>;
  createPractitioner(practitioner: InsertPractitioner): Promise<Practitioner>;
  updatePractitioner(id: string, data: Partial<InsertPractitioner>): Promise<Practitioner | undefined>;
  deletePractitioner(id: string): Promise<void>;

  // Practitioner Schedules
  getPractitionerSchedule(practitionerId: string): Promise<PractitionerSchedule | undefined>;
  upsertPractitionerSchedule(practitionerId: string, weeklySchedule: Record<string, unknown>): Promise<PractitionerSchedule>;

  // Service Practitioners
  getServicePractitioners(serviceId: string): Promise<(ServicePractitioner & { practitioner: Practitioner })[]>;
  getPractitionerServices(practitionerId: string): Promise<(ServicePractitioner & { service: Pick<Service, 'id' | 'name' | 'price'> })[]>;
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

  // Provider Time Off (vacation mode)
  listProviderTimeOff(providerId: string): Promise<ProviderTimeOff[]>;
  createProviderTimeOff(data: InsertProviderTimeOff): Promise<ProviderTimeOff>;
  deleteProviderTimeOff(id: string, providerId: string): Promise<boolean>;
  isProviderOnTimeOff(providerId: string, date: string): Promise<ProviderTimeOff | null>;

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
  /** Lightweight: returns startTimes of blocking appointments on a given date. */
  getProviderBookedStartTimes(providerId: string, date: string): Promise<string[]>;
  /** Buffer-aware: returns {startTime,endTime} of blocking appointments on a given date. */
  getProviderBookedWindows(providerId: string, date: string): Promise<Array<{startTime: string; endTime: string}>>;
  /** Lightweight: SUM of completed appointment totals for a provider. */
  getProviderRevenueTotal(providerId: string): Promise<number>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  getAllAppointments(opts?: { limit?: number }): Promise<AppointmentWithDetails[]>;
  getAppointmentListPaginated(opts?: {
    page?: number;
    limit?: number;
    countryCode?: string | null;
    userId?: string;
  }): Promise<{ rows: AppointmentWithDetails[]; total: number }>;

  // Appointment events (audit trail for cancel / reschedule / no-show)
  createAppointmentEvent(event: InsertAppointmentEvent): Promise<AppointmentEvent>;
  getAppointmentEvents(appointmentId: string): Promise<AppointmentEventWithActor[]>;
  /** Atomically create the appointment row AND its first audit event in one tx. */
  createAppointmentWithEvent(
    appointment: InsertAppointment,
    event: Omit<InsertAppointmentEvent, "appointmentId">,
  ): Promise<{ appointment: Appointment; event: AppointmentEvent }>;
  /** Atomically update the appointment row AND insert an audit event in one tx. */
  updateAppointmentWithEvent(
    id: string,
    data: Partial<InsertAppointment>,
    event: Omit<InsertAppointmentEvent, "appointmentId">,
  ): Promise<{ appointment: Appointment; event: AppointmentEvent } | undefined>;

  // Reviews
  getReview(id: string): Promise<Review | undefined>;
  getReviewsByProvider(providerId: string): Promise<ReviewWithPatient[]>;
  createReview(review: InsertReview): Promise<Review>;
  getReviewByAppointment(appointmentId: string): Promise<Review | undefined>;
  replyToReview(reviewId: string, reply: string): Promise<Review | undefined>;
  recomputeProviderRating(providerId: string): Promise<{ rating: string; totalReviews: number }>;

  // Service helpers
  duplicateService(id: string): Promise<Service | undefined>;
  reorderServices(updates: { id: string; sortOrder: number }[]): Promise<void>;

  // Time slot helpers
  bulkCreateTimeSlots(slots: InsertTimeSlot[]): Promise<TimeSlot[]>;
  deleteTimeSlotsByProviderAndDate(providerId: string, date: string): Promise<void>;
  deleteSlotsByRange(providerId: string, startDate: string, endDate: string): Promise<{ deletedCount: number; preservedCount: number }>;

  // Notification helpers
  getUnreadNotificationCount(userId: string): Promise<number>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Payments
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentByAppointment(appointmentId: string): Promise<Payment | undefined>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment | undefined>;
  getAllPayments(opts?: { limit?: number }): Promise<Payment[]>;

  // Refresh Tokens
  getRefreshToken(token: string): Promise<RefreshToken | undefined>;
  getRefreshTokenByHash(hash: string): Promise<RefreshToken | undefined>;
  createRefreshToken(refreshToken: InsertRefreshToken): Promise<RefreshToken>;
  deleteRefreshToken(token: string): Promise<void>;
  deleteRefreshTokenByHash(hash: string): Promise<void>;
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
  getAllAuditLogs(opts?: { limit?: number; offset?: number; action?: string; entityType?: string; countryCode?: string }): Promise<{ logs: AuditLog[]; total: number }>;
  getAuditLogsByUser(userId: string, opts?: { limit?: number; offset?: number }): Promise<AuditLog[]>;

  // System Monitoring Events
  createSystemEvent(data: InsertSystemEvent): Promise<SystemEvent>;
  getSystemEvents(opts?: { limit?: number; offset?: number; eventType?: string; severity?: string; countryCode?: string; unresolvedOnly?: boolean }): Promise<{ events: SystemEvent[]; total: number }>;
  resolveSystemEvent(id: string, resolvedBy: string): Promise<SystemEvent | undefined>;
  getSystemEventStats(countryCode?: string): Promise<{
    totalUnresolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    recentErrors: SystemEvent[];
  }>;

  // Enhanced analytics
  getEnhancedAnalytics(countryCode?: string): Promise<{
    newUsersLast30Days: number;
    newProvidersLast30Days: number;
    activePatients: number;
    returningPatients: number;
    retentionRate: number;
    avgAppointmentsPerPatient: number;
    refundCount: number;
    refundTotal: string;
    topProviders: Array<{ providerId: string; providerName: string; appointmentCount: number; revenue: string }>;
    bookingsByType: Array<{ visitType: string; count: number }>;
    cancelRate: number;
    providerApprovalsPending: number;
    verificationPending: number;
    growthSeries: Array<{ name: string; users: number; providers: number; bookings: number }>;
  }>;
  getCountryMigrationHistory(): Promise<Array<{
    id: string;
    createdAt: Date | null;
    targetUserId: string | null;
    targetUserEmail: string | null;
    targetUserName: string | null;
    fromCountry: string | null;
    toCountry: string | null;
    counts: Record<string, number> | null;
    reason: string | null;
    performedById: string | null;
    performedByEmail: string | null;
    performedByName: string | null;
  }>>;

  // Tenancy migration: move a user (and every row tied to them by tenancy)
  // from one country to another. Returns counts per table.
  migrateUserCountry(userId: string, targetCountry: string): Promise<{
    userId: string;
    fromCountry: string;
    toCountry: string;
    counts: Record<string, number>;
  }>;

  // Group sessions
  createGroupSession(data: InsertGroupSession): Promise<GroupSession>;
  listGroupSessionsByCountry(country: string, opts?: { onlyUpcoming?: boolean }): Promise<Array<GroupSession & { participantCount: number }>>;
  listGroupSessionsByProvider(providerId: string): Promise<Array<GroupSession & { participantCount: number }>>;
  getGroupSession(id: string): Promise<GroupSession | undefined>;
  getGroupSessionWithParticipants(id: string): Promise<{ session: GroupSession; participants: Array<GroupSessionParticipant & { userEmail: string | null; userFirstName: string | null; userLastName: string | null }> } | undefined>;
  updateGroupSession(id: string, data: Partial<GroupSession>): Promise<GroupSession | undefined>;
  bookGroupSessionWithWallet(opts: { sessionId: string; userId: string }): Promise<{ participant: GroupSessionParticipant; sessionStatus: string }>;
  cancelGroupSessionAndRefund(sessionId: string, performedBy: string): Promise<{ refundedCount: number; refundedTotal: number }>;
  markGroupParticipantAttendance(participantId: string, status: "registered" | "joined" | "no_show", providerUserId: string): Promise<GroupSessionParticipant>;
  recordGroupSessionJoin(sessionId: string, userId: string): Promise<GroupSessionParticipant | undefined>;
  listMyGroupBookings(userId: string): Promise<Array<GroupSessionParticipant & { session: GroupSession }>>;
  tickGroupSessionStatuses(): Promise<{ toLive: number; toCompleted: number }>;

  // Support Tickets
  createSupportTicket(data: InsertSupportTicket): Promise<SupportTicket>;
  getSupportTicket(id: string): Promise<SupportTicket | undefined>;
  getAllSupportTickets(): Promise<SupportTicket[]>;
  updateSupportTicket(id: string, data: Partial<SupportTicket>): Promise<SupportTicket | undefined>;
  deleteSupportTicket(id: string): Promise<void>;

  // Ticket Messages
  createTicketMessage(data: InsertTicketMessage): Promise<TicketMessage>;
  getTicketMessages(ticketId: string): Promise<TicketMessage[]>;

  // FAQs
  createFaq(data: InsertFaq): Promise<Faq>;
  getFaq(id: string): Promise<Faq | undefined>;
  getAllFaqs(): Promise<Faq[]>;
  updateFaq(id: string, data: Partial<Faq>): Promise<Faq | undefined>;
  deleteFaq(id: string): Promise<void>;

  // Announcements
  createAnnouncement(data: InsertAnnouncement): Promise<Announcement>;
  getAnnouncement(id: string): Promise<Announcement | undefined>;
  getAllAnnouncements(opts?: { countryCode?: string }): Promise<Announcement[]>;
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

  // Service Requests (provider → admin approval workflow)
  createServiceRequest(data: InsertServiceRequest): Promise<ServiceRequest>;
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  listServiceRequestsByProvider(providerId: string): Promise<ServiceRequest[]>;
  listAllServiceRequests(): Promise<ServiceRequestWithProvider[]>;
  findPendingServiceRequest(providerId: string, serviceName: string): Promise<ServiceRequest | undefined>;
  updateServiceRequest(id: string, data: Partial<ServiceRequest>): Promise<ServiceRequest | undefined>;

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
  markNotificationRead(id: string, userId: string): Promise<void>;

  // Messaging (New)
  getChatConversations(userId: string, role: string): Promise<any[]>;
  getChatMessages(conversationId: string): Promise<ChatMessage[]>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  getOrCreateConversation(patientId: string, providerId: string): Promise<ChatConversation>;

  // Sub-services
  getAllSubServices(): Promise<SubService[]>;
  getSubServicesByCategory(category: string): Promise<SubService[]>;
  getSubService(id: string): Promise<SubService | undefined>;
  createSubService(data: InsertSubService): Promise<SubService>;
  updateSubService(id: string, data: Partial<SubService>): Promise<SubService | undefined>;
  deleteSubService(id: string, opts?: { force?: boolean }): Promise<{ ok: true; soft: boolean } | { ok: false; reason: string; serviceCount: number; appointmentCount: number }>;
  restoreSubService(id: string): Promise<SubService | undefined>;

  // Provider Gallery
  getProviderGallery(providerId: string): Promise<ProviderGalleryImage[]>;
  getGalleryImage(id: string, providerId: string): Promise<ProviderGalleryImage | undefined>;
  addGalleryImage(data: InsertProviderGalleryImage & { publicId?: string }): Promise<ProviderGalleryImage>;
  updateGalleryImage(id: string, providerId: string, data: Partial<Pick<ProviderGalleryImage, 'caption' | 'sortOrder'>>): Promise<ProviderGalleryImage | undefined>;
  deleteGalleryImage(id: string, providerId: string): Promise<boolean>;
  reorderGalleryImages(providerId: string, orderedIds: string[]): Promise<void>;

  // Provider Documents
  createProviderDocument(data: Omit<ProviderDocument, 'id' | 'createdAt' | 'adminNote'> & { verificationStatus?: string }): Promise<ProviderDocument>;
  getProviderDocuments(providerId: string): Promise<ProviderDocument[]>;
  getProviderDocument(id: string): Promise<ProviderDocument | undefined>;
  getAllProviderDocuments(filters?: { status?: string; countryCode?: string }): Promise<Array<ProviderDocument & { providerName: string }>>;
  updateProviderDocumentStatus(id: string, status: string, adminNote?: string): Promise<ProviderDocument | undefined>;
  deleteProviderDocument(id: string): Promise<void>;

  // Provider Credentials
  createProviderCredential(data: Omit<ProviderCredential, 'id' | 'createdAt' | 'verified' | 'verifiedAt' | 'adminNote'>): Promise<ProviderCredential>;
  getProviderCredentials(providerId: string): Promise<ProviderCredential[]>;
  getPublicProviderCredentials(providerId: string): Promise<ProviderCredential[]>;
  getProviderCredential(id: string): Promise<ProviderCredential | undefined>;
  getAllProviderCredentials(filters?: { verified?: boolean; countryCode?: string }): Promise<Array<ProviderCredential & { providerName: string }>>;
  updateProviderCredential(id: string, providerId: string, data: Partial<Pick<ProviderCredential, 'credentialType' | 'title' | 'licenseNumber' | 'issuingBody'>>): Promise<ProviderCredential | undefined>;
  verifyProviderCredential(id: string, verified: boolean, adminNote?: string): Promise<ProviderCredential | undefined>;
  deleteProviderCredential(id: string): Promise<void>;

  // Provider Category Permissions
  getProviderCategoryPermissions(providerId: string): Promise<ProviderCategoryPermission[]>;
  setProviderCategoryPermissions(providerId: string, permissions: Array<{ categoryId: string; enabled: boolean }>): Promise<ProviderCategoryPermission[]>;
  clearProviderCategoryPermissions(providerId: string): Promise<void>;

  // Packages
  getPackages(filters?: { countryCode?: string; isActive?: boolean; targetUserType?: string }): Promise<PackageWithBenefits[]>;
  getPackage(id: string): Promise<PackageWithBenefits | undefined>;
  createPackage(data: InsertPackage, benefits: Omit<InsertPackageBenefit, "packageId">[]): Promise<PackageWithBenefits>;
  updatePackage(id: string, data: Partial<InsertPackage>, benefits?: Omit<InsertPackageBenefit, "packageId">[]): Promise<PackageWithBenefits | undefined>;
  deletePackage(id: string): Promise<void>;
  clonePackage(id: string, overrides?: Partial<InsertPackage>): Promise<PackageWithBenefits>;
  // User packages
  getUserPackages(userId: string, status?: string): Promise<UserPackageWithDetails[]>;
  getActiveUserPackage(userId: string, countryCode?: string): Promise<(UserPackage & { benefits: PackageBenefit[] }) | undefined>;
  getUserPackage(id: string): Promise<UserPackage | undefined>;
  createUserPackage(data: InsertUserPackage): Promise<UserPackage>;
  activateUserPackage(id: string): Promise<UserPackage | undefined>;
  expireStaleUserPackages(): Promise<number>;
  getPackagePurchaseCount(packageId: string): Promise<number>;
  getPackagePurchaseCounts(packageIds: string[]): Promise<Map<string, number>>;
  updateUserPackage(id: string, data: Partial<InsertUserPackage>): Promise<UserPackage | undefined>;
  pauseUserPackage(id: string, userId: string): Promise<UserPackage | undefined>;
  resumeUserPackage(id: string, userId: string): Promise<UserPackage | undefined>;
  cancelUserPackageRenewal(id: string, userId: string): Promise<UserPackage | undefined>;
  toggleAutoRenew(id: string, userId: string, autoRenew: boolean): Promise<UserPackage | undefined>;
  getBenefitUsage(userPackageId: string): Promise<MembershipBenefitUsage[]>;
  recordBenefitUsage(data: InsertMembershipBenefitUsage): Promise<MembershipBenefitUsage>;
  // Family member sub-resources
  getFamilyMemberAppointments(familyMemberId: string, primaryUserId: string): Promise<any[]>;
  getFamilyMemberDocuments(familyMemberId: string, primaryUserId: string): Promise<any[]>;
  getFamilyMemberConsents(familyMemberId: string, primaryUserId: string): Promise<PatientConsent[]>;
  addFamilyMemberConsent(userId: string, familyMemberId: string, data: { consentType: string; isAccepted: boolean; consentVersion?: string; ipAddress?: string; userAgent?: string }): Promise<PatientConsent>;

  // RBAC
  getAdminRoles(): Promise<AdminRole[]>;
  getAdminRoleByName(name: string): Promise<AdminRole | undefined>;
  createAdminRole(data: InsertAdminRole): Promise<AdminRole>;
  getAllPermissions(): Promise<RbacPermission[]>;
  getRolePermissions(roleId: string): Promise<string[]>;
  getAdminAssignments(filters?: { userId?: string; isActive?: boolean }): Promise<AdminAssignment[]>;
  getAdminAssignment(id: string): Promise<AdminAssignment | undefined>;
  createAdminAssignment(data: InsertAdminAssignment): Promise<AdminAssignment>;
  updateAdminAssignment(id: string, data: Partial<InsertAdminAssignment>): Promise<AdminAssignment | undefined>;
  deleteAdminAssignment(id: string): Promise<void>;
  getAdminUsersWithRoles(): Promise<any[]>;

  // Provider Buffer Settings
  getProviderBufferSettings(providerId: string, practitionerId?: string | null): Promise<ProviderBufferSettings | undefined>;
  upsertProviderBufferSettings(providerId: string, data: Partial<InsertProviderBufferSettings>, practitionerId?: string | null): Promise<ProviderBufferSettings>;

  // Provider Blocks
  getProviderBlocks(providerId: string, practitionerId?: string | null): Promise<ProviderBlock[]>;
  getProviderBlock(id: string): Promise<ProviderBlock | undefined>;
  createProviderBlock(data: InsertProviderBlock): Promise<ProviderBlock>;
  updateProviderBlock(id: string, data: Partial<InsertProviderBlock>): Promise<ProviderBlock | undefined>;
  deleteProviderBlock(id: string): Promise<void>;

  // Slot Holds
  createSlotHold(data: InsertAppointmentSlotHold): Promise<AppointmentSlotHold>;
  getSlotHold(id: string): Promise<AppointmentSlotHold | undefined>;
  deleteSlotHold(id: string): Promise<void>;
  deleteExpiredSlotHolds(): Promise<number>;
  deletePatientSlotHolds(patientId: string, providerId: string, date: string): Promise<void>;

  // Categories
  getAllCategories(includeInactive?: boolean): Promise<Category[]>;
  getCategory(id: string): Promise<Category | undefined>;
  getCategoryBySlug(slug: string): Promise<Category | undefined>;
  createCategory(data: InsertCategory): Promise<Category>;
  updateCategory(id: string, data: Partial<InsertCategory>): Promise<Category | undefined>;
  deleteCategory(id: string, opts?: { force?: boolean }): Promise<{ ok: true; soft: boolean } | { ok: false; reason: string }>;
  restoreCategory(id: string): Promise<Category | undefined>;
  ensureDefaultCategories(): Promise<void>;

  // Catalog Services (middle tier)
  getAllCatalogServices(includeInactive?: boolean): Promise<CatalogService[]>;
  getCatalogServicesByCategory(categoryId: string): Promise<CatalogService[]>;
  getCatalogService(id: string): Promise<CatalogService | undefined>;
  createCatalogService(data: InsertCatalogService): Promise<CatalogService>;
  updateCatalogService(id: string, data: Partial<CatalogService>): Promise<CatalogService | undefined>;
  deleteCatalogService(id: string): Promise<void>;

  // Medical Data
  getPrescription(id: string): Promise<Prescription | undefined>;
  getPrescriptionsByPatient(patientId: string): Promise<Prescription[]>;
  createPrescription(data: InsertPrescription): Promise<Prescription>;
  getMedicalHistoryByPatient(patientId: string): Promise<MedicalHistory[]>;
  createMedicalHistory(data: InsertMedicalHistory): Promise<MedicalHistory>;

  // Health Metrics
  getHealthMetricsByPatient(patientId: string, limit?: number): Promise<HealthMetric[]>;
  createHealthMetric(data: InsertHealthMetric): Promise<HealthMetric>;
  deleteHealthMetric(id: string, patientId: string): Promise<boolean>;

  // Family Members
  getFamilyMembersByUser(primaryUserId: string): Promise<FamilyMember[]>;
  getFamilyMember(id: string): Promise<FamilyMember | undefined>;
  createFamilyMember(primaryUserId: string, data: InsertFamilyMember): Promise<FamilyMember>;
  updateFamilyMember(id: string, primaryUserId: string, data: Partial<InsertFamilyMember>): Promise<FamilyMember | undefined>;
  // Medications
  getMedicationsByUser(userId: string): Promise<Medication[]>;
  getMedication(id: string): Promise<Medication | undefined>;
  createMedication(userId: string, data: InsertMedication): Promise<Medication>;
  updateMedication(id: string, userId: string, data: Partial<InsertMedication>): Promise<Medication | undefined>;
  deleteMedication(id: string, userId: string): Promise<boolean>;
  getMedicationLogs(userId: string, opts?: { medicationId?: string; from?: string; to?: string }): Promise<MedicationLog[]>;
  logMedicationDose(userId: string, data: InsertMedicationLog): Promise<MedicationLog>;
  deleteMedicationLog(id: string, userId: string): Promise<boolean>;
  deleteFamilyMember(id: string, primaryUserId: string): Promise<boolean>;

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
  getAnalyticsStats(countryCode?: string): Promise<{
    totalUsers: number;
    totalProviders: number;
    totalBookings: number;
    totalRevenue: string;
    pendingBookings: number;
    completedBookings: number;
    recentPayments: any[];
    revenueSeries: { name: string; revenue: number; bookings: number }[];
    platformFees: string;
    providerPayouts: string;
    avgBookingValue: string;
    revenueToday: string;
    revenueThisMonth: string;
    revenueLastMonth: string;
    revenueGrowthPct: number;
    activeProviders: number;
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

  // Provider earnings & payouts
  recordProviderEarning(appointmentId: string): Promise<ProviderEarning | null>;
  getProviderEarnings(providerId: string): Promise<ProviderEarning[]>;
  getAllProviderEarnings(): Promise<Array<ProviderEarning & { providerName?: string; appointmentNumber?: string | null }>>;
  getProviderEarningById(id: string): Promise<ProviderEarning | undefined>;
  markEarningPaid(id: string, paidByUserId: string, payoutReference?: string): Promise<ProviderEarning | undefined>;
  getEarningsSummary(providerId?: string): Promise<{
    totalEarnings: string;
    pendingAmount: string;
    paidAmount: string;
    platformRevenue: string;
    count: number;
  }>;

  // Provider wallet & ledger
  getOrCreateProviderWallet(providerId: string): Promise<ProviderWallet>;
  updateProviderWalletBalance(providerId: string, delta: { available?: number; held?: number; pending?: number; lifetime?: number }): Promise<void>;
  addProviderLedgerEntry(entry: InsertProviderLedger): Promise<ProviderLedger>;
  getProviderLedger(providerId: string, limit?: number, offset?: number): Promise<ProviderLedger[]>;
  adjustProviderWallet(providerId: string, amount: number, entryType: string, description: string, actorId: string, referenceId?: string): Promise<ProviderWallet>;
  freezeProviderWallet(providerId: string, frozen: boolean, reason?: string): Promise<ProviderWallet | undefined>;

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

  // ── Overdue invoice reminders ──
  // "Overdue" = status != 'paid' AND dueDate < now AND
  //             (lastReminderAt IS NULL OR lastReminderAt < now - cooldown).
  getOverdueInvoicesNeedingReminder(opts?: {
    cooldownDays?: number;
    limit?: number;
  }): Promise<Invoice[]>;
  markInvoiceReminderSent(invoiceId: string): Promise<void>;
  getInvoiceById(id: string): Promise<Invoice | undefined>;

  // ── Referrals ──
  getOrCreateReferralCode(userId: string): Promise<string>;
  getUserByReferralCode(code: string): Promise<User | undefined>;
  createReferral(data: InsertReferral): Promise<Referral>;
  getReferralByReferredUser(referredUserId: string): Promise<Referral | undefined>;
  getReferralsByReferrer(referrerUserId: string): Promise<Referral[]>;
  qualifyReferral(referredUserId: string, opts: {
    appointmentId: string;
    rewardAmount: number;
    rewardCurrency: string;
  }): Promise<Referral | undefined>;

  // Aggregated leaderboard: top referrers by qualified count + total credits.
  // Returns one row per referrer with hydrated user fields for the admin UI.
  getReferralLeaderboard(limit?: number): Promise<Array<{
    userId: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    qualifiedCount: number;
    pendingCount: number;
    totalCredits: number;
    currency: string;
  }>>;

  // ── Waitlist ──
  createWaitlistEntry(data: InsertWaitlistEntry): Promise<WaitlistEntry>;
  getWaitlistEntry(id: string): Promise<WaitlistEntry | undefined>;
  getWaitlistEntriesByPatient(patientId: string): Promise<WaitlistEntry[]>;
  // For matching: returns ACTIVE entries for this provider+date in FIFO order.
  // If `slotStartTime` is provided, narrows to entries whose preferred window
  // overlaps with that start time (entries with no preferred window match all).
  getActiveWaitlistEntries(opts: {
    providerId: string;
    date: string;
    slotStartTime?: string;
    limit?: number;
  }): Promise<WaitlistEntry[]>;
  updateWaitlistEntry(id: string, data: Partial<WaitlistEntry>): Promise<WaitlistEntry | undefined>;
  cancelPatientActiveWaitlistEntries(patientId: string, providerId: string): Promise<number>;

  // ── Patient Documents ──
  createPatientDocument(data: InsertPatientDocument): Promise<PatientDocument>;
  getPatientDocument(id: string): Promise<PatientDocument | undefined>;
  getPatientDocuments(patientId: string, documentType?: string): Promise<PatientDocument[]>;
  updatePatientDocument(id: string, data: Partial<PatientDocument>): Promise<PatientDocument | undefined>;
  deletePatientDocument(id: string): Promise<void>;
  // Provider can see docs shared with them by a specific patient.
  getPatientDocumentsSharedWithProvider(patientId: string, providerId: string): Promise<PatientDocument[]>;
  // Admin: all documents (most recent first), with optional country filter.
  getAllPatientDocuments(opts?: { countryCode?: string; limit?: number; offset?: number }): Promise<PatientDocument[]>;

  // ── DB-backed idempotency (replaces in-memory apptIdempotencyCache) ──────────
  // Shared across all server instances; safe for multi-process deployments.
  checkIdempotencyKey(key: string, scope: string): Promise<{ status: number; body: any } | null>;
  setIdempotencyKey(key: string, scope: string, userId: string, status: number, body: any, expiresAtMs: number): Promise<void>;

  // ── Bug Reports ──────────────────────────────────────────────────────────────
  createBugReport(data: InsertBugReport): Promise<BugReport>;
  getBugReport(id: string): Promise<BugReport | undefined>;
  getBugReportsByUser(userId: string, opts?: { limit?: number; offset?: number }): Promise<{ reports: BugReport[]; total: number }>;
  getAdminBugReports(opts: {
    countryCode?: string | null;
    status?: string;
    severity?: string;
    priority?: string;
    category?: string;
    assignedTo?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: BugReport[]; total: number }>;
  updateBugReport(id: string, data: Partial<BugReport>): Promise<BugReport | undefined>;
  createBugReportComment(data: InsertBugReportComment): Promise<BugReportComment>;
  getBugReportComments(bugReportId: string): Promise<BugReportComment[]>;
}

import { GroupSessionsMixin } from "./group-sessions.mixin";
import { ProviderMediaMixin } from "./provider-media.mixin";
import { PackagesMixin } from "./packages.mixin";
export class DatabaseStorage extends PackagesMixin implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.isDeleted, false)));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.isDeleted, false)));
    return user || undefined;
  }

  async getAllUsers(opts?: { limit?: number }): Promise<User[]> {
    return db
      .select()
      .from(users)
      .where(eq(users.isDeleted, false))
      .orderBy(desc(users.createdAt))
      .limit(Math.min(opts?.limit ?? 500, 500));
  }

  async getUsersByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return [];
    return db
      .select()
      .from(users)
      .where(inArray(users.id, ids));
  }

  async getUserListPaginated(opts?: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    countryCode?: string | null;
  }): Promise<{ rows: User[]; total: number }> {
    const pageSize = Math.min(opts?.limit ?? 50, 500);
    const offset = ((opts?.page ?? 1) - 1) * pageSize;
    const conditions: SQL[] = [eq(users.isDeleted, false)];

    if (opts?.countryCode) {
      // Admin-role exception: global_admin / legacy admin rows always visible regardless of country
      conditions.push(
        or(
          eq(users.countryCode as any, opts.countryCode),
          inArray(users.role as any, ["admin", "global_admin"]),
        )!,
      );
    }
    if (opts?.role) {
      conditions.push(eq(users.role as any, opts.role));
    }
    if (opts?.search?.trim()) {
      const q = `%${opts.search.trim().toLowerCase()}%`;
      conditions.push(
        or(
          sql`LOWER(${users.firstName}) LIKE ${q}`,
          sql`LOWER(${users.lastName}) LIKE ${q}`,
          sql`LOWER(${users.email}) LIKE ${q}`,
        )!,
      );
    }

    const where = and(...conditions);
    const [{ total }] = await db
      .select({ total: count() })
      .from(users)
      .where(where);
    const rows = await db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset);

    return { rows, total: Number(total) };
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
  }

  // Soft-deletes a user.
  // PRESERVED for historical/financial integrity: appointments, services,
  // invoices, payments, prescriptions, reviews, provider_earnings,
  // appointment_events, audit_logs, blog_posts, wallet, wallet_transactions,
  // support_tickets, time_slots, practitioners, packages.
  // REMOVED (purely personal/session data that should not linger): refresh
  // tokens, push subscriptions, notification queue/preferences/unread items,
  // saved providers, medical history, patient consents, AI conversations,
  // and all chat messages/conversations.
  // The user row itself is kept but flagged isDeleted=true and PII is
  // anonymized so existing foreign keys keep working while no one can ever
  // log in as them again.
  async deleteUser(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const providerRows = await tx
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.userId, id));
      const providerIds = providerRows.map((r) => r.id);

      const idList = (arr: string[]) => sql.join(arr.map((v) => sql`${v}`), sql.raw(','));
      const provIn = providerIds.length ? sql`(${idList(providerIds)})` : null;

      // Personal/session data — safe to remove, contains no business value.
      await tx.execute(sql`DELETE FROM refresh_tokens WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM notification_preferences WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM notification_queue WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM notification_delivery_logs WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM user_notifications WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM patient_consents WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM saved_providers WHERE patient_id = ${id}`);
      await tx.execute(sql`DELETE FROM medical_history WHERE patient_id = ${id}`);
      await tx.execute(sql`DELETE FROM conversations WHERE user_id = ${id}`);

      // Chats — remove personal communication. Tickets are kept (business audit
      // trail) but their own messages stay since the ticket is preserved.
      await tx.execute(sql`DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE patient_id = ${id})`);
      await tx.execute(sql`DELETE FROM chat_conversations WHERE patient_id = ${id}`);
      await tx.execute(sql`DELETE FROM chat_messages WHERE sender_id = ${id}`);
      await tx.execute(sql`DELETE FROM realtime_messages WHERE conversation_id IN (SELECT id FROM realtime_conversations WHERE participant1_id = ${id} OR participant2_id = ${id})`);
      await tx.execute(sql`DELETE FROM realtime_conversations WHERE participant1_id = ${id} OR participant2_id = ${id}`);
      await tx.execute(sql`DELETE FROM realtime_messages WHERE sender_id = ${id}`);

      if (providerIds.length) {
        await tx.execute(sql`DELETE FROM medical_history WHERE provider_id IN ${provIn}`);
        await tx.execute(sql`DELETE FROM saved_providers WHERE provider_id IN ${provIn}`);
        await tx.execute(sql`DELETE FROM chat_messages WHERE conversation_id IN (SELECT id FROM chat_conversations WHERE provider_id IN ${provIn})`);
        await tx.execute(sql`DELETE FROM chat_conversations WHERE provider_id IN ${provIn}`);
        // Future-availability cleanup so removed providers can't be booked.
        await tx.execute(sql`DELETE FROM time_slots WHERE provider_id IN ${provIn} AND is_booked = false AND date >= CURRENT_DATE`);
        // Mark services & provider as inactive so they disappear from search,
        // but the rows (and their links to past appointments/invoices) stay.
        await tx.execute(sql`UPDATE services SET is_active = false WHERE provider_id IN ${provIn}`);
        await tx.execute(sql`UPDATE providers SET is_active = false, status = 'inactive' WHERE id IN ${provIn}`);
      }

      // Anonymize personally-identifying info on the user row itself. Email is
      // rewritten to a deterministic placeholder so the unique constraint is
      // satisfied and a brand new user can sign up with the original address.
      await tx
        .update(users)
        .set({
          email: `deleted+${id}@deleted.local`,
          password: "",
          firstName: "Deleted",
          lastName: "User",
          phone: null,
          mobileNumber: null,
          avatarUrl: null,
          address: null,
          city: null,
          state: null,
          zipCode: null,
          savedLatitude: null,
          savedLongitude: null,
          gender: null,
          dateOfBirth: null,
          preferredPronouns: null,
          occupation: null,
          maritalStatus: null,
          socialNumber: null,
          emergencyContactName: null,
          emergencyContactPhone: null,
          emergencyContactRelation: null,
          bloodGroup: null,
          heightCm: null,
          weightKg: null,
          knownAllergies: null,
          medicalConditions: null,
          currentMedications: null,
          pastSurgeries: null,
          insuranceProvider: null,
          insurancePolicyNumber: null,
          primaryCarePhysician: null,
          googleCalendarId: null,
          googleAccessToken: null,
          googleRefreshToken: null,
          emailOtpHash: null,
          emailOtpExpiresAt: null,
          referralCode: null,
          isSuspended: true,
          suspensionReason: "Account deleted",
          isDeleted: true,
          deletedAt: new Date(),
        } as Partial<User>)
        .where(eq(users.id, id));
    });
  }

  // Hard-deletes a user record that has no business data attached. Used only
  // for unverified abandoned signups so the same email can be re-registered
  // cleanly. Do NOT use this on real users — call deleteUser instead.
  async purgeUnverifiedUser(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM refresh_tokens WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM notification_preferences WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM notification_queue WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM notification_delivery_logs WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM user_notifications WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM wallet_transactions WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM wallets WHERE user_id = ${id}`);
      await tx.execute(sql`DELETE FROM audit_logs WHERE user_id = ${id}`);
      await tx.delete(users).where(eq(users.id, id));
    });
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

  async getOrCreateRealtimeConversation(p1: string, p2: string, opts?: { appointmentId?: string; contextType?: string }): Promise<RealtimeConversation> {
    // If appointmentId given, first look for an existing conversation already linked to it
    if (opts?.appointmentId) {
      const [byAppt] = await db.select().from(realtimeConversations)
        .where(eq(realtimeConversations.appointmentId, opts.appointmentId));
      if (byAppt) return byAppt;
    }
    const [existing] = await db.select().from(realtimeConversations).where(
      or(
        and(eq(realtimeConversations.participant1Id, p1), eq(realtimeConversations.participant2Id, p2)),
        and(eq(realtimeConversations.participant1Id, p2), eq(realtimeConversations.participant2Id, p1))
      )
    );
    if (existing) {
      // Always update to the latest appointment so the conversation context
      // reflects the most recent booking between this patient–provider pair.
      if (opts?.appointmentId && existing.appointmentId !== opts.appointmentId) {
        const [updated] = await db.update(realtimeConversations)
          .set({ appointmentId: opts.appointmentId, contextType: opts.contextType ?? "appointment" })
          .where(eq(realtimeConversations.id, existing.id))
          .returning();
        return updated;
      }
      return existing;
    }
    const [created] = await db.insert(realtimeConversations).values({
      participant1Id: p1,
      participant2Id: p2,
      appointmentId: opts?.appointmentId ?? null,
      contextType: opts?.contextType ?? (opts?.appointmentId ? "appointment" : "general"),
    } as any).returning();
    return created;
  }

  async editRealtimeMessage(messageId: string, newContent: string, editorId: string): Promise<RealtimeMessage> {
    const [current] = await db.select().from(realtimeMessages).where(eq(realtimeMessages.id, messageId));
    if (!current) throw new Error("Message not found");
    await db.insert(messageEditHistory).values({
      messageId,
      previousContent: current.content,
      editedBy: editorId,
    });
    const [updated] = await db.update(realtimeMessages)
      .set({ content: newContent, isEdited: true, editedAt: new Date() })
      .where(eq(realtimeMessages.id, messageId))
      .returning();
    return updated;
  }

  async getMessageEditHistory(messageId: string): Promise<any[]> {
    return db.select().from(messageEditHistory)
      .where(eq(messageEditHistory.messageId, messageId))
      .orderBy(asc(messageEditHistory.editedAt));
  }

  async getConversationForAppointment(appointmentId: string): Promise<RealtimeConversation | undefined> {
    const [c] = await db.select().from(realtimeConversations)
      .where(eq(realtimeConversations.appointmentId, appointmentId));
    return c ?? undefined;
  }

  async lockConversation(conversationId: string, lockedAt: Date): Promise<void> {
    await db.update(realtimeConversations)
      .set({ lockedAt })
      .where(eq(realtimeConversations.id, conversationId));
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
    
    // Direct query to services table joined with sub_services
    const rows = await db
      .select()
      .from(services)
      .leftJoin(subServices, eq(services.subServiceId, subServices.id))
      .where(eq(services.providerId, id));

    const providerServices = rows.map(r => ({
      ...r.services,
      subService: r.sub_services || undefined,
    }));

    return {
      ...providerWithUser,
      services: providerServices as any,
    };
  }

  async getAllProviders(opts?: { countryCode?: "HU" | "IR" | null; limit?: number }): Promise<ProviderWithUser[]> {
    const MAX_LIMIT = 500;
    const effectiveLimit = Math.min(opts?.limit ?? MAX_LIMIT, MAX_LIMIT);

    const baseQuery = db
      .select()
      .from(providers)
      .innerJoin(users, eq(providers.userId, users.id));

    const result = opts?.countryCode
      ? await baseQuery.where(eq(providers.countryCode, opts.countryCode)).orderBy(desc(providers.createdAt)).limit(effectiveLimit)
      : await baseQuery.orderBy(desc(providers.createdAt)).limit(effectiveLimit);

    return result.map(r => ({
      ...r.providers,
      user: r.users,
    }));
  }

  async searchProviders(opts: { q?: string; type?: string; city?: string; verifiedOnly?: boolean; approvedOnly?: boolean; countryCode?: "HU" | "IR" | null; limit?: number; offset?: number }): Promise<{ rows: ProviderWithUser[]; total: number }> {
    const _searchStart = Date.now();
    const pageLimit = Math.min(opts.limit ?? 20, 100);
    const pageOffset = opts.offset ?? 0;

    // ── Full-text search path (when a query term is present) ─────────────────
    // Uses the GIN-indexed tsvector generated column on providers plus a
    // functional index on users(first_name || last_name). Country filter is
    // pushed into the WHERE clause BEFORE ts_rank so Postgres evaluates the
    // cheap equality check first and never leaks cross-country rows.
    if (opts.q && opts.q.trim().length > 0) {
      const q = opts.q.trim();

      // Structural filter conditions (applied BEFORE ranking)
      const structConds: string[] = [];
      const params: unknown[] = [q]; // $1 = tsquery term

      // Country isolation — always first, evaluated before FTS
      if (opts.countryCode) {
        params.push(opts.countryCode);
        structConds.push(`p.country_code = $${params.length}`);
      }
      if (opts.type && opts.type !== "all") {
        params.push(opts.type);
        structConds.push(`p.provider_type = $${params.length}`);
      }
      if (opts.city) {
        params.push(`%${opts.city}%`);
        structConds.push(`(p.city ILIKE $${params.length} OR u.city ILIKE $${params.length})`);
      }
      if (opts.verifiedOnly) {
        structConds.push(`p.is_verified = true`);
      }
      if (opts.approvedOnly) {
        structConds.push(`p.status IN ('approved', 'active')`);
      }

      // FTS match condition (providers-side tsvector OR users-side name vector)
      const ftsMatch = `(
        p.search_vector @@ websearch_to_tsquery('simple', $1)
        OR to_tsvector('simple', coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')) @@ websearch_to_tsquery('simple', $1)
      )`;
      structConds.push(ftsMatch);

      const whereSQL = structConds.length > 0 ? `WHERE ${structConds.join(" AND ")}` : "";

      // ts_rank computed over providers-side vector + users name vector, combined
      const rankExpr = `ts_rank(
        coalesce(p.search_vector, ''::tsvector) ||
        to_tsvector('simple', coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')),
        websearch_to_tsquery('simple', $1)
      )`;

      // Pagination params
      params.push(pageLimit);
      const limitParam = `$${params.length}`;
      params.push(pageOffset);
      const offsetParam = `$${params.length}`;

      const dataSQL = `
        SELECT
          p.*,
          u.id            AS u_id,
          u.email         AS u_email,
          u.first_name    AS u_first_name,
          u.last_name     AS u_last_name,
          u.phone         AS u_phone,
          u.role          AS u_role,
          u.country_code  AS u_country_code,
          u.city          AS u_city,
          u.avatar_url    AS u_avatar_url,
          u.date_of_birth AS u_date_of_birth,
          u.gender        AS u_gender,
          u.language      AS u_language,
          u.is_active     AS u_is_active,
          u.created_at    AS u_created_at,
          u.updated_at    AS u_updated_at,
          ${rankExpr} AS _rank
        FROM providers p
        INNER JOIN users u ON u.id = p.user_id
        ${whereSQL}
        ORDER BY
          p.is_verified DESC,
          _rank DESC,
          p.rating DESC
        LIMIT ${limitParam} OFFSET ${offsetParam}
      `;

      // Count query uses same WHERE but no ORDER/LIMIT
      const countParams = params.slice(0, params.length - 2); // strip limit + offset
      const countSQL = `
        SELECT count(*)::int AS total
        FROM providers p
        INNER JOIN users u ON u.id = p.user_id
        ${whereSQL}
      `;

      const [dataResult, countResult] = await Promise.all([
        pool.query(dataSQL, params),
        pool.query(countSQL, countParams),
      ]);

      const total = countResult.rows[0]?.total ?? 0;
      const durationMs = Date.now() - _searchStart;
      if (durationMs > 300) {
        console.warn(`[storage] searchProviders (FTS) slow: ${durationMs}ms q="${q}" country=${opts.countryCode ?? "any"}`);
      }

      // Map raw rows → ProviderWithUser shape
      const rows: ProviderWithUser[] = dataResult.rows.map((r: any) => {
        const { u_id, u_email, u_first_name, u_last_name, u_phone, u_role,
                u_country_code, u_city, u_avatar_url, u_date_of_birth, u_gender,
                u_language, u_is_active, u_created_at, u_updated_at, _rank,
                search_vector, // strip generated column
                ...providerCols } = r;
        return {
          ...providerCols,
          user: {
            id: u_id, email: u_email, firstName: u_first_name, lastName: u_last_name,
            phone: u_phone, role: u_role, countryCode: u_country_code, city: u_city,
            avatarUrl: u_avatar_url, dateOfBirth: u_date_of_birth, gender: u_gender,
            language: u_language, isActive: u_is_active,
            createdAt: u_created_at, updatedAt: u_updated_at,
          } as any,
        };
      });

      return { rows, total };
    }

    // ── Structural filter path (no query term — type/city/verifiedOnly only) ──
    // Uses Drizzle ORM with B-tree indexes; no FTS overhead for unqualified
    // listing requests. Country isolation is still the first condition.
    const conds: any[] = [];
    if (opts.countryCode) {
      conds.push(eq(providers.countryCode, opts.countryCode));
    }
    if (opts.type && opts.type !== "all") {
      conds.push(eq(providers.providerType, opts.type));
    }
    if (opts.city) {
      conds.push(or(ilike(providers.city, `%${opts.city}%`), ilike(users.city, `%${opts.city}%`)));
    }
    if (opts.verifiedOnly) {
      conds.push(eq(providers.isVerified, true));
    }
    if (opts.approvedOnly) {
      // Uses isProviderApproved logic — see server/lib/provider-visibility.ts
      conds.push(sql`${providers.status} IN ('approved', 'active')`);
    }

    const whereClause = conds.length > 0 ? and(...conds) : undefined;
    const orderClause = [desc(providers.isVerified), desc(providers.rating), desc(providers.createdAt)];

    const baseQuery = db.select().from(providers).innerJoin(users, eq(providers.userId, users.id));
    const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(providers).innerJoin(users, eq(providers.userId, users.id));

    const [result, countResult] = await Promise.all([
      (whereClause
        ? baseQuery.where(whereClause).orderBy(...orderClause)
        : baseQuery.orderBy(...orderClause)
      ).limit(pageLimit).offset(pageOffset),
      whereClause ? countQuery.where(whereClause) : countQuery,
    ]);

    const total = countResult[0]?.count ?? 0;
    const durationMs = Date.now() - _searchStart;
    if (durationMs > 500) {
      console.warn(`[storage] searchProviders (filter) slow: ${durationMs}ms country=${opts.countryCode ?? "any"}`);
    }

    return {
      rows: result.map(r => ({ ...r.providers, user: r.users })),
      total,
    };
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

  async assignSubServicesToProvider(
    providerId: string,
    subServiceIds: string[],
  ): Promise<{ assigned: Service[]; skipped: { subServiceId: string; reason: string }[] }> {
    const assigned: Service[] = [];
    const skipped: { subServiceId: string; reason: string }[] = [];

    // Batch fetch already-linked service sub-ids for this provider (1 query)
    const existing = await db
      .select({ id: services.id, subServiceId: services.subServiceId })
      .from(services)
      .where(eq(services.providerId, providerId));
    const alreadyLinked = new Set(existing.map((r) => r.subServiceId).filter(Boolean) as string[]);

    // Batch fetch all requested sub-services in one query — avoids N getSubService() calls
    const candidateIds = subServiceIds.filter((id) => !alreadyLinked.has(id));
    const fetchedSubs = candidateIds.length > 0
      ? await db.select().from(subServices).where(inArray(subServices.id, candidateIds))
      : [];
    const subMap = new Map(fetchedSubs.map((s) => [s.id, s]));

    for (const subServiceId of subServiceIds) {
      if (alreadyLinked.has(subServiceId)) {
        skipped.push({ subServiceId, reason: "already_assigned" });
        continue;
      }
      const sub = subMap.get(subServiceId);
      if (!sub) {
        skipped.push({ subServiceId, reason: "sub_service_not_found" });
        continue;
      }
      if (sub.deletedAt || sub.isActive === false) {
        skipped.push({ subServiceId, reason: "sub_service_inactive" });
        continue;
      }
      try {
        // Fetch provider country once to set the correct native currency inline.
        const providerRecord = await db.query.providers.findFirst({ where: (p: any, { eq }: any) => eq(p.id, providerId) });
        const provCountry = (providerRecord as any)?.countryCode ?? null;
        const subSvcCurrency = nativeCurrencyForCountry(provCountry);
        const [created] = await db
          .insert(services)
          .values({
            providerId,
            subServiceId: sub.id,
            name: sub.name,
            description: sub.description ?? null,
            duration: sub.durationMinutes ?? 30,
            price: sub.basePrice ?? "0.00",
            isActive: true,
            currency: subSvcCurrency,
          } as InsertService)
          .returning();
        assigned.push(created);
        alreadyLinked.add(sub.id);
      } catch (e: any) {
        skipped.push({ subServiceId, reason: e?.message || "insert_failed" });
      }
    }
    return { assigned, skipped };
  }

  async updateService(id: string, data: Partial<InsertService>, opts?: { changedBy?: string; reason?: string }): Promise<Service | undefined> {
    const PRICE_FIELDS = ["price", "homeVisitFee", "clinicFee", "telemedicineFee", "emergencyFee", "platformFeeOverride"] as const;
    const priceChanged = PRICE_FIELDS.some(f => Object.prototype.hasOwnProperty.call(data, f));
    let prev: Service | undefined;
    if (priceChanged) {
      const [p] = await db.select().from(services).where(eq(services.id, id));
      prev = p;
    }
    const [updatedService] = await db.update(services).set({ ...data, updatedAt: new Date() } as any).where(eq(services.id, id)).returning();
    if (priceChanged && prev && updatedService) {
      const anyDelta = PRICE_FIELDS.some(f => String((prev as any)[f] ?? "") !== String((updatedService as any)[f] ?? ""));
      if (anyDelta) {
        try {
          await db.insert(servicePriceHistory).values({
            serviceId: id,
            price: updatedService.price,
            homeVisitFee: (updatedService as any).homeVisitFee ?? "0.00",
            clinicFee: (updatedService as any).clinicFee ?? "0.00",
            telemedicineFee: (updatedService as any).telemedicineFee ?? "0.00",
            emergencyFee: (updatedService as any).emergencyFee ?? "0.00",
            platformFeeOverride: (updatedService as any).platformFeeOverride ?? null,
            changedBy: opts?.changedBy ?? null,
            reason: opts?.reason ?? null,
          } as any);
        } catch (e) {
          console.error("[price-history] insert failed", e);
        }
      }
    }
    return updatedService || undefined;
  }

  async deleteService(id: string, opts?: { force?: boolean }): Promise<{ ok: true; soft: boolean } | { ok: false; reason: string; appointmentCount: number }> {
    const [appt] = await db.select({ c: sql<number>`count(*)::int` }).from(appointments).where(eq(appointments.serviceId, id));
    const apptCount = Number(appt?.c || 0);
    if (apptCount > 0 && !opts?.force) {
      await db.update(services).set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() } as any).where(eq(services.id, id));
      return { ok: true, soft: true };
    }
    if (opts?.force || apptCount === 0) {
      try {
        await db.delete(services).where(eq(services.id, id));
        return { ok: true, soft: false };
      } catch {
        await db.update(services).set({ isActive: false, deletedAt: new Date(), updatedAt: new Date() } as any).where(eq(services.id, id));
        return { ok: true, soft: true };
      }
    }
    return { ok: false, reason: "in_use", appointmentCount: apptCount };
  }

  async restoreService(id: string): Promise<Service | undefined> {
    const [s] = await db.update(services).set({ isActive: true, deletedAt: null, updatedAt: new Date() } as any).where(eq(services.id, id)).returning();
    return s || undefined;
  }

  async getServicePriceHistory(serviceId: string): Promise<any[]> {
    const rows = await db
      .select({
        id: servicePriceHistory.id,
        serviceId: servicePriceHistory.serviceId,
        price: servicePriceHistory.price,
        homeVisitFee: servicePriceHistory.homeVisitFee,
        clinicFee: servicePriceHistory.clinicFee,
        telemedicineFee: servicePriceHistory.telemedicineFee,
        emergencyFee: servicePriceHistory.emergencyFee,
        platformFeeOverride: servicePriceHistory.platformFeeOverride,
        reason: servicePriceHistory.reason,
        changedAt: servicePriceHistory.changedAt,
        changedBy: servicePriceHistory.changedBy,
        changedByFirstName: users.firstName,
        changedByLastName: users.lastName,
        changedByEmail: users.email,
        changedByRole: users.role,
      })
      .from(servicePriceHistory)
      .leftJoin(users, eq(servicePriceHistory.changedBy, users.id))
      .where(eq(servicePriceHistory.serviceId, serviceId))
      .orderBy(desc(servicePriceHistory.changedAt));
    return rows;
  }

  // Service Packages
  async getServicePackage(id: string): Promise<ServicePackageWithServices | undefined> {
    const [pkg] = await db.select().from(servicePackages).where(eq(servicePackages.id, id));
    if (!pkg) return undefined;
    const links = await db.select().from(packageServices).where(eq(packageServices.packageId, id));
    const serviceIds = links.map(l => l.serviceId);
    let pkgServices: Service[] = [];
    if (serviceIds.length) {
      pkgServices = await db.select().from(services).where(inArray(services.id, serviceIds));
    }
    return { ...pkg, services: pkgServices };
  }

  async getPackagesByProvider(providerId: string, opts?: { activeOnly?: boolean }): Promise<ServicePackageWithServices[]> {
    const conds = [eq(servicePackages.providerId, providerId)];
    if (opts?.activeOnly) conds.push(eq(servicePackages.isActive, true));
    const pkgs = await db.select().from(servicePackages).where(and(...conds)).orderBy(servicePackages.sortOrder, servicePackages.createdAt);
    if (!pkgs.length) return [];
    const pkgIds = pkgs.map(p => p.id);
    const links = await db.select().from(packageServices).where(inArray(packageServices.packageId, pkgIds));
    const serviceIds = Array.from(new Set(links.map(l => l.serviceId)));
    const allServices = serviceIds.length
      ? await db.select().from(services).where(inArray(services.id, serviceIds))
      : [];
    const svcMap = new Map(allServices.map(s => [s.id, s]));
    return pkgs.map(p => ({
      ...p,
      services: links
        .filter(l => l.packageId === p.id)
        .map(l => svcMap.get(l.serviceId))
        .filter((s): s is Service => !!s),
    }));
  }

  async createServicePackage(pkg: InsertServicePackage, serviceIds: string[]): Promise<ServicePackageWithServices> {
    const [created] = await db.insert(servicePackages).values(pkg).returning();
    if (serviceIds.length) {
      await db.insert(packageServices).values(
        serviceIds.map((serviceId, idx) => ({ packageId: created.id, serviceId, sortOrder: idx }))
      );
    }
    return (await this.getServicePackage(created.id))!;
  }

  async updateServicePackage(id: string, data: Partial<InsertServicePackage>, serviceIds?: string[]): Promise<ServicePackageWithServices | undefined> {
    const [updated] = await db.update(servicePackages)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(servicePackages.id, id))
      .returning();
    if (!updated) return undefined;
    if (serviceIds) {
      await db.delete(packageServices).where(eq(packageServices.packageId, id));
      if (serviceIds.length) {
        await db.insert(packageServices).values(
          serviceIds.map((serviceId, idx) => ({ packageId: id, serviceId, sortOrder: idx }))
        );
      }
    }
    return await this.getServicePackage(id);
  }

  async deleteServicePackage(id: string): Promise<void> {
    await db.delete(servicePackages).where(eq(servicePackages.id, id));
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

  async getPractitionerSchedule(practitionerId: string): Promise<PractitionerSchedule | undefined> {
    const [result] = await db
      .select()
      .from(practitionerSchedules)
      .where(and(
        eq(practitionerSchedules.practitionerId, practitionerId),
        eq(practitionerSchedules.isActive, true),
      ))
      .limit(1);
    return result || undefined;
  }

  async upsertPractitionerSchedule(
    practitionerId: string,
    weeklySchedule: Record<string, unknown>,
  ): Promise<PractitionerSchedule> {
    const existing = await this.getPractitionerSchedule(practitionerId);
    if (existing) {
      const [updated] = await db
        .update(practitionerSchedules)
        .set({ weeklySchedule, updatedAt: new Date() })
        .where(eq(practitionerSchedules.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(practitionerSchedules)
      .values({ practitionerId, weeklySchedule, isActive: true })
      .returning();
    return created;
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

  async getPractitionerServices(practitionerId: string): Promise<(ServicePractitioner & { service: Pick<Service, 'id' | 'name' | 'price'> })[]> {
    const results = await db
      .select()
      .from(servicePractitioners)
      .innerJoin(services, eq(servicePractitioners.serviceId, services.id))
      .where(eq(servicePractitioners.practitionerId, practitionerId));
    return results.map(r => ({
      ...r.service_practitioners,
      service: { id: r.services.id, name: r.services.name, price: r.services.price },
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
      payment: r.payments || undefined,
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
      .orderBy(desc(appointments.createdAt))
      .limit(500);

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
      .orderBy(desc(appointments.createdAt))
      .limit(500);

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

  /**
   * Lightweight: returns startTimes (HH:mm) of appointments that block a slot
   * on `date` for `providerId`. Excludes cancelled / rejected. No joins.
   */
  async getProviderBookedStartTimes(providerId: string, date: string): Promise<string[]> {
    const BLOCKING = ["pending", "approved", "confirmed", "in_progress"] as const;
    const rows = await db
      .select({ startTime: appointments.startTime })
      .from(appointments)
      .where(and(
        eq(appointments.providerId, providerId),
        eq(appointments.date, date),
        inArray(appointments.status, [...BLOCKING]),
      ));
    return rows.map(r => r.startTime).filter(Boolean) as string[];
  }

  async getProviderBookedWindows(providerId: string, date: string): Promise<Array<{startTime: string; endTime: string}>> {
    const BLOCKING = ["pending", "approved", "confirmed", "in_progress"] as const;
    const rows = await db
      .select({ startTime: appointments.startTime, endTime: appointments.endTime })
      .from(appointments)
      .where(and(
        eq(appointments.providerId, providerId),
        eq(appointments.date, date),
        inArray(appointments.status, [...BLOCKING]),
      ));
    return rows.filter(r => r.startTime && r.endTime) as Array<{startTime: string; endTime: string}>;
  }

  /**
   * Lightweight: SUM of totalAmount across completed appointments for a provider.
   * Done in SQL (single aggregate row) instead of loading every row + joins.
   */
  async getProviderRevenueTotal(providerId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<string>`COALESCE(SUM(${appointments.totalAmount}::numeric), 0)` })
      .from(appointments)
      .where(and(
        eq(appointments.providerId, providerId),
        eq(appointments.status, "completed"),
      ));
    return Number(row?.total ?? 0);
  }

  async createAppointment(appointment: InsertAppointment): Promise<Appointment> {
    // Generate unique appointment number: GL + 6-digit padded sequence
    const raw: any = await db.execute(sql`SELECT nextval('appointment_number_seq')::text AS nextval`);
    const row = Array.isArray(raw) ? raw[0] : raw?.rows?.[0];
    const nextval = row?.nextval;
    const appointmentNumber = 'GL' + String(nextval).padStart(6, '0');
    const [newAppointment] = await db.insert(appointments).values({
      ...appointment,
      appointmentNumber,
    } as any).returning();
    return newAppointment;
  }

  async updateAppointment(id: string, data: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [updatedAppointment] = await db.update(appointments).set(data).where(eq(appointments.id, id)).returning();
    return updatedAppointment || undefined;
  }

  async createAppointmentEvent(event: InsertAppointmentEvent): Promise<AppointmentEvent> {
    const [row] = await db.insert(appointmentEvents).values(event).returning();
    return row;
  }

  async getAppointmentEvents(appointmentId: string): Promise<AppointmentEventWithActor[]> {
    const rows = await db
      .select({
        event: appointmentEvents,
        actor: users,
      })
      .from(appointmentEvents)
      .leftJoin(users, eq(appointmentEvents.actorUserId, users.id))
      .where(eq(appointmentEvents.appointmentId, appointmentId))
      .orderBy(asc(appointmentEvents.createdAt));
    return rows.map(r => ({
      ...r.event,
      actorName: r.actor
        ? `${r.actor.firstName ?? ""} ${r.actor.lastName ?? ""}`.trim() || r.actor.email
        : null,
    }));
  }

  /**
   * Wraps appointment INSERT + first audit event INSERT in a single transaction
   * so the booking is never recorded without its corresponding "book" event.
   * The unique appointmentNumber is generated inside the tx using the same
   * sequence as createAppointment().
   */
  async createAppointmentWithEvent(
    appointment: InsertAppointment,
    event: Omit<InsertAppointmentEvent, "appointmentId">,
  ): Promise<{ appointment: Appointment; event: AppointmentEvent }> {
    return await db.transaction(async (tx) => {
      // Phase 11 — concurrent booking protection.
      // Acquire a transaction-scoped advisory lock keyed on provider+date+startTime
      // so two concurrent bookings for the same slot are serialised at the DB level.
      // This is a second line of defence after the route-level conflict check.
      const lockKey = `${appointment.providerId}|${appointment.date}|${appointment.startTime}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      const raw: any = await tx.execute(sql`SELECT nextval('appointment_number_seq')::text AS nextval`);
      const row = Array.isArray(raw) ? raw[0] : raw?.rows?.[0];
      const appointmentNumber = 'GL' + String(row?.nextval).padStart(6, '0');
      const [created] = await tx.insert(appointments).values({
        ...appointment,
        appointmentNumber,
      } as any).returning();
      const [ev] = await tx.insert(appointmentEvents).values({
        ...event,
        appointmentId: created.id,
      }).returning();
      return { appointment: created, event: ev };
    });
  }

  /**
   * Wraps appointment UPDATE + audit event INSERT in a single transaction so a
   * status change can never be persisted without its audit row (or vice-versa).
   * Returns undefined if the appointment row was not found.
   */
  async updateAppointmentWithEvent(
    id: string,
    data: Partial<InsertAppointment>,
    event: Omit<InsertAppointmentEvent, "appointmentId">,
  ): Promise<{ appointment: Appointment; event: AppointmentEvent } | undefined> {
    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(appointments)
        .set(data)
        .where(eq(appointments.id, id))
        .returning();
      if (!updated) return undefined as any;
      const [ev] = await tx.insert(appointmentEvents).values({
        ...event,
        appointmentId: updated.id,
      }).returning();
      return { appointment: updated, event: ev };
    });
  }

  async getAllAppointments(opts?: { limit?: number }): Promise<AppointmentWithDetails[]> {
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
      .orderBy(desc(appointments.createdAt))
      .limit(Math.min(opts?.limit ?? 500, 500));

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

  async getAppointmentListPaginated(opts?: {
    page?: number;
    limit?: number;
    countryCode?: string | null;
    userId?: string;
  }): Promise<{ rows: AppointmentWithDetails[]; total: number }> {
    const pageSize = Math.min(opts?.limit ?? 50, 500);
    const offset = ((opts?.page ?? 1) - 1) * pageSize;

    const conditions: SQL[] = [];
    if (opts?.countryCode) {
      conditions.push(eq(appointments.countryCode as any, opts.countryCode));
    }
    if (opts?.userId) {
      conditions.push(
        or(
          eq(appointments.patientId, opts.userId),
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [{ total }] = await db
      .select({ total: count() })
      .from(appointments)
      .where(where);

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
      })
      .from(appointments)
      .innerJoin(patientUsers, eq(appointments.patientId, patientUsers.id))
      .innerJoin(providers, eq(appointments.providerId, providers.id))
      .innerJoin(providerUsers, eq(providers.userId, providerUsers.id))
      .leftJoin(services, eq(appointments.serviceId, services.id))
      .leftJoin(practitioners, eq(appointments.practitionerId, practitioners.id))
      .where(where)
      .orderBy(desc(appointments.createdAt))
      .limit(pageSize)
      .offset(offset);

    const rows = result.map(r => ({
      ...r.appointments,
      patient: r.users,
      provider: {
        ...r.providers,
        user: r.users_2,
      },
      service: r.services || undefined,
      practitioner: (r.practitioners as any) || undefined,
    }));

    return { rows, total: Number(total) };
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
    // Keep provider.rating + provider.totalReviews in sync so search/sort by rating stays accurate
    try {
      await this.recomputeProviderRating(review.providerId);
    } catch (err) {
      console.error("recomputeProviderRating after createReview failed:", err);
    }
    return newReview;
  }

  async recomputeProviderRating(providerId: string): Promise<{ rating: string; totalReviews: number }> {
    const raw: any = await db.execute(
      sql`SELECT AVG(rating)::numeric(2,1) AS avg_rating, COUNT(*)::int AS total FROM reviews WHERE provider_id = ${providerId}`
    );
    const row = Array.isArray(raw) ? raw[0] : raw?.rows?.[0];
    const avg = row?.avg_rating != null ? String(row.avg_rating) : "0";
    const total = row?.total != null ? Number(row.total) : 0;
    await db.update(providers)
      .set({ rating: avg, totalReviews: total })
      .where(eq(providers.id, providerId));
    return { rating: avg, totalReviews: total };
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
    return db
      .insert(timeSlots)
      .values(slots)
      .onConflictDoNothing({
        target: [timeSlots.providerId, timeSlots.date, timeSlots.startTime],
      })
      .returning();
  }

  async deleteTimeSlotsByProviderAndDate(providerId: string, date: string): Promise<void> {
    await db.delete(timeSlots).where(and(eq(timeSlots.providerId, providerId), eq(timeSlots.date, date)));
  }

  /**
   * Safe range deletion — purges ONLY unbooked and un-held slots.
   * Booked slots (is_booked = true) and slots with an active hold in
   * appointment_slot_holds are left untouched.
   * Returns { deletedCount, preservedCount }.
   */
  async deleteSlotsByRange(
    providerId: string,
    startDate: string,
    endDate: string,
  ): Promise<{ deletedCount: number; preservedCount: number }> {
    const client = await pool.connect();
    try {
      // Count total slots in range first
      const totalRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*) AS cnt FROM time_slots
          WHERE provider_id = $1
            AND date::date >= $2::date
            AND date::date <= $3::date`,
        [providerId, startDate, endDate],
      );
      const total = Number(totalRes.rows[0]?.cnt ?? 0);

      // Delete only slots that are NOT booked and NOT actively held.
      // appointment_slot_holds tracks holds by date+start_time+end_time (no time_slot_id FK).
      const delRes = await client.query<{ cnt: string }>(
        `WITH deleted AS (
           DELETE FROM time_slots
           WHERE  provider_id = $1
             AND  date::date >= $2::date
             AND  date::date <= $3::date
             AND  is_booked = false
             AND  NOT EXISTS (
               SELECT 1 FROM appointment_slot_holds ash
               WHERE  ash.provider_id = time_slots.provider_id
                 AND  ash.date        = time_slots.date
                 AND  ash.start_time  = time_slots.start_time
                 AND  ash.end_time    = time_slots.end_time
                 AND  ash.expires_at  > NOW()
             )
           RETURNING id
         )
         SELECT COUNT(*) AS cnt FROM deleted`,
        [providerId, startDate, endDate],
      );
      const deletedCount = Number(delRes.rows[0]?.cnt ?? 0);
      const preservedCount = total - deletedCount;
      return { deletedCount, preservedCount };
    } finally {
      client.release();
    }
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

  async getAllPayments(opts?: { limit?: number }): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt)).limit(Math.min(opts?.limit ?? 500, 500));
  }

  // Refresh Tokens
  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const [t] = await db.select().from(refreshTokens).where(eq(refreshTokens.token, token));
    return t || undefined;
  }

  async getRefreshTokenByHash(hash: string): Promise<RefreshToken | undefined> {
    const [t] = await db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
    return t || undefined;
  }

  async createRefreshToken(refreshToken: InsertRefreshToken): Promise<RefreshToken> {
    const [t] = await db.insert(refreshTokens).values(refreshToken).returning();
    return t;
  }

  async deleteRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async deleteRefreshTokenByHash(hash: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, hash));
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

  async getAllAuditLogs(opts?: { limit?: number; offset?: number; action?: string; entityType?: string; countryCode?: string }): Promise<{ logs: AuditLog[]; total: number }> {
    const limit = Math.min(opts?.limit ?? 50, 200);
    const offset = opts?.offset ?? 0;
    const conditions: any[] = [];
    if (opts?.action) conditions.push(eq(auditLogs.action, opts.action as any));
    if (opts?.entityType) conditions.push(eq(auditLogs.entityType, opts.entityType));
    if (opts?.countryCode) conditions.push(eq(auditLogs.countryCode, opts.countryCode));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRow] = await db.select({ count: count() }).from(auditLogs).where(where);
    const logs = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
    return { logs, total: Number(totalRow?.count ?? 0) };
  }

  async createSystemEvent(data: InsertSystemEvent): Promise<SystemEvent> {
    const [ev] = await db.insert(systemEvents).values(data).returning();
    return ev;
  }

  async getSystemEvents(opts?: { limit?: number; offset?: number; eventType?: string; severity?: string; countryCode?: string; unresolvedOnly?: boolean }): Promise<{ events: SystemEvent[]; total: number }> {
    const limit = Math.min(opts?.limit ?? 50, 200);
    const offset = opts?.offset ?? 0;
    const conditions: any[] = [];
    if (opts?.eventType) conditions.push(eq(systemEvents.eventType, opts.eventType as any));
    if (opts?.severity) conditions.push(eq(systemEvents.severity, opts.severity as any));
    if (opts?.countryCode) conditions.push(eq(systemEvents.countryCode, opts.countryCode));
    if (opts?.unresolvedOnly) conditions.push(isNull(systemEvents.resolvedAt));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [totalRow] = await db.select({ count: count() }).from(systemEvents).where(where);
    const events = await db.select().from(systemEvents).where(where).orderBy(desc(systemEvents.createdAt)).limit(limit).offset(offset);
    return { events, total: Number(totalRow?.count ?? 0) };
  }

  async resolveSystemEvent(id: string, resolvedBy: string): Promise<SystemEvent | undefined> {
    const [ev] = await db.update(systemEvents)
      .set({ resolvedAt: new Date(), resolvedBy })
      .where(eq(systemEvents.id, id))
      .returning();
    return ev;
  }

  async getSystemEventStats(countryCode?: string): Promise<{
    totalUnresolved: number;
    bySeverity: Record<string, number>;
    byType: Record<string, number>;
    recentErrors: SystemEvent[];
  }> {
    const conditions: any[] = [isNull(systemEvents.resolvedAt)];
    if (countryCode) conditions.push(eq(systemEvents.countryCode, countryCode));
    const where = and(...conditions);
    const [totalRow] = await db.select({ count: count() }).from(systemEvents).where(where);
    const allUnresolved = await db.select().from(systemEvents).where(where).orderBy(desc(systemEvents.createdAt)).limit(200);
    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    allUnresolved.forEach((e) => {
      bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
      byType[e.eventType] = (byType[e.eventType] ?? 0) + 1;
    });
    const recentErrors = allUnresolved.filter((e) => e.severity === "error" || e.severity === "critical").slice(0, 10);
    return { totalUnresolved: Number(totalRow?.count ?? 0), bySeverity, byType, recentErrors };
  }

  async getEnhancedAnalytics(countryCode?: string): Promise<{
    newUsersLast30Days: number;
    newProvidersLast30Days: number;
    activePatients: number;
    returningPatients: number;
    retentionRate: number;
    avgAppointmentsPerPatient: number;
    refundCount: number;
    refundTotal: string;
    topProviders: Array<{ providerId: string; providerName: string; appointmentCount: number; revenue: string }>;
    bookingsByType: Array<{ visitType: string; count: number }>;
    cancelRate: number;
    providerApprovalsPending: number;
    verificationPending: number;
    growthSeries: Array<{ name: string; users: number; providers: number; bookings: number }>;
  }> {
    // Sprint 4: All queries run in parallel (Promise.all) and the 6-month
    // growth series loop (18 round-trips) is replaced with a single CTE.
    // Country filter uses parameterized $N — no string interpolation.
    //
    // IMPORTANT: All 11 queries run on a single checked-out pool client to
    // prevent pool exhaustion (pool_size=15). Using pool.query() directly
    // in Promise.all could grab up to 11 connections simultaneously.
    const cc = countryCode ?? null;
    const thirty = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninety = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const { pool } = await import("../db");
    const client = await pool.connect();

    let newUsersRes, newProvsRes, activePatientsRes, returningRes, refundRes,
        topProvRes, typeRes, cancelRes, pendingProvsRes, verifyPendingRes, growthRes;
    try {
      // Run all 11 queries sequentially on a single client (avoids pool exhaustion
      // and the pg@9 deprecation warning about concurrent queries on one client).
      newUsersRes = await client.query(
        `SELECT COUNT(*) FROM users
         WHERE role='patient' AND created_at >= $1 AND ($2::text IS NULL OR country_code::text = $2)`,
        [thirty, cc],
      );
      newProvsRes = await client.query(
        `SELECT COUNT(*) FROM providers
         WHERE created_at >= $1 AND ($2::text IS NULL OR country_code::text = $2)`,
        [thirty, cc],
      );
      activePatientsRes = await client.query(
        `SELECT COUNT(DISTINCT patient_id) FROM appointments
         WHERE created_at >= $1 AND ($2::text IS NULL OR country_code::text = $2)`,
        [ninety, cc],
      );
      returningRes = await client.query(
        `SELECT COUNT(*) FROM (
           SELECT patient_id FROM appointments
           WHERE ($1::text IS NULL OR country_code::text = $1)
           GROUP BY patient_id HAVING COUNT(*) > 1
         ) sub`,
        [cc],
      );
      refundRes = await client.query(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(amount), 0) AS total
         FROM payments
         WHERE status = 'refunded' AND ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );
      topProvRes = await client.query(
        `SELECT a.provider_id,
                COALESCE(u.first_name || ' ' || u.last_name, p.clinic_name, 'Provider') AS name,
                COUNT(a.id) AS apt_count,
                COALESCE(SUM(CASE WHEN pay.status = 'completed' THEN pay.amount::numeric ELSE 0 END), 0) AS rev
         FROM appointments a
         JOIN providers p ON p.id = a.provider_id
         LEFT JOIN users u ON u.id = p.user_id
         LEFT JOIN payments pay ON pay.appointment_id = a.id
         WHERE a.status = 'completed' AND ($1::text IS NULL OR a.country_code::text = $1)
         GROUP BY a.provider_id, name
         ORDER BY apt_count DESC LIMIT 5`,
        [cc],
      );
      typeRes = await client.query(
        `SELECT visit_type, COUNT(*) AS cnt FROM appointments
         WHERE ($1::text IS NULL OR country_code::text = $1) GROUP BY visit_type`,
        [cc],
      );
      cancelRes = await client.query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status IN ('cancelled','cancelled_by_patient','cancelled_by_provider') THEN 1 ELSE 0 END) AS cancelled
         FROM appointments WHERE ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );
      pendingProvsRes = await client.query(
        `SELECT COUNT(*) FROM providers
         WHERE status = 'pending' AND ($1::text IS NULL OR country_code::text = $1)`,
        [cc],
      );
      verifyPendingRes = await client.query(
        `SELECT COUNT(*) FROM provider_documents pd
         JOIN providers p ON p.id = pd.provider_id
         WHERE pd.verification_status = 'pending' AND ($1::text IS NULL OR p.country_code::text = $1)`,
        [cc],
      );
      growthRes = await client.query(
        `WITH months AS (
           SELECT generate_series AS month_start
           FROM generate_series(
             date_trunc('month', now() - interval '5 months'),
             date_trunc('month', now()),
             interval '1 month'
           )
         ),
         u_agg AS (
           SELECT date_trunc('month', created_at) AS m, COUNT(*) AS cnt
           FROM users
           WHERE role = 'patient' AND ($1::text IS NULL OR country_code::text = $1)
           GROUP BY 1
         ),
         p_agg AS (
           SELECT date_trunc('month', created_at) AS m, COUNT(*) AS cnt
           FROM providers
           WHERE ($1::text IS NULL OR country_code::text = $1)
           GROUP BY 1
         ),
         a_agg AS (
           SELECT date_trunc('month', created_at) AS m, COUNT(*) AS cnt
           FROM appointments
           WHERE ($1::text IS NULL OR country_code::text = $1)
           GROUP BY 1
         )
         SELECT
           to_char(months.month_start, 'Mon ''YY') AS name,
           COALESCE(u.cnt, 0)::int AS users,
           COALESCE(p.cnt, 0)::int AS providers,
           COALESCE(a.cnt, 0)::int AS bookings
         FROM months
         LEFT JOIN u_agg u ON u.m = months.month_start
         LEFT JOIN p_agg p ON p.m = months.month_start
         LEFT JOIN a_agg a ON a.m = months.month_start
         ORDER BY months.month_start`,
        [cc],
      );
    } finally {
      client.release();
    }

    const [newUsersRow] = newUsersRes.rows;
    const [newProvsRow] = newProvsRes.rows;
    const [activePatientsRow] = activePatientsRes.rows;
    const [returningRow] = returningRes.rows;
    const [refundRow] = refundRes.rows;
    const topProvRows = topProvRes.rows;
    const typeRows = typeRes.rows;
    const [cancelRow] = cancelRes.rows;
    const [pendingProvsRow] = pendingProvsRes.rows;
    const [verifyPendingRow] = verifyPendingRes.rows;
    const growthRows = growthRes.rows;

    const activePatientsNum = Number(activePatientsRow?.count ?? 0);
    const returningNum = Number(returningRow?.count ?? 0);
    const totalAppts = Number(cancelRow?.total ?? 1);
    const cancelledAppts = Number(cancelRow?.cancelled ?? 0);

    return {
      newUsersLast30Days: Number(newUsersRow?.count ?? 0),
      newProvidersLast30Days: Number(newProvsRow?.count ?? 0),
      activePatients: activePatientsNum,
      returningPatients: returningNum,
      retentionRate: activePatientsNum > 0 ? Math.round((returningNum / activePatientsNum) * 100) : 0,
      avgAppointmentsPerPatient: activePatientsNum > 0 ? Math.round((totalAppts / activePatientsNum) * 10) / 10 : 0,
      refundCount: Number(refundRow?.cnt ?? 0),
      refundTotal: Math.round(Number(refundRow?.total ?? 0) * 100) / 100,
      topProviders: topProvRows.map((r: any) => ({
        providerId: r.provider_id,
        providerName: r.name,
        appointmentCount: Number(r.apt_count),
        revenue: Math.round(Number(r.rev) * 100) / 100,
      })),
      bookingsByType: typeRows.map((r: any) => ({ visitType: r.visit_type, count: Number(r.cnt) })),
      cancelRate: totalAppts > 0 ? Math.round((cancelledAppts / totalAppts) * 1000) / 10 : 0,
      providerApprovalsPending: Number(pendingProvsRow?.count ?? 0),
      verificationPending: Number(verifyPendingRow?.count ?? 0),
      growthSeries: growthRows.map((r: any) => ({
        name: r.name,
        users: Number(r.users),
        providers: Number(r.providers),
        bookings: Number(r.bookings),
      })),
    };
  }

  async getAuditLogsByUser(userId: string, opts?: { limit?: number; offset?: number }): Promise<AuditLog[]> {
    return db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.userId, userId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(opts?.limit ?? 200, 500))
      .offset(opts?.offset ?? 0);
  }

  async getCountryMigrationHistory() {
    // One row per global-admin country migration. We left-join users twice:
    // once to fetch the latest contact info for the migrated user (their email
    // in details may be stale if they later changed it), once for the operator
    // who performed the migration.
    const rows = await db.execute(sql`
      SELECT
        al.id              AS id,
        al.created_at      AS created_at,
        al.entity_id       AS target_user_id,
        al.details         AS details,
        tu.email           AS target_email_now,
        tu.first_name      AS target_first,
        tu.last_name       AS target_last,
        al.user_id         AS performer_id,
        pu.email           AS performer_email,
        pu.first_name      AS performer_first,
        pu.last_name       AS performer_last
      FROM audit_logs al
      LEFT JOIN users tu ON tu.id = al.entity_id
      LEFT JOIN users pu ON pu.id = al.user_id
      WHERE al.entity_type = 'user_country_migration'
      ORDER BY al.created_at DESC
    `);
    const data = ((rows as any).rows ?? rows) as any[];
    return data.map((r) => {
      let parsed: any = {};
      if (typeof r.details === "string") {
        try { parsed = JSON.parse(r.details); } catch { parsed = {}; }
      } else if (r.details && typeof r.details === "object") {
        parsed = r.details;
      }
      const targetEmail = r.target_email_now || parsed.targetUserEmail || null;
      const targetName = [r.target_first, r.target_last].filter(Boolean).join(" ").trim() || null;
      const performerName = [r.performer_first, r.performer_last].filter(Boolean).join(" ").trim() || null;
      return {
        id: r.id as string,
        createdAt: r.created_at ? new Date(r.created_at) : null,
        targetUserId: (r.target_user_id ?? parsed.targetUserId ?? null) as string | null,
        targetUserEmail: targetEmail,
        targetUserName: targetName,
        fromCountry: (parsed.fromCountry ?? null) as string | null,
        toCountry: (parsed.toCountry ?? null) as string | null,
        counts: (parsed.counts ?? null) as Record<string, number> | null,
        reason: (parsed.reason ?? null) as string | null,
        performedById: (r.performer_id ?? null) as string | null,
        performedByEmail: (r.performer_email ?? null) as string | null,
        performedByName: performerName,
      };
    });
  }

  // Tenancy migration: atomically rewrite country_code on the user and every
  // tenancy-bound row that depends on them. Implemented as a single
  // transaction so a partial failure leaves nothing orphaned. We touch only
  // the tables that actually have a country_code column today.
  async migrateUserCountry(userId: string, targetCountry: string): Promise<{
    userId: string;
    fromCountry: string;
    toCountry: string;
    counts: Record<string, number>;
  }> {
    const counts: Record<string, number> = {};
    let fromCountry = "";
    await db.transaction(async (tx) => {
      const userRow = await tx.execute(sql`SELECT country_code FROM users WHERE id = ${userId} FOR UPDATE`);
      const rows = (userRow as any).rows ?? userRow;
      if (!rows || rows.length === 0) {
        throw new Error("User not found");
      }
      fromCountry = rows[0].country_code as string;
      if (fromCountry === targetCountry) {
        throw new Error("User is already in target country");
      }

      const providerRows = await tx.execute(sql`SELECT id FROM providers WHERE user_id = ${userId}`);
      const providerIds: string[] = ((providerRows as any).rows ?? providerRows).map((r: any) => r.id);
      const provIn = providerIds.length
        ? sql`(${sql.join(providerIds.map((v) => sql`${v}`), sql.raw(','))})`
        : null;

      const u = await tx.execute(sql`UPDATE users SET country_code = ${targetCountry}::country_code WHERE id = ${userId}`);
      counts.users = (u as any).rowCount ?? 0;

      if (provIn) {
        const p = await tx.execute(sql`UPDATE providers SET country_code = ${targetCountry}::country_code WHERE id IN ${provIn}`);
        counts.providers = (p as any).rowCount ?? 0;
        const s = await tx.execute(sql`UPDATE services SET country_code = ${targetCountry}::country_code WHERE provider_id IN ${provIn}`);
        counts.services = (s as any).rowCount ?? 0;
        const sr = await tx.execute(sql`UPDATE service_requests SET country_code = ${targetCountry}::country_code WHERE provider_id IN ${provIn}`);
        counts.service_requests = (sr as any).rowCount ?? 0;
      } else {
        counts.providers = 0;
        counts.services = 0;
        counts.service_requests = 0;
      }

      // Appointments: as patient OR as provider.
      const apptWhereClauses: any[] = [sql`patient_id = ${userId}`];
      if (provIn) apptWhereClauses.push(sql`provider_id IN ${provIn}`);
      const apptWhere = sql.join(apptWhereClauses, sql.raw(' OR '));
      const a = await tx.execute(sql`UPDATE appointments SET country_code = ${targetCountry}::country_code WHERE ${apptWhere}`);
      counts.appointments = (a as any).rowCount ?? 0;

      // Invoices & payments: by patient (covers everything they owe/have paid).
      const inv = await tx.execute(sql`UPDATE invoices SET country_code = ${targetCountry}::country_code WHERE patient_id = ${userId}`);
      counts.invoices = (inv as any).rowCount ?? 0;
      const pay = await tx.execute(sql`UPDATE payments SET country_code = ${targetCountry}::country_code WHERE patient_id = ${userId}`);
      counts.payments = (pay as any).rowCount ?? 0;

      // Group session participations the user owns (the sessions themselves
      // are tenanted by the provider, so we don't touch group_sessions here).
      const gsp = await tx.execute(sql`UPDATE group_session_participants SET country_code = ${targetCountry}::country_code WHERE user_id = ${userId}`);
      counts.groupSessionParticipants = (gsp as any).rowCount ?? 0;
    });

    return { userId, fromCountry, toCountry: targetCountry, counts };
  }

  // group sessions methods — see storage/group-sessions.mixin.ts
  // ─────────────────────────────────────────────────────────────────────────
  // Provider earnings & payouts
  // Idempotent: relies on unique(appointment_id) so duplicate calls are no-ops.
  // ─────────────────────────────────────────────────────────────────────────
  async recordProviderEarning(appointmentId: string): Promise<ProviderEarning | null> {
    const existing = await db.select().from(providerEarnings)
      .where(eq(providerEarnings.appointmentId, appointmentId)).limit(1);
    if (existing.length > 0) return existing[0];

    const [appt] = await db.select().from(appointments)
      .where(eq(appointments.id, appointmentId)).limit(1);
    if (!appt) return null;
    if (appt.status !== "completed") return null;

    const payment = await this.getPaymentByAppointment(appointmentId);
    if (!payment || payment.status !== "completed") return null;

    const totalAmount = parseFloat(appt.totalAmount || "0");
    const taxAmount = parseFloat((appt as any).taxAmount || "0");
    const countryCode = (appt as any).countryCode || "HU";
    const currency = countryCurrency(countryCode as CountryCode);

    // C21.0 — Contractual payout split: read provider's fee_split_ratio.
    // If set (0–1 inclusive), it supersedes the appointment-level platformFeeAmount
    // for the purposes of the provider earning and platform commission split.
    // The legacy platformFeeAmount is preserved on the appointment row unchanged.
    let feeSplitRatio: number | null = null;
    try {
      const splitRes = await pool.query(`SELECT fee_split_ratio FROM providers WHERE id = $1`, [appt.providerId]);
      const raw = splitRes.rows[0]?.fee_split_ratio;
      if (raw !== null && raw !== undefined) {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) feeSplitRatio = parsed;
      }
    } catch { /* non-fatal — fall back to legacy platformFee */ }

    // Sprint RX-01: Use RevenueEngine snapshot for accurate provider earnings.
    // PRIMARY: pricingBreakdown JSONB is in the Drizzle schema so db.select() always returns it.
    //          It contains providerEarnings and commissionAmount in booking currency (HUF/IRR/USD).
    // SUPPLEMENT: Direct pool.query for provider_earnings_snapshot / commission_amount columns
    //             (added via startup migration, NOT in Drizzle schema — db.select() never returns them).
    // FALLBACK: fee_split_ratio / platformFeeAmount legacy path.
    const _pb = (appt as any).pricingBreakdown as any;
    let reProviderEarnings = _pb?.providerEarnings != null ? Number(_pb.providerEarnings) : 0;
    let reCommissionAmount  = _pb?.commissionAmount != null ? Number(_pb.commissionAmount) : 0;
    try {
      const _sn = await pool.query(
        `SELECT
           COALESCE(provider_earnings_snapshot::numeric, 0) AS pe,
           COALESCE(commission_amount::numeric, 0)          AS ca
         FROM appointments WHERE id = $1`,
        [appointmentId],
      );
      const _pe = Number(_sn.rows[0]?.pe ?? 0);
      const _ca = Number(_sn.rows[0]?.ca ?? 0);
      if (_pe > 0) { reProviderEarnings = _pe; reCommissionAmount = _ca; }
    } catch (_snErr: any) { /* non-fatal — proceed with pricingBreakdown values */ }

    let platformFee: number;
    let providerEarning: number;
    if (reProviderEarnings > 0) {
      // RX-01 path: use the immutable RevenueEngine snapshot
      providerEarning = reProviderEarnings;
      platformFee     = reCommissionAmount > 0 ? reCommissionAmount : Math.max(0, totalAmount - providerEarning);
    } else if (feeSplitRatio !== null) {
      // Contractual split: provider gets feeSplitRatio fraction of totalAmount
      providerEarning = Math.max(0, totalAmount * feeSplitRatio);
      platformFee     = Math.max(0, totalAmount - providerEarning);
    } else {
      platformFee     = parseFloat(appt.platformFeeAmount || "0");
      providerEarning = Math.max(0, totalAmount - platformFee);
    }

    // P-FINAL ARCHITECTURE: appointment.total_amount and provider_earnings_snapshot are stored
    // in bookingCurrency (native HUF/IRR/USD). The revenue engine output is in bookingCurrency;
    // finalTotalUsd is the only USD field. Convert to USD here for canonical earnings storage.
    // For USD providers the conversion is a no-op (rateVal=1).
    const _rates = await getRates();
    const rateVal = _rates[currency] ?? 1;
    // exchangeRate stored for audit/display reference only: 1 / rate_from_usd = USD_per_local_unit
    const exchangeRate = parseFloat((1 / rateVal).toFixed(6));
    const isNativeBooking = currency !== "USD";
    const _toUSD = (v: number) =>
      isNativeBooking ? parseFloat((v / rateVal).toFixed(2)) : v;
    const totalAmountUSD     = _toUSD(totalAmount);
    const platformFeeUSD     = _toUSD(platformFee);
    const providerEarningUSD = _toUSD(providerEarning);
    // displayAmount: local-currency equivalent of the USD provider earning (for display)
    const displayAmountLocal = parseFloat((providerEarningUSD * rateVal).toFixed(2));

    let created: ProviderEarning;
    try {
      const [row] = await db.insert(providerEarnings).values({
        providerId: appt.providerId,
        appointmentId: appt.id,
        totalAmount: totalAmountUSD.toFixed(2),
        platformFee: platformFeeUSD.toFixed(2),
        providerEarning: providerEarningUSD.toFixed(2),
        status: "pending",
        displayCurrency: currency,
        displayAmount: displayAmountLocal.toFixed(2),
        exchangeRateUsed: exchangeRate.toString(),
      } as any).returning();
      created = row;
    } catch (err: any) {
      // Race condition: another concurrent call inserted first.
      const pgCode = err?.code ?? err?.cause?.code;
      if (pgCode === "23505") {
        const [row] = await db.select().from(providerEarnings)
          .where(eq(providerEarnings.appointmentId, appointmentId)).limit(1);
        return row || null;
      }
      throw err;
    }

    // ── Wallet + Ledger ──────────────────────────────────────────────────────
    // All wallet amounts stored in USD (canonical currency).
    try {
      // Upsert wallet: credit available_balance + lifetime_earnings in USD
      await pool.query(`
        INSERT INTO provider_wallets (provider_id, available_balance, lifetime_earnings, currency, country_code)
        VALUES ($1, $2, $2, 'USD', $3)
        ON CONFLICT (provider_id) DO UPDATE SET
          available_balance = provider_wallets.available_balance + $2,
          lifetime_earnings = provider_wallets.lifetime_earnings + $2,
          updated_at = NOW()
      `, [appt.providerId, providerEarningUSD, countryCode]);

      // Get new balance for snapshot
      const walletRes = await pool.query(`SELECT available_balance FROM provider_wallets WHERE provider_id = $1`, [appt.providerId]);
      const balAfter = Number(walletRes.rows[0]?.available_balance ?? 0);

      // Ledger: booking income (net provider earning, stored in USD)
      await pool.query(`
        INSERT INTO provider_ledger (provider_id, amount, entry_type, reference_id, description, balance_after, country_code)
        VALUES ($1, $2, 'booking_income', $3, $4, $5, $6)
      `, [appt.providerId, providerEarningUSD, appointmentId, `Booking income — appt #${(appt as any).appointmentNumber || appointmentId.slice(0,8)} (USD)`, balAfter, countryCode]);

      // Ledger: platform fee (informational, negative, USD)
      if (platformFeeUSD > 0) {
        await pool.query(`
          INSERT INTO provider_ledger (provider_id, amount, entry_type, reference_id, description, balance_after, country_code)
          VALUES ($1, $2, 'platform_fee_deduction', $3, $4, $5, $6)
        `, [appt.providerId, -platformFeeUSD, appointmentId, `Platform fee deducted — ${platformFeeUSD.toFixed(2)} USD`, balAfter, countryCode]);
      }

      // Ledger: tax (informational, negative, USD)
      if (taxAmount > 0) {
        await pool.query(`
          INSERT INTO provider_ledger (provider_id, amount, entry_type, reference_id, description, balance_after, country_code)
          VALUES ($1, $2, 'tax_deduction', $3, $4, $5, $6)
        `, [appt.providerId, -taxAmount, appointmentId, `Tax on appointment — ${taxAmount.toFixed(2)} USD`, balAfter, countryCode]);
      }
    } catch (wErr: any) {
      console.warn("[recordProviderEarning] wallet/ledger update failed (non-fatal):", wErr?.message);
    }

    return created;
  }

  async getProviderEarnings(providerId: string): Promise<ProviderEarning[]> {
    return db.select().from(providerEarnings)
      .where(eq(providerEarnings.providerId, providerId))
      .orderBy(desc(providerEarnings.createdAt));
  }

  async getAllProviderEarnings(): Promise<Array<ProviderEarning & { providerName?: string; appointmentNumber?: string | null }>> {
    const rows = await db
      .select({
        earning: providerEarnings,
        providerFirstName: users.firstName,
        providerLastName: users.lastName,
        appointmentNumber: appointments.appointmentNumber,
      })
      .from(providerEarnings)
      .leftJoin(providers, eq(providers.id, providerEarnings.providerId))
      .leftJoin(users, eq(users.id, providers.userId))
      .leftJoin(appointments, eq(appointments.id, providerEarnings.appointmentId))
      .orderBy(desc(providerEarnings.createdAt));

    return rows.map((r) => ({
      ...r.earning,
      providerName: [r.providerFirstName, r.providerLastName].filter(Boolean).join(" ") || undefined,
      appointmentNumber: r.appointmentNumber ?? null,
    }));
  }

  async getProviderEarningById(id: string): Promise<ProviderEarning | undefined> {
    const [row] = await db.select().from(providerEarnings)
      .where(eq(providerEarnings.id, id)).limit(1);
    return row;
  }

  async markEarningPaid(id: string, paidByUserId: string, payoutReference?: string): Promise<ProviderEarning | undefined> {
    const [updated] = await db.update(providerEarnings)
      .set({
        status: "paid",
        paidAt: new Date(),
        paidByUserId,
        payoutReference: payoutReference ?? null,
      })
      .where(eq(providerEarnings.id, id))
      .returning();

    if (updated) {
      const providerEarningAmt = parseFloat(updated.providerEarning || "0");
      try {
        await pool.query(`
          UPDATE provider_wallets SET
            available_balance = GREATEST(0, available_balance - $2),
            updated_at = NOW()
          WHERE provider_id = $1
        `, [updated.providerId, providerEarningAmt]);

        const walletRes = await pool.query(`SELECT available_balance FROM provider_wallets WHERE provider_id = $1`, [updated.providerId]);
        const balAfter = Number(walletRes.rows[0]?.available_balance ?? 0);

        await pool.query(`
          INSERT INTO provider_ledger (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
          SELECT $1, $2, 'payout_deduction', pe.appointment_id::text,
                 'Earning marked as paid by admin' || CASE WHEN $3 IS NOT NULL THEN ' (ref: ' || $3 || ')' ELSE '' END,
                 $4, $5, COALESCE(p.country_code, 'HU')
          FROM provider_earnings pe
          JOIN providers p ON p.id = pe.provider_id
          WHERE pe.id = $6
        `, [updated.providerId, -providerEarningAmt, payoutReference ?? null, paidByUserId, balAfter, id]);
      } catch (wErr: any) {
        console.warn("[markEarningPaid] wallet/ledger update failed (non-fatal):", wErr?.message);
      }
    }

    return updated;
  }

  async getEarningsSummary(providerId?: string): Promise<{
    totalEarnings: string;
    pendingAmount: string;
    paidAmount: string;
    platformRevenue: string;
    count: number;
  }> {
    const rows = providerId
      ? await db.select().from(providerEarnings).where(eq(providerEarnings.providerId, providerId))
      : await db.select().from(providerEarnings);

    let totalEarnings = 0;
    let pendingAmount = 0;
    let paidAmount = 0;
    let platformRevenue = 0;
    for (const r of rows) {
      const earn = parseFloat(r.providerEarning || "0");
      const fee = parseFloat(r.platformFee || "0");
      totalEarnings += earn;
      platformRevenue += fee;
      if (r.status === "paid") paidAmount += earn;
      else pendingAmount += earn;
    }
    return {
      totalEarnings: Math.round(totalEarnings * 100) / 100,
      pendingAmount: Math.round(pendingAmount * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      platformRevenue: Math.round(platformRevenue * 100) / 100,
      count: rows.length,
    };
  }

  // Find-or-create a time slot for an exact provider/date/time and atomically
  // mark it as booked. If the slot is already booked, throws.
  //
  // Sprint C20.0 — Optimistic Concurrency Control (OCC):
  //   Three-layer defence against microsecond races:
  //   L1 — pg_advisory_xact_lock: serialises all reservations for the same key at DB level
  //   L2 — SELECT FOR UPDATE: additional row-level lock inside the advisory lock window
  //   L3 — version-guarded UPDATE: if another session already incremented `version` between
  //        our SELECT and our UPDATE, the WHERE clause returns 0 rows → we throw and the
  //        appointment route catches it as a 409 Conflict.
  async reserveTimeSlot(providerId: string, date: string, startTime: string, endTime: string): Promise<TimeSlot> {
    return await db.transaction(async (tx) => {
      // L1: Advisory lock — serialises concurrent tx for the same provider/date/slot.
      const lockKey = `${providerId}|${date}|${startTime}`;
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);

      // L2+OCC: Raw SQL SELECT so we can read `version` (not in Drizzle schema),
      // combined with FOR UPDATE for row-level locking.
      const sel = await tx.execute(sql`
        SELECT id,
               provider_id          AS "providerId",
               date,
               start_time           AS "startTime",
               end_time             AS "endTime",
               is_booked            AS "isBooked",
               is_blocked           AS "isBlocked",
               COALESCE(version, 1) AS version
        FROM time_slots
        WHERE provider_id = ${providerId}
          AND date        = ${date}
          AND start_time  = ${startTime}
        FOR UPDATE
        LIMIT 1
      `);
      const rows = sel.rows as Array<{
        id: string; providerId: string; date: string; startTime: string; endTime: string;
        isBooked: boolean; isBlocked: boolean; version: number;
      }>;

      if (rows.length > 0) {
        const row = rows[0];
        if (row.isBlocked) throw new Error("This time slot is unavailable.");
        if (row.isBooked) {
          // is_booked=true could be a stale flag left over from a cancellation
          // where the slot-release step failed silently. Verify against live appointments
          // before rejecting — if no active appointment exists, auto-heal the flag.
          const activeCheck = await tx.execute(sql`
            SELECT id FROM appointments
            WHERE provider_id = ${providerId}
              AND date = ${date}
              AND start_time = ${startTime}
              AND status IN ('pending', 'approved', 'confirmed', 'in_progress')
            LIMIT 1
          `);
          if ((activeCheck.rows as any[]).length > 0) {
            throw new Error("This time slot is already booked.");
          }
          // Stale flag — log and allow the booking to proceed (the UPDATE below
          // will atomically set is_booked=true again via version-guarded write).
          console.warn(`[slots] Auto-healing stale is_booked for provider ${providerId} on ${date} at ${startTime} (slot ${row.id})`);
        }

        // L3 — OCC: version-guarded UPDATE.
        // If `version` was incremented by another session since we read it, 0 rows
        // are affected → we abort with a 409-friendly error.
        const upd = await tx.execute(sql`
          UPDATE time_slots
          SET    is_booked = true,
                 version   = version + 1
          WHERE  id      = ${row.id}
            AND  version = ${row.version}
          RETURNING
            id,
            provider_id AS "providerId",
            date,
            start_time  AS "startTime",
            end_time    AS "endTime",
            is_booked   AS "isBooked",
            is_blocked  AS "isBlocked"
        `);
        if ((upd.rows as any[]).length === 0) {
          throw new Error("This time slot was just reserved by another patient. Please choose a different time.");
        }
        return (upd.rows as any[])[0] as TimeSlot;
      }

      // Slot row does not exist yet — INSERT atomically with version = 1.
      try {
        const ins = await tx.execute(sql`
          INSERT INTO time_slots
            (provider_id, date, start_time, end_time, is_booked, is_blocked, version)
          VALUES
            (${providerId}, ${date}, ${startTime}, ${endTime}, true, false, 1)
          RETURNING
            id,
            provider_id AS "providerId",
            date,
            start_time  AS "startTime",
            end_time    AS "endTime",
            is_booked   AS "isBooked",
            is_blocked  AS "isBlocked"
        `);
        return (ins.rows as any[])[0] as TimeSlot;
      } catch (err: any) {
        // Unique constraint violation: another transaction inserted the same slot
        // between our advisory lock and our insert (should be near-impossible but
        // we keep the safety net).
        const pgCode = err?.code ?? err?.cause?.code;
        if (pgCode === "23505") {
          throw new Error("This time slot is already booked.");
        }
        throw err;
      }
    });
  }

  async listProviderTimeOff(providerId: string): Promise<ProviderTimeOff[]> {
    return await db
      .select()
      .from(providerTimeOff)
      .where(eq(providerTimeOff.providerId, providerId))
      .orderBy(desc(providerTimeOff.startDate));
  }

  async createProviderTimeOff(data: InsertProviderTimeOff): Promise<ProviderTimeOff> {
    const [created] = await db.insert(providerTimeOff).values(data).returning();
    return created;
  }

  async deleteProviderTimeOff(id: string, providerId: string): Promise<boolean> {
    const result = await db
      .delete(providerTimeOff)
      .where(and(eq(providerTimeOff.id, id), eq(providerTimeOff.providerId, providerId)))
      .returning({ id: providerTimeOff.id });
    return result.length > 0;
  }

  async isProviderOnTimeOff(providerId: string, date: string): Promise<ProviderTimeOff | null> {
    const rows = await db
      .select()
      .from(providerTimeOff)
      .where(and(
        eq(providerTimeOff.providerId, providerId),
        lte(providerTimeOff.startDate, date),
        gte(providerTimeOff.endDate, date),
      ))
      .limit(1);
    return rows[0] || null;
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
        .values({ userId, balance: "0.00", currency: "USD" })
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
          .values({ userId: args.userId, balance: "0.00", currency: "USD" })
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

  // ──────────── Overdue invoice reminders ────────────

  async getInvoiceById(id: string): Promise<Invoice | undefined> {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    return row;
  }

  async getOverdueInvoicesNeedingReminder(opts: { cooldownDays?: number; limit?: number } = {}): Promise<Invoice[]> {
    const cooldownDays = opts.cooldownDays ?? 7;
    const limit = opts.limit ?? 100;
    const cooldownCutoff = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const rows = await db
      .select()
      .from(invoices)
      .where(and(
        sql`${invoices.status} <> 'paid'`,
        lt(invoices.dueDate, now),
        or(
          isNull(invoices.lastReminderAt),
          lt(invoices.lastReminderAt, cooldownCutoff),
        ),
      ))
      .orderBy(asc(invoices.dueDate))
      .limit(limit);
    return rows;
  }

  async markInvoiceReminderSent(invoiceId: string): Promise<void> {
    await db.update(invoices)
      .set({
        lastReminderAt: new Date(),
        reminderCount: sql`${invoices.reminderCount} + 1`,
      })
      .where(eq(invoices.id, invoiceId));
  }

  // ──────────── Referrals ────────────

  // 8-char base32 (Crockford) — easy to read, no I/L/O/U.
  private generateReferralCode(): string {
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let s = "";
    for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
    return s;
  }

  async getOrCreateReferralCode(userId: string): Promise<string> {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error("User not found");
    if (user.referralCode) return user.referralCode;
    // Try a few times to dodge the (extremely unlikely) collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = this.generateReferralCode();
      try {
        await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
        return code;
      } catch {
        // unique-violation — try again
      }
    }
    throw new Error("Could not generate referral code");
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    if (!code) return undefined;
    const [row] = await db.select().from(users).where(eq(users.referralCode, code.trim().toUpperCase()));
    return row;
  }

  async createReferral(data: InsertReferral): Promise<Referral> {
    const [row] = await db.insert(referrals).values(data as any).returning();
    return row;
  }

  async getReferralByReferredUser(referredUserId: string): Promise<Referral | undefined> {
    const [row] = await db.select().from(referrals).where(eq(referrals.referredUserId, referredUserId));
    return row;
  }

  async getReferralsByReferrer(referrerUserId: string): Promise<Referral[]> {
    return db.select().from(referrals)
      .where(eq(referrals.referrerUserId, referrerUserId))
      .orderBy(desc(referrals.createdAt));
  }

  async qualifyReferral(referredUserId: string, opts: {
    appointmentId: string;
    rewardAmount: number;
    rewardCurrency: string;
  }): Promise<Referral | undefined> {
    const existing = await this.getReferralByReferredUser(referredUserId);
    if (!existing || existing.status !== "pending") return existing;
    const [updated] = await db.update(referrals)
      .set({
        status: "qualified",
        rewardAmount: opts.rewardAmount.toFixed(2) as any,
        rewardCurrency: opts.rewardCurrency,
        qualifyingAppointmentId: opts.appointmentId,
        qualifiedAt: new Date(),
      })
      .where(and(eq(referrals.id, existing.id), eq(referrals.status, "pending")))
      .returning();
    return updated || existing;
  }

  async getReferralLeaderboard(limit = 25): Promise<Array<{
    userId: string; firstName: string | null; lastName: string | null; email: string;
    qualifiedCount: number; pendingCount: number; totalCredits: number; currency: string;
  }>> {
    // Aggregate in SQL for speed; one row per referrer.
    const rows = await db.execute(sql`
      SELECT
        r.referrer_user_id AS user_id,
        u.first_name,
        u.last_name,
        u.email,
        COUNT(*) FILTER (WHERE r.status = 'qualified')::int AS qualified_count,
        COUNT(*) FILTER (WHERE r.status = 'pending')::int   AS pending_count,
        COALESCE(SUM(CASE WHEN r.status = 'qualified' THEN r.reward_amount ELSE 0 END), 0)::float AS total_credits,
        COALESCE(MAX(r.reward_currency), 'USD') AS currency
      FROM referrals r
      JOIN users u ON u.id = r.referrer_user_id
      GROUP BY r.referrer_user_id, u.first_name, u.last_name, u.email
      ORDER BY qualified_count DESC, total_credits DESC
      LIMIT ${limit}
    `);
    // Drizzle returns either { rows } or the array directly depending on driver.
    const arr = (rows as any).rows ?? (rows as any);
    return arr.map((r: any) => ({
      userId: r.user_id,
      firstName: r.first_name,
      lastName: r.last_name,
      email: r.email,
      qualifiedCount: Number(r.qualified_count) || 0,
      pendingCount: Number(r.pending_count) || 0,
      totalCredits: Number(r.total_credits) || 0,
      currency: r.currency || "USD",
    }));
  }

  // ──────────── Waitlist ────────────

  async createWaitlistEntry(data: InsertWaitlistEntry): Promise<WaitlistEntry> {
    const [row] = await db.insert(waitlistEntries).values(data).returning();
    return row;
  }

  async getWaitlistEntry(id: string): Promise<WaitlistEntry | undefined> {
    const [row] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.id, id));
    return row;
  }

  async getWaitlistEntriesByPatient(patientId: string): Promise<WaitlistEntry[]> {
    return db.select().from(waitlistEntries)
      .where(eq(waitlistEntries.patientId, patientId))
      .orderBy(desc(waitlistEntries.createdAt));
  }

  async getActiveWaitlistEntries(opts: {
    providerId: string; date: string; slotStartTime?: string; limit?: number;
  }): Promise<WaitlistEntry[]> {
    const conds: any[] = [
      eq(waitlistEntries.providerId, opts.providerId),
      eq(waitlistEntries.status, "active"),
      // Either entry has no preferred date OR matches this date.
      or(isNull(waitlistEntries.preferredDate), eq(waitlistEntries.preferredDate, opts.date)),
    ];
    // If we have a specific slot time, narrow further. Entries that didn't
    // express a window match anything; entries with a window must contain it.
    if (opts.slotStartTime) {
      conds.push(or(
        isNull(waitlistEntries.preferredStartTime),
        sql`${waitlistEntries.preferredStartTime} <= ${opts.slotStartTime}`,
      ));
      conds.push(or(
        isNull(waitlistEntries.preferredEndTime),
        sql`${waitlistEntries.preferredEndTime} >= ${opts.slotStartTime}`,
      ));
    }
    return db.select().from(waitlistEntries)
      .where(and(...conds))
      .orderBy(asc(waitlistEntries.createdAt))
      .limit(opts.limit ?? 5);
  }

  async updateWaitlistEntry(id: string, data: Partial<WaitlistEntry>): Promise<WaitlistEntry | undefined> {
    const [row] = await db.update(waitlistEntries).set(data).where(eq(waitlistEntries.id, id)).returning();
    return row;
  }

  async cancelPatientActiveWaitlistEntries(patientId: string, providerId: string): Promise<number> {
    const result = await db.update(waitlistEntries)
      .set({ status: "cancelled" } as any)
      .where(and(
        eq(waitlistEntries.patientId, patientId),
        eq(waitlistEntries.providerId, providerId),
        eq(waitlistEntries.status, "active"),
      ))
      .returning({ id: waitlistEntries.id });
    return result.length;
  }

  // ── Patient Documents ────────────────────────────────────────────────────────
  async createPatientDocument(data: InsertPatientDocument): Promise<PatientDocument> {
    const [row] = await db.insert(patientDocuments).values(data).returning();
    return row;
  }

  async getPatientDocument(id: string): Promise<PatientDocument | undefined> {
    const [row] = await db.select().from(patientDocuments).where(eq(patientDocuments.id, id));
    return row;
  }

  async getPatientDocuments(patientId: string, documentType?: string): Promise<PatientDocument[]> {
    const conds: any[] = [eq(patientDocuments.patientId, patientId)];
    if (documentType) conds.push(eq(patientDocuments.documentType, documentType));
    return db.select().from(patientDocuments)
      .where(and(...conds))
      .orderBy(desc(patientDocuments.createdAt));
  }

  async updatePatientDocument(id: string, data: Partial<PatientDocument>): Promise<PatientDocument | undefined> {
    const [row] = await db.update(patientDocuments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(patientDocuments.id, id))
      .returning();
    return row;
  }

  async deletePatientDocument(id: string): Promise<void> {
    await db.delete(patientDocuments).where(eq(patientDocuments.id, id));
  }

  async getPatientDocumentsSharedWithProvider(patientId: string, providerId: string): Promise<PatientDocument[]> {
    return db.select().from(patientDocuments)
      .where(and(
        eq(patientDocuments.patientId, patientId),
        sql`${providerId} = ANY(${patientDocuments.sharedWithProviderIds})`,
      ))
      .orderBy(desc(patientDocuments.createdAt));
  }

  async getAllPatientDocuments(opts?: { countryCode?: string; limit?: number; offset?: number }): Promise<PatientDocument[]> {
    const conds: any[] = [];
    if (opts?.countryCode) conds.push(eq(patientDocuments.countryCode, opts.countryCode));
    return db.select().from(patientDocuments)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(patientDocuments.createdAt))
      .limit(opts?.limit ?? 50)
      .offset(opts?.offset ?? 0);
  }

  // provider media methods — see storage/provider-media.mixin.ts
  // packages methods — see storage/packages.mixin.ts
  // ── RBAC ─────────────────────────────────────────────────────────────────────
  async getAdminRoles(): Promise<AdminRole[]> {
    return db.select().from(adminRoles).orderBy(asc(adminRoles.name));
  }

  async getAdminRoleByName(name: string): Promise<AdminRole | undefined> {
    const [row] = await db.select().from(adminRoles)
      .where(eq(adminRoles.name, name)).limit(1);
    return row;
  }

  async createAdminRole(data: InsertAdminRole): Promise<AdminRole> {
    const [row] = await db.insert(adminRoles).values(data).returning();
    return row;
  }

  async getAllPermissions(): Promise<RbacPermission[]> {
    return db.select().from(rbacPermissions).orderBy(asc(rbacPermissions.module), asc(rbacPermissions.action));
  }

  async getRolePermissions(roleId: string): Promise<string[]> {
    const rows = await db.select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, roleId));
    return rows.map(r => r.key);
  }

  async getAdminAssignments(filters: { userId?: string; isActive?: boolean } = {}): Promise<AdminAssignment[]> {
    const conditions = [];
    if (filters.userId) conditions.push(eq(adminAssignments.userId, filters.userId));
    if (filters.isActive !== undefined) conditions.push(eq(adminAssignments.isActive, filters.isActive));
    const q = db.select().from(adminAssignments);
    return conditions.length > 0
      ? q.where(and(...conditions)).orderBy(desc(adminAssignments.createdAt))
      : q.orderBy(desc(adminAssignments.createdAt));
  }

  async getAdminAssignment(id: string): Promise<AdminAssignment | undefined> {
    const [row] = await db.select().from(adminAssignments)
      .where(eq(adminAssignments.id, id)).limit(1);
    return row;
  }

  async createAdminAssignment(data: InsertAdminAssignment): Promise<AdminAssignment> {
    const [row] = await db.insert(adminAssignments).values(data).returning();
    return row;
  }

  async updateAdminAssignment(id: string, data: Partial<InsertAdminAssignment>): Promise<AdminAssignment | undefined> {
    const [row] = await db.update(adminAssignments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminAssignments.id, id))
      .returning();
    return row;
  }

  async deleteAdminAssignment(id: string): Promise<void> {
    await db.delete(adminAssignments).where(eq(adminAssignments.id, id));
  }

  async getAdminUsersWithRoles(): Promise<any[]> {
    const result = await db.execute(sql`
      SELECT
        u.id, u.email, u.first_name, u.last_name, u.role, u.country_code,
        u.is_suspended, u.last_login_at, u.created_at,
        aa.id AS assignment_id, aa.is_active AS assignment_active,
        aa.country_code AS assignment_country, aa.expires_at, aa.notes,
        ar.id AS role_id, ar.name AS role_name, ar.display_name AS role_display_name
      FROM users u
      LEFT JOIN admin_assignments aa ON aa.user_id = u.id AND aa.is_active = true
      LEFT JOIN admin_roles ar ON ar.id = aa.role_id
      WHERE u.role IN ('admin','global_admin','country_admin')
      ORDER BY u.created_at DESC
    `);
    return result.rows as any[];
  }

  // ── Provider Buffer Settings ─────────────────────────────────────────────────
  async getProviderBufferSettings(
    providerId: string,
    practitionerId?: string | null,
  ): Promise<ProviderBufferSettings | undefined> {
    if (practitionerId) {
      const rows = await db.select().from(providerBufferSettings)
        .where(and(
          eq(providerBufferSettings.providerId, providerId),
          eq(providerBufferSettings.practitionerId, practitionerId),
        )).limit(1);
      if (rows[0]) return rows[0];
    }
    const rows = await db.select().from(providerBufferSettings)
      .where(and(
        eq(providerBufferSettings.providerId, providerId),
        isNull(providerBufferSettings.practitionerId),
      )).limit(1);
    return rows[0];
  }

  async upsertProviderBufferSettings(
    providerId: string,
    data: Partial<InsertProviderBufferSettings>,
    practitionerId?: string | null,
  ): Promise<ProviderBufferSettings> {
    const existing = await this.getProviderBufferSettings(providerId, practitionerId);
    if (existing) {
      const [updated] = await db.update(providerBufferSettings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(providerBufferSettings.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(providerBufferSettings)
      .values({
        providerId,
        practitionerId: practitionerId ?? null,
        clinicBufferBefore: data.clinicBufferBefore ?? 0,
        clinicBufferAfter: data.clinicBufferAfter ?? 0,
        homeBufferBefore: data.homeBufferBefore ?? 15,
        homeBufferAfter: data.homeBufferAfter ?? 15,
        onlineBufferBefore: data.onlineBufferBefore ?? 0,
        onlineBufferAfter: data.onlineBufferAfter ?? 0,
        travelRadiusKm: data.travelRadiusKm ?? "0.00",
      })
      .returning();
    return created;
  }

  // ── Provider Blocks ──────────────────────────────────────────────────────────
  async getProviderBlocks(
    providerId: string,
    practitionerId?: string | null,
  ): Promise<ProviderBlock[]> {
    const conditions = [eq(providerBlocks.providerId, providerId)];
    if (practitionerId) {
      conditions.push(eq(providerBlocks.practitionerId, practitionerId));
    }
    return db.select().from(providerBlocks)
      .where(and(...conditions))
      .orderBy(desc(providerBlocks.startDatetime));
  }

  async getProviderBlock(id: string): Promise<ProviderBlock | undefined> {
    const [row] = await db.select().from(providerBlocks)
      .where(eq(providerBlocks.id, id)).limit(1);
    return row;
  }

  async createProviderBlock(data: InsertProviderBlock): Promise<ProviderBlock> {
    const [row] = await db.insert(providerBlocks).values(data).returning();
    return row;
  }

  async updateProviderBlock(
    id: string,
    data: Partial<InsertProviderBlock>,
  ): Promise<ProviderBlock | undefined> {
    const [row] = await db.update(providerBlocks)
      .set(data)
      .where(eq(providerBlocks.id, id))
      .returning();
    return row;
  }

  async deleteProviderBlock(id: string): Promise<void> {
    await db.delete(providerBlocks).where(eq(providerBlocks.id, id));
  }

  // ── Slot Holds ───────────────────────────────────────────────────────────────
  async createSlotHold(data: InsertAppointmentSlotHold): Promise<AppointmentSlotHold> {
    const [row] = await db.insert(appointmentSlotHolds).values(data).returning();
    return row;
  }

  async getSlotHold(id: string): Promise<AppointmentSlotHold | undefined> {
    const [row] = await db.select().from(appointmentSlotHolds)
      .where(eq(appointmentSlotHolds.id, id)).limit(1);
    return row;
  }

  async deleteSlotHold(id: string): Promise<void> {
    await db.delete(appointmentSlotHolds).where(eq(appointmentSlotHolds.id, id));
  }

  async deleteExpiredSlotHolds(): Promise<number> {
    const result = await db.delete(appointmentSlotHolds)
      .where(lt(appointmentSlotHolds.expiresAt, new Date()))
      .returning({ id: appointmentSlotHolds.id });
    return result.length;
  }

  async deletePatientSlotHolds(
    patientId: string,
    providerId: string,
    date: string,
  ): Promise<void> {
    await db.delete(appointmentSlotHolds)
      .where(and(
        eq(appointmentSlotHolds.patientId, patientId),
        eq(appointmentSlotHolds.providerId, providerId),
        eq(appointmentSlotHolds.date, date),
      ));
  }

  // ── DB-backed idempotency ─────────────────────────────────────────────────
  // ── Provider Wallet & Ledger ───────────────────────────────────────────────
  async getOrCreateProviderWallet(providerId: string): Promise<ProviderWallet> {
    const existing = await db.select().from(providerWallets)
      .where(eq(providerWallets.providerId, providerId)).limit(1);
    if (existing[0]) return existing[0];

    // Get country from provider record
    const res = await pool.query(`SELECT country_code FROM providers WHERE id = $1`, [providerId]);
    const countryCode = (res.rows[0]?.country_code || "HU") as any;

    // All provider wallet balances are stored in USD canonical currency.
    const [created] = await db.insert(providerWallets).values({
      providerId,
      availableBalance: "0.00",
      pendingBalance: "0.00",
      heldBalance: "0.00",
      lifetimeEarnings: "0.00",
      currency: "USD",
      isFrozen: false,
      countryCode,
    }).returning();
    return created;
  }

  async updateProviderWalletBalance(providerId: string, delta: { available?: number; held?: number; pending?: number; lifetime?: number }): Promise<void> {
    const parts: string[] = ["updated_at = NOW()"];
    if (delta.available !== undefined) {
      parts.push(`available_balance = GREATEST(0, available_balance + ${delta.available})`);
    }
    if (delta.held !== undefined) {
      parts.push(`held_balance = GREATEST(0, held_balance + ${delta.held})`);
    }
    if (delta.pending !== undefined) {
      parts.push(`pending_balance = GREATEST(0, pending_balance + ${delta.pending})`);
    }
    if (delta.lifetime !== undefined) {
      parts.push(`lifetime_earnings = GREATEST(0, lifetime_earnings + ${delta.lifetime})`);
    }
    await pool.query(
      `UPDATE provider_wallets SET ${parts.join(", ")} WHERE provider_id = $1`,
      [providerId],
    );
  }

  async addProviderLedgerEntry(entry: InsertProviderLedger): Promise<ProviderLedger> {
    const [row] = await db.insert(providerLedger).values(entry).returning();
    return row;
  }

  async getProviderLedger(providerId: string, limit = 50, offset = 0): Promise<ProviderLedger[]> {
    return db.select().from(providerLedger)
      .where(eq(providerLedger.providerId, providerId))
      .orderBy(desc(providerLedger.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async adjustProviderWallet(providerId: string, amount: number, entryType: string, description: string, actorId: string, referenceId?: string): Promise<ProviderWallet> {
    // Ensure wallet exists
    await this.getOrCreateProviderWallet(providerId);

    // Update balance (positive = credit, negative = debit)
    await pool.query(`
      UPDATE provider_wallets SET
        available_balance = GREATEST(0, available_balance + $2),
        updated_at = NOW()
      WHERE provider_id = $1
    `, [providerId, amount]);

    const walletRes = await pool.query(`SELECT * FROM provider_wallets WHERE provider_id = $1`, [providerId]);
    const wallet = walletRes.rows[0];

    // Ledger entry
    await pool.query(`
      INSERT INTO provider_ledger (provider_id, amount, entry_type, reference_id, description, actor_id, balance_after, country_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [providerId, amount, entryType, referenceId ?? null, description, actorId, wallet.available_balance, wallet.country_code]);

    const [updated] = await db.select().from(providerWallets)
      .where(eq(providerWallets.providerId, providerId)).limit(1);
    return updated;
  }

  async freezeProviderWallet(providerId: string, frozen: boolean, reason?: string): Promise<ProviderWallet | undefined> {
    const [updated] = await db.update(providerWallets)
      .set({ isFrozen: frozen, frozenReason: frozen ? (reason ?? null) : null, updatedAt: new Date() })
      .where(eq(providerWallets.providerId, providerId))
      .returning();
    return updated;
  }

  // ── Bug Reports ──────────────────────────────────────────────────────────────
  async createBugReport(data: InsertBugReport): Promise<BugReport> {
    const result = await pool.query<BugReport>(`
      INSERT INTO bug_reports
        (country_code, reported_by_user_id, reporter_role, title, description, steps_to_reproduce,
         category, severity, priority, status, page_url, browser_info, device_info, correlation_id,
         screenshot_url, screenshot_public_id, include_diagnostics)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'new',$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        (data as any).countryCode ?? 'HU',
        data.reportedByUserId,
        (data as any).reporterRole ?? null,
        data.title,
        data.description,
        (data as any).stepsToReproduce ?? null,
        data.category ?? 'bug',
        data.severity ?? 'medium',
        data.priority ?? 'medium',
        (data as any).pageUrl ?? null,
        (data as any).browserInfo ?? null,
        (data as any).deviceInfo ?? null,
        (data as any).correlationId ?? null,
        (data as any).screenshotUrl ?? null,
        (data as any).screenshotPublicId ?? null,
        (data as any).includeDiagnostics ?? false,
      ],
    );
    return result.rows[0];
  }

  async getBugReport(id: string): Promise<BugReport | undefined> {
    const result = await pool.query(`SELECT * FROM bug_reports WHERE id = $1 AND soft_deleted = false`, [id]);
    return result.rows[0];
  }

  async getBugReportsByUser(userId: string, opts?: { limit?: number; offset?: number }): Promise<{ reports: BugReport[]; total: number }> {
    const limit = Math.min(opts?.limit ?? 20, 100);
    const offset = opts?.offset ?? 0;
    const [rows, countRes] = await Promise.all([
      pool.query(`SELECT * FROM bug_reports WHERE reported_by_user_id = $1 AND soft_deleted = false ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM bug_reports WHERE reported_by_user_id = $1 AND soft_deleted = false`, [userId]),
    ]);
    return { reports: rows.rows, total: parseInt(countRes.rows[0].count) };
  }

  async getAdminBugReports(opts: {
    countryCode?: string | null;
    status?: string;
    severity?: string;
    priority?: string;
    category?: string;
    assignedTo?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ reports: BugReport[]; total: number }> {
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;
    const conditions: string[] = ["br.soft_deleted = false"];
    const params: any[] = [];
    let pi = 1;

    if (opts.countryCode) { conditions.push(`br.country_code = $${pi++}`); params.push(opts.countryCode); }
    if (opts.status)      { conditions.push(`br.status = $${pi++}`); params.push(opts.status); }
    if (opts.severity)    { conditions.push(`br.severity = $${pi++}`); params.push(opts.severity); }
    if (opts.priority)    { conditions.push(`br.priority = $${pi++}`); params.push(opts.priority); }
    if (opts.category)    { conditions.push(`br.category = $${pi++}`); params.push(opts.category); }
    if (opts.assignedTo)  { conditions.push(`br.assigned_to = $${pi++}`); params.push(opts.assignedTo); }
    if (opts.dateFrom)    { conditions.push(`br.created_at >= $${pi++}`); params.push(opts.dateFrom); }
    if (opts.dateTo)      { conditions.push(`br.created_at <= $${pi++}`); params.push(opts.dateTo); }
    if (opts.search)      {
      conditions.push(`(br.title ILIKE $${pi} OR br.description ILIKE $${pi})`);
      params.push(`%${opts.search}%`); pi++;
    }

    const where = conditions.join(" AND ");
    const baseQuery = `
      SELECT br.*,
        u.first_name || ' ' || u.last_name AS reporter_name,
        u.email AS reporter_email,
        a.first_name || ' ' || a.last_name AS assignee_name
      FROM bug_reports br
      LEFT JOIN users u ON u.id = br.reported_by_user_id
      LEFT JOIN users a ON a.id = br.assigned_to
      WHERE ${where}`;

    const [rows, countRes] = await Promise.all([
      pool.query(`${baseQuery} ORDER BY br.last_activity_at DESC LIMIT $${pi} OFFSET $${pi+1}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM bug_reports br WHERE ${where}`, params),
    ]);
    return { reports: rows.rows, total: parseInt(countRes.rows[0].count) };
  }

  async updateBugReport(id: string, data: Partial<BugReport>): Promise<BugReport | undefined> {
    const sets: string[] = ["updated_at = NOW()", "last_activity_at = NOW()"];
    const params: any[] = [];
    let pi = 1;
    const fieldMap: Record<string, string> = {
      status: "status", priority: "priority", severity: "severity", assignedTo: "assigned_to",
      resolutionNotes: "resolution_notes", adminNotes: "admin_notes",
      resolvedAt: "resolved_at", closedAt: "closed_at", softDeleted: "soft_deleted",
    };
    for (const [key, col] of Object.entries(fieldMap)) {
      if ((data as any)[key] !== undefined) {
        sets.push(`${col} = $${pi++}`);
        params.push((data as any)[key]);
      }
    }
    params.push(id);
    const result = await pool.query(`UPDATE bug_reports SET ${sets.join(", ")} WHERE id = $${pi} RETURNING *`, params);
    return result.rows[0];
  }

  async createBugReportComment(data: InsertBugReportComment): Promise<BugReportComment> {
    const result = await pool.query<BugReportComment>(`
      INSERT INTO bug_report_comments (bug_report_id, user_id, role, message, attachment_url)
      VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [data.bugReportId, data.userId, (data as any).role ?? null, data.message, (data as any).attachmentUrl ?? null],
    );
    // Bump last_activity_at on parent
    await pool.query(`UPDATE bug_reports SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1`, [data.bugReportId]);
    return result.rows[0];
  }

  async getBugReportComments(bugReportId: string): Promise<BugReportComment[]> {
    const result = await pool.query(`
      SELECT c.*, u.first_name || ' ' || u.last_name AS author_name, u.avatar_url AS author_avatar
      FROM bug_report_comments c
      LEFT JOIN users u ON u.id = c.user_id
      WHERE c.bug_report_id = $1
      ORDER BY c.created_at ASC`,
      [bugReportId],
    );
    return result.rows;
  }

  async checkIdempotencyKey(key: string, scope: string): Promise<{ status: number; body: any } | null> {
    const result = await pool.query<{ status: number; response_body: any }>(
      `SELECT status, response_body FROM idempotency_keys
       WHERE key = $1 AND scope = $2 AND expires_at > NOW()`,
      [key, scope],
    );
    if (!result.rows[0]) return null;
    return { status: result.rows[0].status, body: result.rows[0].response_body };
  }

  async setIdempotencyKey(key: string, scope: string, userId: string, status: number, body: any, expiresAtMs: number): Promise<void> {
    const expiresAt = new Date(expiresAtMs);
    await pool.query(
      `INSERT INTO idempotency_keys (key, scope, user_id, status, response_body, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key, scope) DO UPDATE
         SET response_body = EXCLUDED.response_body,
             expires_at    = EXCLUDED.expires_at`,
      [key, scope, userId, status, JSON.stringify(body), expiresAt],
    );
    // Opportunistic cleanup: prune expired keys (fire-and-forget, no await)
    pool.query(`DELETE FROM idempotency_keys WHERE expires_at < NOW()`).catch(() => {});
  }
}

export const storage = new DatabaseStorage();

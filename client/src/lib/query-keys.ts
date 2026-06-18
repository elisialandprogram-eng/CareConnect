export const QK = {
  // Auth & user
  authMe: () => ["/api/auth/me"] as const,
  user: () => ["/api/user"] as const,

  // Providers (public)
  providers: () => ["/api/providers"] as const,
  providerMe: () => ["/api/provider/me"] as const,
  providerCredentials: () => ["/api/provider/credentials"] as const,
  providerGallery: () => ["/api/provider/gallery"] as const,
  providerWallet: () => ["/api/provider/wallet"] as const,
  providerWalletLedger: () => ["/api/provider/wallet/ledger"] as const,
  providerGroupSessions: () => ["/api/provider/group-sessions"] as const,
  providerAppointments: () => ["/api/appointments/provider"] as const,
  patientNotes: (patientId?: string) =>
    patientId
      ? (["/api/provider/patient-notes", patientId] as const)
      : (["/api/provider/patient-notes"] as const),

  // Appointments
  appointments: () => ["/api/appointments"] as const,
  appointment: (id: string) => ["/api/appointments", id] as const,
  appointmentEvents: (id: string) => ["/api/appointments", id, "events"] as const,
  patientAppointments: () => ["/api/appointments/patient"] as const,

  // Wallet
  wallet: () => ["/api/wallet"] as const,
  walletTransactions: () => ["/api/wallet/transactions"] as const,

  // Notifications
  notifications: () => ["/api/notifications"] as const,
  notificationsUnreadCount: () => ["/api/notifications/unread-count"] as const,
  notificationPreferences: () => ["/api/notification-preferences"] as const,
  commsCapabilities: () => ["/api/comms/capabilities"] as const,

  // Chat / Messages
  conversations: () => ["/api/chat/conversations-rich"] as const,
  chatMessages: (id?: string | null) =>
    id ? (["/api/chat/messages", id] as const) : (["/api/chat/messages"] as const),

  // Family
  familyMembers: () => ["/api/family-members"] as const,

  // Support & bugs
  supportTickets: () => ["/api/support/tickets"] as const,
  supportTicket: (id: string) => ["/api/support/tickets", id] as const,
  myBugReports: () => ["/api/bug-reports/me"] as const,

  // Packages
  packages: () => ["/api/packages"] as const,
  myPackages: () => ["/api/packages/my"] as const,

  // Patient data
  patientDocuments: (type?: string) =>
    type ? (["/api/patient/documents", type] as const) : (["/api/patient/documents"] as const),
  patientGallery: () => ["/api/patient/gallery"] as const,
  patientPrescriptions: (patientId?: string) =>
    patientId
      ? (["/api/prescriptions/patient", patientId] as const)
      : (["/api/prescriptions/patient"] as const),
  savedProviders: () => ["/api/saved-providers"] as const,
  myInvoices: () => ["/api/invoices/me"] as const,

  // Group sessions
  groupSessions: () => ["/api/group-sessions"] as const,
  myGroupSessions: () => ["/api/me/group-sessions"] as const,

  // Sub-services & catalogue
  subServices: () => ["/api/sub-services"] as const,
  adminSubServices: () => ["/api/admin/sub-services"] as const,

  // Admin — providers
  adminProviders: () => ["/api/admin/providers"] as const,
  adminProvider: (id: string) => ["/api/admin/providers", id] as const,
  adminProviderStats: (id: string) => ["/api/admin/providers", id, "stats"] as const,
  adminProviderServices: (id: string) => ["/api/admin/providers", id, "services"] as const,
  adminProviderDocs: (id: string) => ["/api/admin/providers", id, "documents"] as const,
  adminPractitioners: () => ["/api/admin/practitioners"] as const,
  adminCategoryPerms: (providerId: string) =>
    [`/api/admin/providers/${providerId}/category-permissions`] as const,
  adminOfficeHours: (providerId: string) =>
    [`/api/admin/providers/${providerId}/office-hours`] as const,

  // Admin — users & RBAC
  adminUsers: () => ["/api/admin/users"] as const,
  adminAdminUsers: () => ["/api/admin/admin-users"] as const,
  rbacRoles: () => ["/api/rbac/roles"] as const,
  adminRbacAuditLog: () => ["/api/admin/rbac/audit-log"] as const,

  // Admin — operations
  adminAnalytics: () => ["/api/admin/analytics"] as const,
  adminBookings: () => ["/api/admin/bookings"] as const,
  adminWallets: () => ["/api/admin/wallets"] as const,
  adminDisputes: (status?: string) =>
    status ? ["/api/admin/disputes", status] : ["/api/admin/disputes"],
  adminProviderDocuments: (status?: string) =>
    status ? ["/api/admin/provider-documents", status] : ["/api/admin/provider-documents"],
  adminFaqs: () => ["/api/admin/faqs"] as const,
  adminPromos: () => ["/api/admin/promo-codes"] as const,
  adminPackages: () => ["/api/admin/packages"] as const,
  adminServiceRequests: () => ["/api/admin/service-requests"] as const,
  adminServicePendingChanges: () => ["/api/admin/services/pending-changes"] as const,
  adminServicesOverview: () => ["/api/admin/services-overview"] as const,
  adminSupportTickets: () => ["/api/admin/support-tickets"] as const,
  adminBugReports: (params?: string) =>
    params ? ["/api/admin/bug-reports", params] : ["/api/admin/bug-reports"],
  messages: () => ["/api/messages"] as const,

  // Admin — monitoring & system
  adminMonitoringStats: () => ["/api/admin/monitoring/stats"] as const,
  adminDiagnostics: () => ["/api/admin/diagnostics"] as const,
  adminNotifications: () => ["/api/admin/notifications"] as const,
  adminBroadcasts: () => ["/api/admin/broadcasts"] as const,
  adminSettings: () => ["/api/admin/settings"] as const,
  adminRetentionPolicy: () => ["/api/admin/retention-policy"] as const,
  adminPayoutRequests: (status?: string) =>
    status ? ["/api/admin/payout-requests", status] : ["/api/admin/payout-requests"],
  adminPrivacyRequests: () => ["/api/admin/privacy-requests"] as const,
  adminTitleRequests: () => ["/api/admin/title-requests"] as const,
  adminStaleBookings: (days?: number) =>
    days ? ["/api/admin/stale-bookings", { days }] : ["/api/admin/stale-bookings"],
  adminProviderCredentials: () => ["/api/admin/provider-credentials"] as const,
  adminTaxSettings: () => ["/api/admin/tax-settings"] as const,
  adminInvoices: () => ["/api/admin/invoices"] as const,
  adminAuditLogs: (filters?: Record<string, unknown>) =>
    filters ? ["/api/admin/audit-logs", filters] : ["/api/admin/audit-logs"],
  adminEarnings: () => ["/api/admin/earnings"] as const,
  adminDocumentQueue: () => ["/api/admin/document-queue"] as const,
  adminFinancialAlerts: (status?: string, severity?: string) =>
    ["/api/admin/financial/alerts", status, severity] as const,
  adminFinancialHealth: () => ["/api/admin/health/financial"] as const,

  // Provider dashboard extras
  providerAnalytics: () => ["/api/provider/analytics"] as const,
  providerInsights: () => ["/api/provider/insights"] as const,
  providerPackages: () => ["/api/provider/packages"] as const,
  providerServices: () => ["/api/provider/services"] as const,
  providerAvailability: () => ["/api/provider/availability"] as const,
  providerEarnings: () => ["/api/provider/earnings"] as const,
  providerSlots: (providerId: string, date: string, practitionerId?: string) =>
    practitionerId
      ? ["/api/providers", providerId, "slots", date, practitionerId]
      : ["/api/providers", providerId, "slots", date],
  provider: (id: string) => ["/api/providers", id] as const,
  providerReviews: (id: string) => ["/api/providers", id, "reviews"] as const,
  providerSlotsByDate: (providerId: string, date: string) =>
    ["/api/providers", providerId, "slots", date] as const,
  servicePractitioners: (serviceId?: string) =>
    serviceId ? ["/api/services", serviceId, "practitioners"] : ["/api/services", "practitioners"],
  providerBySearch: (q: string) => ["/api/providers", { q }] as const,

  // Patient / booking extras
  pricingQuote: (serviceId?: string, visitType?: string, sessions?: number, promo?: string, practId?: string) =>
    ["/api/pricing/quote", serviceId, visitType, sessions, promo, practId] as const,
  consents: () => ["/api/consents"] as const,
  giftCards: () => ["/api/gift-cards/mine"] as const,
  waitlist: () => ["/api/waitlist/me"] as const,
  bugReport: (id: string) => ["/api/bug-reports", id] as const,
  myBugReportsPaged: (page: number) => ["/api/bug-reports/my", page] as const,
  medicalHistory: (patientId: string) => ["/api/medical-history/patient", patientId] as const,
  familyMemberAppointments: (id: string) => [`/api/family-members/${id}/appointments`] as const,
  familyMemberDocuments: (id: string) => [`/api/family-members/${id}/documents`] as const,
  familyMemberConsents: (id: string) => [`/api/family-members/${id}/consents`] as const,
  userPackageUsage: (pkgId: string) => [`/api/user-packages/${pkgId}/usage`] as const,

  // Provider public profile extras (by provider id)
  providerGalleryById: (id: string) => [`/api/providers/${id}/gallery`] as const,
  providerReviewsById: (id: string) => [`/api/providers/${id}/reviews`] as const,
  providerPackagesById: (id: string) => [`/api/providers/${id}/packages`] as const,

  // Public listings
  categories: () => ["/api/categories"] as const,
  browseServices: () => ["/api/browse/services"] as const,
  referrals: () => ["/api/referrals/me"] as const,
  reviews: () => ["/api/reviews"] as const,
  myReviews: () => ["/api/reviews/mine"] as const,
  providerPublicCredentials: (id: string) => ["/api/providers", id, "credentials"] as const,
  providerMyCategories: () => ["/api/provider/my-categories"] as const,
  providerSearch: (type: string, q: string, location: string, verifiedOnly: boolean, page: number) =>
    ["/api/providers", type, q, location, verifiedOnly, page] as const,
  adminWalletById: (id: string) => ["/api/admin/wallets", id] as const,
  adminWalletTransactions: (id: string) => ["/api/admin/wallets", id, "transactions"] as const,
  adminBookingsByUser: (id: string) => ["/api/admin/bookings", id] as const,
  walletById: (id: string) => ["/api/wallet", id] as const,
  auditLogPaged: (filters: Record<string, unknown>) => ["/api/admin/audit-logs", filters] as const,
} as const;

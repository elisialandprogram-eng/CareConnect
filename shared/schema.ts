import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, boolean, timestamp, pgEnum, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userRoleEnum = pgEnum("user_role", ["patient", "provider", "admin"]);
export const providerTypeEnum = pgEnum("provider_type", ["physiotherapist", "doctor", "nurse"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["pending", "approved", "confirmed", "completed", "cancelled", "rejected", "rescheduled"]);
export const visitTypeEnum = pgEnum("visit_type", ["online", "home", "clinic"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "refunded", "failed"]);
export const paymentMethodEnum = pgEnum("payment_method", ["card", "crypto", "cash", "bank_transfer"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["open", "in_progress", "resolved", "closed"]);
export const ticketPriorityEnum = pgEnum("ticket_priority", ["low", "medium", "high", "urgent"]);
export const auditActionEnum = pgEnum("audit_action", ["create", "update", "delete", "login", "logout", "view", "export"]);
export const contentTypeEnum = pgEnum("content_type", ["homepage", "about", "terms", "privacy", "faq", "blog"]);
export const announcementTypeEnum = pgEnum("announcement_type", ["info", "warning", "success", "error"]);
export const medicalHistoryTypeEnum = pgEnum("medical_history_type", ["diagnosis", "procedure", "lab_result", "vaccination", "allergy"]);

// Tables
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  mobileNumber: text("mobile_number"),
  role: userRoleEnum("role").notNull().default("patient"),
  avatarUrl: text("avatar_url"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  gender: text("gender"),
  socialNumber: text("social_number"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  bloodGroup: text("blood_group"),
  knownAllergies: text("known_allergies"),
  medicalConditions: text("medical_conditions"),
  currentMedications: text("current_medications"),
  pastSurgeries: text("past_surgeries"),
  googleCalendarId: text("google_calendar_id"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  isEmailVerified: boolean("is_email_verified").notNull().default(false),
  isSuspended: boolean("is_suspended").notNull().default(false),
  suspensionReason: text("suspension_reason"),
  emailOtpHash: text("email_otp_hash"),
  emailOtpExpiresAt: timestamp("email_otp_expires_at"),
  otpAttempts: integer("otp_attempts").notNull().default(0),
  lastOtpSentAt: timestamp("last_otp_sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const providers = pgTable("providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  providerType: text("provider_type").notNull().default("doctor"),
  professionalTitle: text("professional_title"),
  specialization: text("specialization").notNull(),
  secondarySpecialties: text("secondary_specialties").array().notNull().default(sql`'{}'::text[]`),
  bio: text("bio"),
  yearsExperience: integer("years_experience").default(0),
  education: text("education"),
  certifications: text("certifications").array().notNull().default(sql`'{}'::text[]`),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  licenseNumber: text("license_number"),
  licensingAuthority: text("licensing_authority"),
  licenseExpiryDate: timestamp("license_expiry_date"),
  licenseDocumentUrl: text("license_document_url"),
  nationalProviderId: text("national_provider_id"),
  qualifications: text("qualifications"),
  availableDays: text("available_days").array().notNull().default(sql`'{}'::text[]`),
  availableTimeSlots: text("available_time_slots").array().notNull().default(sql`'{}'::text[]`),
  workingHoursStart: text("working_hours_start").default("09:00"),
  workingHoursEnd: text("working_hours_end").default("18:00"),
  maxPatientsPerDay: integer("max_patients_per_day"),
  timezone: text("timezone"),
  primaryServiceLocation: text("primary_service_location"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  serviceRadiusKm: integer("service_radius_km"),
  multipleServiceAreas: boolean("multiple_service_areas").default(false),
  googleMapsLocation: text("google_maps_location"),
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }).notNull(),
  homeVisitFee: decimal("home_visit_fee", { precision: 10, scale: 2 }),
  telemedicineFee: decimal("telemedicine_fee", { precision: 10, scale: 2 }),
  emergencyCareFee: decimal("emergency_care_fee", { precision: 10, scale: 2 }),
  insuranceAccepted: text("insurance_accepted").array().notNull().default(sql`'{}'::text[]`),
  currency: text("currency").default("USD"),
  paymentMethods: text("payment_methods").array().notNull().default(sql`'{}'::text[]`),
  backgroundCheckStatus: text("background_check_status").default("pending"),
  identityVerificationStatus: text("identity_verification_status").default("pending"),
  malpracticeCoverage: text("malpractice_coverage"),
  complianceApprovalStatus: text("compliance_approval_status").default("pending"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  preferredContactMethod: text("preferred_contact_method"),
  providerAgreementAccepted: boolean("provider_agreement_accepted").default(false),
  dataProcessingAgreementAccepted: boolean("data_processing_agreement_accepted").default(false),
  telemedicineAgreementAccepted: boolean("telemedicine_agreement_accepted").default(false),
  codeOfConductAccepted: boolean("code_of_conduct_accepted").default(false),
  affiliatedHospital: text("affiliated_hospital"),
  onCallAvailability: boolean("on_call_availability").default(false),
  emergencyContact: text("emergency_contact"),
  internalNotes: text("internal_notes"),
  isVerified: boolean("is_verified").default(false),
  isActive: boolean("is_active").default(true),
  status: text("status").notNull().default("pending"),
  startDate: timestamp("start_date").defaultNow(),
  endDate: timestamp("end_date"),
  rating: decimal("rating", { precision: 2, scale: 1 }).default("0"),
  totalReviews: integer("total_reviews").default(0),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  gallery: text("gallery").array().notNull().default(sql`'{}'::text[]`),
  practitionerData: text("practitioner_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const serviceCategories = pgTable("service_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  icon: text("icon"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subServices = pgTable("sub_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: providerTypeEnum("category").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).default("0.00"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  unq: sql`UNIQUE(${table.name}, ${table.category})`
}));

export const services = pgTable("services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  subServiceId: varchar("sub_service_id").references(() => subServices.id),
  name: text("name").notNull(),
  description: text("description"),
  duration: integer("duration").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  adminPriceOverride: decimal("admin_price_override", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const practitioners = pgTable("practitioners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  title: text("title"),
  specialization: text("specialization"),
  bio: text("bio"),
  languages: text("languages").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const servicePractitioners = pgTable("service_practitioners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serviceId: varchar("service_id").notNull().references(() => services.id),
  practitionerId: varchar("practitioner_id").notNull().references(() => practitioners.id),
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const timeSlots = pgTable("time_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isBooked: boolean("is_booked").default(false),
  isBlocked: boolean("is_blocked").default(false),
});

export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  serviceId: varchar("service_id").references(() => services.id),
  practitionerId: varchar("practitioner_id").references(() => practitioners.id),
  timeSlotId: varchar("time_slot_id").references(() => timeSlots.id),
  date: text("date").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  visitType: visitTypeEnum("visit_type").notNull(),
  status: appointmentStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  patientAddress: text("patient_address"),
  contactPerson: text("contact_person"),
  contactMobile: text("contact_mobile"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  googleCalendarEventId: text("google_calendar_event_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("USD"),
  paymentMethod: text("payment_method").notNull().default("card"),
  status: paymentStatusEnum("status").notNull().default("pending"),
  stripePaymentId: text("stripe_payment_id"),
  stripeSessionId: text("stripe_session_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => users.id),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const promoCodes = pgTable("promo_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  description: text("description"),
  discountType: text("discount_type").notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").default(0),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until").notNull(),
  isActive: boolean("is_active").default(true),
  applicableProviders: text("applicable_providers").array(),
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const providerPricingOverrides = pgTable("provider_pricing_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  consultationFee: decimal("consultation_fee", { precision: 10, scale: 2 }),
  homeVisitFee: decimal("home_visit_fee", { precision: 10, scale: 2 }),
  discountPercentage: decimal("discount_percentage", { precision: 5, scale: 2 }),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  action: auditActionEnum("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: varchar("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const supportTickets = pgTable("support_tickets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  assignedTo: varchar("assigned_to").references(() => users.id),
  name: text("name"),
  mobileNumber: text("mobile_number"),
  location: text("location"),
  subject: text("subject").notNull(),
  description: text("description").notNull(),
  status: ticketStatusEnum("status").notNull().default("open"),
  priority: ticketPriorityEnum("priority").notNull().default("medium"),
  category: text("category"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
});

export const ticketMessages = pgTable("ticket_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ticketId: varchar("ticket_id").notNull().references(() => supportTickets.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isInternal: boolean("is_internal").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const contentBlocks = pgTable("content_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  contentType: contentTypeEnum("content_type").notNull(),
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const faqs = pgTable("faqs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  category: text("category"),
  sortOrder: integer("sort_order").default(0),
  isPublished: boolean("is_published").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const blogPosts = pgTable("blog_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  authorId: varchar("author_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  excerpt: text("excerpt"),
  content: text("content").notNull(),
  featuredImage: text("featured_image"),
  tags: text("tags").array(),
  isPublished: boolean("is_published").default(false),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const announcements = pgTable("announcements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: announcementTypeEnum("type").notNull().default("info"),
  targetAudience: text("target_audience").default("all"),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const emailTemplates = pgTable("email_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  variables: text("variables").array(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const notificationQueue = pgTable("notification_queue", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  category: text("category").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  country: text("country").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dailyMetrics = pgTable("daily_metrics", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull().unique(),
  newUsers: integer("new_users").default(0),
  newProviders: integer("new_providers").default(0),
  totalAppointments: integer("total_appointments").default(0),
  completedAppointments: integer("completed_appointments").default(0),
  revenue: decimal("revenue", { precision: 12, scale: 2 }).default("0.00"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const prescriptions = pgTable("prescriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  appointmentId: varchar("appointment_id").notNull().references(() => appointments.id),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  medicationName: text("medication_name").notNull(),
  dosage: text("dosage").notNull(),
  frequency: text("frequency").notNull(),
  duration: text("duration").notNull(),
  instructions: text("instructions"),
  attachments: text("attachments").array(),
  issuedAt: timestamp("issued_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").default(true),
});

export const medicalHistory = pgTable("medical_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => users.id),
  providerId: varchar("provider_id").references(() => providers.id),
  type: medicalHistoryTypeEnum("type").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: timestamp("date").notNull(),
  attachments: text("attachments").array(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userNotifications = pgTable("user_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  type: text("type"),
  data: text("data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const realtimeConversations = pgTable("realtime_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  participant1Id: varchar("participant1_id").notNull().references(() => users.id),
  participant2Id: varchar("participant2_id").notNull().references(() => users.id),
  lastMessage: text("last_message"),
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const realtimeMessages = pgTable("realtime_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => realtimeConversations.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const taxSettings = pgTable("tax_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  country: text("country").notNull(),
  taxName: text("tax_name").notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
});

export const patientConsents = pgTable("patient_consents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  consentType: text("consent_type").notNull(),
  isAccepted: boolean("is_accepted").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  acceptedAt: timestamp("accepted_at").defaultNow(),
});

export const medicalPractitioners = pgTable("medical_practitioners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => providers.id),
  name: text("name").notNull(),
  specialization: text("specialization").notNull(),
  experience: integer("experience").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Schemas
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertProviderSchema = createInsertSchema(providers).omit({ id: true, createdAt: true, rating: true, totalReviews: true });
export const insertServiceSchema = createInsertSchema(services).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPractitionerSchema = createInsertSchema(practitioners).omit({ id: true, createdAt: true, updatedAt: true });
export const insertServicePractitionerSchema = createInsertSchema(servicePractitioners).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTimeSlotSchema = createInsertSchema(timeSlots).omit({ id: true });
export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true, updatedAt: true });
export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true, createdAt: true });
export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({ id: true, createdAt: true });
export const insertPromoCodeSchema = createInsertSchema(promoCodes).omit({ id: true, createdAt: true, usedCount: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertProviderPricingOverrideSchema = createInsertSchema(providerPricingOverrides).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserNotificationSchema = createInsertSchema(userNotifications).omit({ id: true, createdAt: true });
export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export const insertSupportTicketSchema = createInsertSchema(supportTickets).omit({ id: true, createdAt: true, updatedAt: true, resolvedAt: true });
export const insertTicketMessageSchema = createInsertSchema(ticketMessages).omit({ id: true, createdAt: true });
export const insertContentBlockSchema = createInsertSchema(contentBlocks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertFaqSchema = createInsertSchema(faqs).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBlogPostSchema = createInsertSchema(blogPosts).omit({ id: true, createdAt: true, updatedAt: true, publishedAt: true });
export const insertAnnouncementSchema = createInsertSchema(announcements).omit({ id: true, createdAt: true });
export const insertEmailTemplateSchema = createInsertSchema(emailTemplates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertNotificationSchema = createInsertSchema(notificationQueue).omit({ id: true, createdAt: true, sentAt: true });
export const insertPlatformSettingSchema = createInsertSchema(platformSettings).omit({ id: true, updatedAt: true });
export const insertServiceCategorySchema = createInsertSchema(serviceCategories).omit({ id: true, createdAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true, createdAt: true });
export const insertDailyMetricSchema = createInsertSchema(dailyMetrics).omit({ id: true, createdAt: true });
export const insertPrescriptionSchema = createInsertSchema(prescriptions).omit({ id: true, issuedAt: true });
export const insertMedicalHistorySchema = createInsertSchema(medicalHistory).omit({ id: true, createdAt: true });
export const insertSubServiceSchema = createInsertSchema(subServices).omit({ id: true, createdAt: true });
export const insertTaxSettingSchema = createInsertSchema(taxSettings).omit({ id: true });
export const insertPatientConsentSchema = createInsertSchema(patientConsents).omit({ id: true, acceptedAt: true });
export const insertMedicalPractitionerSchema = createInsertSchema(medicalPractitioners).omit({ id: true, createdAt: true });
export const insertRealtimeConversationSchema = createInsertSchema(realtimeConversations).omit({ id: true, createdAt: true });
export const insertRealtimeMessageSchema = createInsertSchema(realtimeMessages).omit({ id: true, createdAt: true });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const registerSchema = insertUserSchema.extend({
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Provider = typeof providers.$inferSelect;
export type InsertProvider = z.infer<typeof insertProviderSchema>;
export type Practitioner = typeof practitioners.$inferSelect;
export type InsertPractitioner = z.infer<typeof insertPractitionerSchema>;
export type ServicePractitioner = typeof servicePractitioners.$inferSelect;
export type InsertServicePractitioner = z.infer<typeof insertServicePractitionerSchema>;
export type Service = typeof services.$inferSelect;
export type InsertService = z.infer<typeof insertServiceSchema>;
export type TimeSlot = typeof timeSlots.$inferSelect;
export type InsertTimeSlot = z.infer<typeof insertTimeSlotSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Review = typeof reviews.$inferSelect;
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Payment = typeof payments.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type PromoCode = typeof promoCodes.$inferSelect;
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type ProviderPricingOverride = typeof providerPricingOverrides.$inferSelect;
export type InsertProviderPricingOverride = z.infer<typeof insertProviderPricingOverrideSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type SupportTicket = typeof supportTickets.$inferSelect;
export type InsertSupportTicket = z.infer<typeof insertSupportTicketSchema>;
export type TicketMessage = typeof ticketMessages.$inferSelect;
export type InsertTicketMessage = z.infer<typeof insertTicketMessageSchema>;
export type ContentBlock = typeof contentBlocks.$inferSelect;
export type InsertContentBlock = z.infer<typeof insertContentBlockSchema>;
export type Faq = typeof faqs.$inferSelect;
export type InsertFaq = z.infer<typeof insertFaqSchema>;
export type BlogPost = typeof blogPosts.$inferSelect;
export type InsertBlogPost = z.infer<typeof insertBlogPostSchema>;
export type Announcement = typeof announcements.$inferSelect;
export type InsertAnnouncement = z.infer<typeof insertAnnouncementSchema>;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type InsertEmailTemplate = z.infer<typeof insertEmailTemplateSchema>;
export type Notification = typeof notificationQueue.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type ServiceCategory = typeof serviceCategories.$inferSelect;
export type InsertServiceCategory = z.infer<typeof insertServiceCategorySchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type DailyMetric = typeof dailyMetrics.$inferSelect;
export type InsertDailyMetric = z.infer<typeof insertDailyMetricSchema>;
export type Prescription = typeof prescriptions.$inferSelect;
export type InsertPrescription = z.infer<typeof insertPrescriptionSchema>;
export type MedicalHistory = typeof medicalHistory.$inferSelect;
export type InsertMedicalHistory = z.infer<typeof insertMedicalHistorySchema>;
export type UserNotification = typeof userNotifications.$inferSelect;
export type InsertUserNotification = z.infer<typeof insertUserNotificationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type RealtimeConversation = typeof realtimeConversations.$inferSelect;
export type RealtimeMessage = typeof realtimeMessages.$inferSelect;
export type SubService = typeof subServices.$inferSelect;
export type InsertSubService = z.infer<typeof insertSubServiceSchema>;
export type TaxSetting = typeof taxSettings.$inferSelect;
export type InsertTaxSetting = z.infer<typeof insertTaxSettingSchema>;
export type PatientConsent = typeof patientConsents.$inferSelect;
export type InsertPatientConsent = z.infer<typeof insertPatientConsentSchema>;
export type MedicalPractitioner = typeof medicalPractitioners.$inferSelect;
export type InsertMedicalPractitioner = z.infer<typeof insertMedicalPractitionerSchema>;

export type ProviderWithUser = Provider & { user: User };
export type ProviderWithServices = ProviderWithUser & { services: Service[], practitionerData?: string };
export type AppointmentWithDetails = Appointment & { 
  patient: User; 
  provider: Provider & { user: User }; 
  service?: Service; 
  practitioner?: Practitioner;
  timeSlot?: TimeSlot;
};
export type ReviewWithPatient = Review & { patient: User };

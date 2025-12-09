import {
  users,
  providers,
  services,
  timeSlots,
  appointments,
  reviews,
  payments,
  refreshTokens,
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
  type ProviderWithUser,
  type ProviderWithServices,
  type AppointmentWithDetails,
  type ReviewWithPatient,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, or, sql } from "drizzle-orm";

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined>;

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

  async updateUser(id: string, data: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return user || undefined;
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
}

export const storage = new DatabaseStorage();

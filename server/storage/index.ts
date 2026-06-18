/**
 * Storage barrel — re-exports the storage singleton and all public types.
 *
 * Domain organisation (documentation only; implementation is in database-storage.ts):
 *   users.storage.ts        — users, auth, family, medical, referrals, waitlist, bug reports
 *   appointments.storage.ts — providers, services, slots, appointments, reviews, group sessions
 *   financial.storage.ts    — payments, wallets, invoices, packages, analytics, RBAC, content
 */
export type { IStorage } from "./interface";
export { DatabaseStorage, storage } from "./database-storage";

export type { UsersDomain } from "./users.storage";
export type { AppointmentsDomain } from "./appointments.storage";
export type { FinancialDomain } from "./financial.storage";

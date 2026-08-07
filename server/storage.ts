/**
 * Storage shim — kept for backward-compat with existing relative imports
 * (`import { storage } from "../storage"` etc.).
 *
 * The implementation and singleton now live in server/storage/ (modular
 * domain-driven folder). Import from there for new code.
 */
export * from "./storage/index";

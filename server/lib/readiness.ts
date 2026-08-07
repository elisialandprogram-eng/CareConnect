/**
 * Process readiness state.
 *
 * Listening means the HTTP server has opened its port. Ready means the
 * startup migrations that protect the request schema have completed.
 */

export type ReadinessStatus = "starting" | "migrating" | "ready" | "failed";

interface ReadinessSnapshot {
  status: ReadinessStatus;
  startedAt: string;
  migrationsStartedAt: string | null;
  migrationsCompletedAt: string | null;
  error: string | null;
}

const state: ReadinessSnapshot = {
  status: "starting",
  startedAt: new Date().toISOString(),
  migrationsStartedAt: null,
  migrationsCompletedAt: null,
  error: null,
};

export function markListening(): void {
  state.status = "migrating";
  state.migrationsStartedAt = new Date().toISOString();
  state.error = null;
}

export function markReady(): void {
  state.status = "ready";
  state.migrationsCompletedAt = new Date().toISOString();
  state.error = null;
}

export function markReadinessFailed(error: unknown): void {
  state.status = "failed";
  state.error = error instanceof Error ? error.message : String(error);
}

export function getReadiness(): Readonly<ReadinessSnapshot> {
  return { ...state };
}
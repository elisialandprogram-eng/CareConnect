/**
 * In-process scheduler (cron) state registry.
 *
 * Tracks per-job metrics that are visible through the admin diagnostics
 * endpoint without requiring a new database table.  State is intentionally
 * ephemeral — it resets on process restart, which is fine because diagnostics
 * are about the current process session, not historical trends.
 *
 * Usage
 * -----
 * import { withJobTracking } from "../lib/cronState";
 *
 * async function myJob(): Promise<number> { ... return itemsProcessed; }
 * const result = await withJobTracking("myJob", myJob);
 */

export interface JobState {
  jobName: string;
  lastRunAt: string | null;       // ISO 8601
  lastDurationMs: number | null;
  consecutiveFailures: number;
  totalRuns: number;
  totalFailures: number;
  lastError: string | null;
  lastItemCount: number | null;
  status: "idle" | "running" | "ok" | "failed";
}

const _registry = new Map<string, JobState>();

function _ensure(jobName: string): JobState {
  if (!_registry.has(jobName)) {
    _registry.set(jobName, {
      jobName,
      lastRunAt: null,
      lastDurationMs: null,
      consecutiveFailures: 0,
      totalRuns: 0,
      totalFailures: 0,
      lastError: null,
      lastItemCount: null,
      status: "idle",
    });
  }
  return _registry.get(jobName)!;
}

/** Mark a job as started and return the start timestamp (ms). */
export function recordJobStart(jobName: string): number {
  const state = _ensure(jobName);
  state.status = "running";
  return Date.now();
}

/** Mark a job as finished.  Pass the start time from `recordJobStart`. */
export function recordJobEnd(
  jobName: string,
  startedAt: number,
  opts?: { itemCount?: number; error?: string },
): void {
  const state = _ensure(jobName);
  const durationMs = Date.now() - startedAt;
  state.lastRunAt = new Date().toISOString();
  state.lastDurationMs = durationMs;
  state.totalRuns += 1;

  if (opts?.error) {
    state.totalFailures += 1;
    state.consecutiveFailures += 1;
    state.lastError = opts.error;
    state.status = "failed";
  } else {
    state.consecutiveFailures = 0;
    state.lastError = null;
    state.status = "ok";
    if (opts?.itemCount !== undefined) state.lastItemCount = opts.itemCount;
  }
}

/**
 * Convenience wrapper.  Runs `fn`, records start/end, returns fn's result.
 * If fn throws, records the error and re-throws so the cron caller still sees it.
 */
export async function withJobTracking<T>(
  jobName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = recordJobStart(jobName);
  try {
    const result = await fn();
    const itemCount = typeof result === "number" ? result : undefined;
    recordJobEnd(jobName, start, { itemCount });
    return result;
  } catch (err: any) {
    recordJobEnd(jobName, start, { error: String(err?.message ?? err) });
    throw err;
  }
}

/** Return a snapshot of all registered job states. */
export function getJobStates(): JobState[] {
  return Array.from(_registry.values()).sort((a, b) => a.jobName.localeCompare(b.jobName));
}

/** Return the number of jobs currently in "failed" state with ≥1 consecutive failures. */
export function countFailingJobs(): number {
  let n = 0;
  for (const s of _registry.values()) {
    if (s.consecutiveFailures > 0) n++;
  }
  return n;
}

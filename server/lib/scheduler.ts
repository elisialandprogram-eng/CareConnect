/**
 * Modular job scheduler.
 *
 * Thin registry on top of the existing cronState.ts tracking layer.
 * Provides a clean interface for registering named, interval-based jobs
 * with automatic health tracking, failure counting, and last-run metadata.
 *
 * Usage
 * -----
 *   import { scheduler } from "./lib/scheduler";
 *
 *   scheduler.register({
 *     name: "my_job",
 *     intervalMs: 5 * 60 * 1000,
 *     runImmediately: true,
 *     fn: async () => {
 *       // ... returns number of items processed (or void)
 *       return 42;
 *     },
 *   });
 *
 *   scheduler.start(); // call once after all registrations
 *
 * The existing reminderCron.ts and cron/*.ts files continue to operate
 * independently. This scheduler is the home for NEW jobs and future
 * migration of legacy jobs.
 */

import { withJobTracking } from "./cronState";

export interface ScheduledJob {
  /** Unique identifier used for health tracking and log tagging. */
  name: string;
  /** How often to run the job, in milliseconds. */
  intervalMs: number;
  /**
   * The job function. Return the number of items processed for metrics, or void.
   * Must never throw — errors are caught and recorded.
   */
  fn: () => Promise<number | void>;
  /** If true, run once immediately when start() is called. Default: false. */
  runImmediately?: boolean;
}

class JobScheduler {
  private readonly _jobs: ScheduledJob[] = [];
  private readonly _timers = new Map<string, NodeJS.Timeout>();
  private _started = false;

  /** Register a job. Must be called before start(). */
  register(job: ScheduledJob): this {
    if (this._started) {
      console.warn(`[scheduler] register() called after start() — job "${job.name}" will not run.`);
      return this;
    }
    const existing = this._jobs.find((j) => j.name === job.name);
    if (existing) {
      console.warn(`[scheduler] duplicate job name "${job.name}" — skipping second registration.`);
      return this;
    }
    this._jobs.push(job);
    return this;
  }

  /** Start all registered jobs. */
  start(): void {
    if (this._started) return;
    this._started = true;

    for (const job of this._jobs) {
      const run = () => withJobTracking(job.name, job.fn).catch(() => {});
      if (job.runImmediately) run();
      const timer = setInterval(run, job.intervalMs);
      if (timer.unref) timer.unref();
      this._timers.set(job.name, timer);
    }

    if (this._jobs.length > 0) {
      console.log(`[scheduler] started ${this._jobs.length} job(s): ${this._jobs.map((j) => j.name).join(", ")}`);
    }
  }

  /** Stop a specific job (or all jobs if name omitted). */
  stop(name?: string): void {
    if (name) {
      const t = this._timers.get(name);
      if (t) { clearInterval(t); this._timers.delete(name); }
    } else {
      for (const t of this._timers.values()) clearInterval(t);
      this._timers.clear();
    }
  }

  /** Names of all registered jobs. */
  getRegisteredJobs(): string[] {
    return this._jobs.map((j) => j.name);
  }
}

/** Singleton scheduler instance. Import this across all cron files. */
export const scheduler = new JobScheduler();

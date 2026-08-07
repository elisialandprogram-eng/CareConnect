/**
 * In-process request metrics store.
 *
 * Collects route latency, error counts, and slow-request data per process
 * session. Resets on restart (intentional — these are operational health
 * indicators, not historical records). Slow requests (>SLOW_MS) are also
 * persisted to system_events for admin visibility via the DB query in index.ts.
 *
 * Exported: recordRequest(), getMetricsSummary()
 */

export const SLOW_MS = 2000;
const MAX_ROUTE_ENTRIES = 200;

interface RouteBucket {
  count: number;
  totalMs: number;
  maxMs: number;
  errors4xx: number;
  errors5xx: number;
  slowHits: number;
  totalBytes: number;
}

const _startedAt = Date.now();
let _totalRequests = 0;
let _total4xx = 0;
let _total5xx = 0;
let _totalSlow = 0;
const _routes = new Map<string, RouteBucket>();

function _normalizePath(method: string, rawPath: string): string {
  const normalized = rawPath
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
    .replace(/\/\d+/g, "/:id");
  return `${method} ${normalized}`;
}

export interface RequestRecord {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  bytes?: number;
}

export function recordRequest(rec: RequestRecord): void {
  const { method, path, statusCode, durationMs, bytes = 0 } = rec;
  _totalRequests++;
  if (statusCode >= 400 && statusCode < 500) _total4xx++;
  if (statusCode >= 500) _total5xx++;
  if (durationMs >= SLOW_MS) _totalSlow++;

  const key = _normalizePath(method, path);
  let bucket = _routes.get(key);
  if (!bucket) {
    if (_routes.size >= MAX_ROUTE_ENTRIES) return;
    bucket = { count: 0, totalMs: 0, maxMs: 0, errors4xx: 0, errors5xx: 0, slowHits: 0, totalBytes: 0 };
    _routes.set(key, bucket);
  }
  bucket.count++;
  bucket.totalMs += durationMs;
  bucket.totalBytes += bytes;
  if (durationMs > bucket.maxMs) bucket.maxMs = durationMs;
  if (statusCode >= 400 && statusCode < 500) bucket.errors4xx++;
  if (statusCode >= 500) bucket.errors5xx++;
  if (durationMs >= SLOW_MS) bucket.slowHits++;
}

export interface MetricsSummary {
  uptimeMs: number;
  since: string;
  totals: {
    requests: number;
    errors4xx: number;
    errors5xx: number;
    slowRequests: number;
  };
  topRoutes: Array<{
    route: string;
    count: number;
    avgMs: number;
    maxMs: number;
    errors4xx: number;
    errors5xx: number;
    slowHits: number;
    avgBytes: number;
    totalBytes: number;
    estimatedDailyKB: number;
  }>;
  slowestRoutes: Array<{
    route: string;
    avgMs: number;
    maxMs: number;
    count: number;
  }>;
}

export function getMetricsSummary(): MetricsSummary {
  const uptimeMs = Date.now() - _startedAt;
  const uptimeHours = uptimeMs / (1000 * 60 * 60);

  const allRoutes = Array.from(_routes.entries()).map(([route, b]) => {
    const avgBytes = b.count > 0 ? Math.round(b.totalBytes / b.count) : 0;
    const reqPerHour = b.count / Math.max(uptimeHours, 0.001);
    const estimatedDailyKB = Math.round((reqPerHour * 24 * avgBytes) / 1024);
    return {
      route,
      count: b.count,
      avgMs: b.count > 0 ? Math.round(b.totalMs / b.count) : 0,
      maxMs: b.maxMs,
      errors4xx: b.errors4xx,
      errors5xx: b.errors5xx,
      slowHits: b.slowHits,
      avgBytes,
      totalBytes: b.totalBytes,
      estimatedDailyKB,
    };
  });

  const topRoutes = [...allRoutes].sort((a, b) => b.count - a.count).slice(0, 20);
  const slowestRoutes = [...allRoutes]
    .filter((r) => r.count > 0)
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 10)
    .map(({ route, avgMs, maxMs, count }) => ({ route, avgMs, maxMs, count }));

  return {
    uptimeMs,
    since: new Date(_startedAt).toISOString(),
    totals: {
      requests: _totalRequests,
      errors4xx: _total4xx,
      errors5xx: _total5xx,
      slowRequests: _totalSlow,
    },
    topRoutes,
    slowestRoutes,
  };
}

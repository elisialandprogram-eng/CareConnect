/**
 * Lightweight in-process TTL cache.
 *
 * Useful for public/admin read-heavy endpoints that hit Supabase on every
 * request (e.g. /api/categories, /api/services/public). A 5-minute TTL
 * dramatically reduces round-trips without ever serving stale data for long.
 *
 * NOT suitable for multi-instance deployments — use Redis/Upstash for that.
 * Invalidate via `cache.delete(key)` after any admin write that affects the
 * cached data.
 */
export class TTLCache<K, V> {
  private store = new Map<K, { value: V; expiresAt: number }>();

  constructor(private defaultTtlMs: number) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: K, value: V, ttlMs?: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  delete(key: K): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

const TTL_5_MIN  = 5  * 60 * 1000;
const TTL_10_MIN = 10 * 60 * 1000;
const TTL_30_SEC = 30 * 1000;
const TTL_2_MIN  = 2  * 60 * 1000;

export const categoriesCache    = new TTLCache<string, unknown>(TTL_5_MIN);
export const publicServicesCache = new TTLCache<string, unknown>(TTL_5_MIN);

/**
 * Cache for /api/sub-services (specialties / service categories).
 * 10-minute TTL — sub-services change only when an admin edits them.
 * Invalidated on POST/PATCH/DELETE /api/sub-services.
 */
export const subServicesCache = new TTLCache<string, unknown>(TTL_10_MIN);

/**
 * Cache for /api/packages (membership package definitions by country+role).
 * 10-minute TTL — package definitions change only via admin writes.
 * Invalidated on admin package POST/PATCH/DELETE.
 */
export const packagesCache = new TTLCache<string, unknown>(TTL_10_MIN);

/**
 * Cache for full (non-search) provider listings, keyed by country code.
 * 30-second TTL keeps listings fresh while absorbing burst traffic.
 * Invalidated on any admin provider write.
 */
export const providerListCache = new TTLCache<string, unknown>(TTL_30_SEC);

/**
 * Cache for paginated search results, keyed by a hash of all search params.
 * 2-minute TTL — search results change less frequently than profile edits.
 */
export const providerSearchCache = new TTLCache<string, unknown>(TTL_2_MIN);

/**
 * Cache for the enhanced analytics dashboard, keyed by country code.
 * 5-minute TTL — analytics aggregates are expensive (10+ queries) and a
 * brief staleness window is acceptable for non-financial summary data.
 * Invalidated when providers are approved/rejected or on demand.
 * NEVER cache wallet balances, payment records, or permission data here.
 */
export const analyticsCache = new TTLCache<string, unknown>(TTL_5_MIN);

/**
 * Cache for admin monitoring stats (unresolved event counts by severity/type).
 * 2-minute TTL — counts drift slowly and the dashboard polls every few minutes.
 */
export const monitoringStatsCache = new TTLCache<string, unknown>(TTL_2_MIN);

// ── Cache statistics helper ────────────────────────────────────────────────

interface CacheInstanceStats {
  name: string;
  entries: number;
  defaultTtlMs: number;
}

/**
 * Returns a snapshot of all named cache instances for the diagnostics
 * endpoint.  Add any new cache instance here when creating it above.
 */
export function getCacheStats(): CacheInstanceStats[] {
  return [
    { name: "categoriesCache",      entries: categoriesCache.size(),      defaultTtlMs: TTL_5_MIN  },
    { name: "publicServicesCache",   entries: publicServicesCache.size(),   defaultTtlMs: TTL_5_MIN  },
    { name: "subServicesCache",      entries: subServicesCache.size(),      defaultTtlMs: TTL_10_MIN },
    { name: "packagesCache",         entries: packagesCache.size(),         defaultTtlMs: TTL_10_MIN },
    { name: "providerListCache",     entries: providerListCache.size(),     defaultTtlMs: TTL_30_SEC },
    { name: "providerSearchCache",   entries: providerSearchCache.size(),   defaultTtlMs: TTL_2_MIN  },
    { name: "analyticsCache",        entries: analyticsCache.size(),        defaultTtlMs: TTL_5_MIN  },
    { name: "monitoringStatsCache",  entries: monitoringStatsCache.size(),  defaultTtlMs: TTL_2_MIN  },
  ];
}

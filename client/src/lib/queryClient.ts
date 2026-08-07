import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const raw = (await res.text()) || res.statusText;
    let msg = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        if (typeof parsed.message === "string" && parsed.message.trim()) {
          msg = parsed.message;
        } else if (typeof parsed.error === "string" && parsed.error.trim()) {
          msg = parsed.error;
        }
        if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
          const first = parsed.errors[0];
          if (first?.message) msg = `${msg} — ${first.message}`;
        }
      }
    } catch {
      /* not JSON, keep raw text */
    }
    const err = new Error(msg) as Error & { status?: number; statusText?: string };
    err.status = res.status;
    err.statusText = res.statusText;
    throw err;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const r = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
      return r.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => { refreshInFlight = null; }, 0);
    }
  })();
  return refreshInFlight;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const doFetch = () => fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  let res = await doFetch();
  if (res.status === 401 && !url.includes("/api/auth/")) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      res = await doFetch();
    }
  }

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    const doFetch = () => fetch(url, { credentials: "include" });

    let res = await doFetch();
    if (res.status === 401 && !url.includes("/api/auth/")) {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        res = await doFetch();
      }
    }

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Auth/identity queries should stay fresh indefinitely (they're invalidated on
// login/logout mutations). Everything else uses a 60-second window so stale
// data gets replaced when the user navigates back to a page.
const AUTH_STALE_PREFIXES = ["/api/auth/", "/api/user"];

// Reference/lookup data that changes rarely — specialties, categories, packages.
// These get a longer stale window (10 min) since they're also cached server-side.
const REFERENCE_PREFIXES = ["/api/sub-services", "/api/categories", "/api/packages"];

// Admin and dashboard endpoints — disable refetchOnWindowFocus to prevent
// expensive re-fetches every time an admin switches tabs.
const NO_REFOCUS_PREFIXES = [
  "/api/admin/",
  "/api/provider/me",
  "/api/provider/documents",
  "/api/provider/appointments",
  "/api/provider/services",
  "/api/patient/",
];

/**
 * Unified provider-profile cache invalidation macro.
 * Always call this (instead of invalidating authMe or providerMe separately)
 * after any provider-profile mutation so both caches stay in sync.
 */
export function invalidateProviderProfile(): Promise<void[]> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] }),
    queryClient.invalidateQueries({ queryKey: ["/api/provider/me"] }),
  ]);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: (query) => {
        const key = String(query.queryKey[0] ?? "");
        if (AUTH_STALE_PREFIXES.some(p => key.startsWith(p))) return false;
        if (NO_REFOCUS_PREFIXES.some(p => key.startsWith(p))) return false;
        return true;
      },
      refetchOnReconnect: (query) => {
        const key = String(query.queryKey[0] ?? "");
        // Auth state should always refetch on reconnect so session expiry is caught.
        if (AUTH_STALE_PREFIXES.some(p => key.startsWith(p))) return true;
        // Everything else: avoid a burst of parallel requests the moment the
        // network recovers — only refetch if the data is already stale.
        return false;
      },
      staleTime: (query) => {
        const key = String(query.queryKey[0] ?? "");
        if (AUTH_STALE_PREFIXES.some(p => key.startsWith(p))) return Infinity;
        if (REFERENCE_PREFIXES.some(p => key.startsWith(p))) return 10 * 60 * 1000; // 10 min for reference data
        return 60 * 1000; // 1 minute for all other data
      },
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

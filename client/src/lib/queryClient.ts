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

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

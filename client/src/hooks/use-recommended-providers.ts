import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import type { ProviderWithUser } from "@shared/schema";

export interface RecommendedProvider extends ProviderWithUser {
  matchScore: number;
  matchReasons: string[];
  fallbackUsed?: boolean;
}

interface RecommendedResponse {
  providers: RecommendedProvider[];
  fallbackUsed: boolean;
}

interface UseRecommendedProvidersOpts {
  desiredCategory?: string;
  desiredSubServiceId?: string;
  budgetHint?: number;
  limit?: number;
  enabled?: boolean;
}

/**
 * Fetches personalized provider recommendations scored against the current
 * patient's profile (city, language, past bookings, budget hint).
 *
 * Only fires for authenticated patients; returns empty for providers/admins.
 */
export function useRecommendedProviders(opts: UseRecommendedProvidersOpts = {}) {
  const { user } = useAuth();
  const isPatient = user?.role === "patient";

  const params = new URLSearchParams();
  if (opts.desiredCategory) params.set("category", opts.desiredCategory);
  if (opts.desiredSubServiceId) params.set("subServiceId", opts.desiredSubServiceId);
  if (opts.budgetHint) params.set("budget", String(opts.budgetHint));
  if (opts.limit) params.set("limit", String(opts.limit));

  const qs = params.toString();

  return useQuery<RecommendedResponse>({
    queryKey: ["/api/providers/recommended", opts.desiredCategory, opts.desiredSubServiceId, opts.budgetHint, user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/providers/recommended${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch recommendations");
      return res.json();
    },
    enabled: isPatient && (opts.enabled !== false),
    staleTime: 5 * 60 * 1000,   // 5 min — recommendations don't change that fast
  });
}

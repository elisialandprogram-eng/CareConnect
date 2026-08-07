/**
 * LocationAnalyticsPanel — Phase D admin panel
 *
 * Shows: bookings by city, provider distribution, home-visit breakdown.
 * Data sourced from GET /api/admin/analytics/location.
 */

import { useQuery } from "@tanstack/react-query";
import { formatCount } from "@/lib/format-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Building2, Home, Video, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface CityRow {
  city: string;
  country_code: string;
  booking_count: string;
  completed_count: string;
}

interface ProviderRow {
  city: string;
  country_code: string;
  provider_count: string;
  home_visit_count: string;
}

interface HomeVisitStats {
  home_visit_bookings: string;
  clinic_bookings: string;
  online_bookings: string;
  total_bookings: string;
}

interface LocationAnalytics {
  bookingsByCity: CityRow[];
  providerDistribution: ProviderRow[];
  homeVisitStats: HomeVisitStats;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl border bg-card">
      <div className={cn("p-2 rounded-lg", color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold">{formatCount(value)}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

function CityBar({
  city,
  count,
  max,
  tag,
}: {
  city: string;
  count: number;
  max: number;
  tag?: string;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium truncate max-w-[180px]">{city}</span>
        <div className="flex items-center gap-2">
          {tag && (
            <Badge variant="outline" className="text-xs py-0 px-1.5">
              {tag}
            </Badge>
          )}
          <span className="text-muted-foreground tabular-nums">{formatCount(count)}</span>
        </div>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function LocationAnalyticsPanel() {
  const { data, isLoading, error } = useQuery<LocationAnalytics>({
    queryKey: ["/api/admin/analytics/location"],
  });

  if (error) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <MapPin className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p>Failed to load location analytics.</p>
      </div>
    );
  }

  const hvStats = data?.homeVisitStats;
  const total = parseInt(hvStats?.total_bookings ?? "0") || 0;
  const homeCount = parseInt(hvStats?.home_visit_bookings ?? "0") || 0;
  const clinicCount = parseInt(hvStats?.clinic_bookings ?? "0") || 0;
  const onlineCount = parseInt(hvStats?.online_bookings ?? "0") || 0;

  const maxBookingCity = Math.max(
    ...(data?.bookingsByCity.map((r) => parseInt(r.booking_count) || 0) ?? [1]),
  );
  const maxProviderCity = Math.max(
    ...(data?.providerDistribution.map((r) => parseInt(r.provider_count) || 0) ?? [1]),
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <MapPin className="h-5 w-5 text-primary" />
          Location Intelligence
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Geographic distribution of bookings and providers.
        </p>
      </div>

      {/* Visit type breakdown */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))
        ) : (
          <>
            <StatCard
              icon={Users}
              label="Total Bookings"
              value={total}
              color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            />
            <StatCard
              icon={Building2}
              label="Clinic"
              value={clinicCount}
              sub={total ? `${Math.round((clinicCount / total) * 100)}%` : undefined}
              color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            />
            <StatCard
              icon={Home}
              label="Home Visit"
              value={homeCount}
              sub={total ? `${Math.round((homeCount / total) * 100)}%` : undefined}
              color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            />
            <StatCard
              icon={Video}
              label="Online"
              value={onlineCount}
              sub={total ? `${Math.round((onlineCount / total) * 100)}%` : undefined}
              color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
            />
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Bookings by city */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Bookings by City
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded" />
              ))
            ) : !data?.bookingsByCity.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
            ) : (
              data.bookingsByCity.map((row, i) => (
                <CityBar
                  key={i}
                  city={row.city}
                  count={parseInt(row.booking_count) || 0}
                  max={maxBookingCity}
                  tag={row.country_code}
                />
              ))
            )}
          </CardContent>
        </Card>

        {/* Provider distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Providers by City
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded" />
              ))
            ) : !data?.providerDistribution.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
            ) : (
              data.providerDistribution.map((row, i) => (
                <CityBar
                  key={i}
                  city={`${row.city}${parseInt(row.home_visit_count) > 0 ? ` (${row.home_visit_count} home)` : ""}`}
                  count={parseInt(row.provider_count) || 0}
                  max={maxProviderCity}
                  tag={row.country_code}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

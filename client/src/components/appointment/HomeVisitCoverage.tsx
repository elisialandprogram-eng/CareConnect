import { MapPin, Navigation, Home, AlertCircle } from "lucide-react";

interface Props {
  patientAddress?: string | null;
  providerCity?: string | null;
  homeVisitRadiusKm?: number | null;
  distanceKm?: number | null;
  className?: string;
}

export function HomeVisitCoverage({
  patientAddress,
  providerCity,
  homeVisitRadiusKm,
  distanceKm,
  className = "",
}: Props) {
  if (!patientAddress && !homeVisitRadiusKm && !distanceKm) return null;

  const inRange = homeVisitRadiusKm != null && distanceKm != null ? distanceKm <= homeVisitRadiusKm : null;

  return (
    <div
      className={`rounded-xl border bg-card p-4 space-y-3 ${className}`}
      data-testid="home-visit-coverage"
    >
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
          <Home className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h4 className="text-sm font-semibold">Home Visit Details</h4>
      </div>

      <div className="space-y-2 text-sm">
        {patientAddress && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Your address</p>
              <p className="font-medium">{patientAddress}</p>
            </div>
          </div>
        )}

        {providerCity && (
          <div className="flex items-start gap-2">
            <Navigation className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Provider base</p>
              <p className="font-medium">{providerCity}</p>
            </div>
          </div>
        )}

        {homeVisitRadiusKm != null && (
          <div className="flex items-center gap-2 pt-1">
            <div
              className={`flex-1 rounded-lg px-3 py-2 border text-sm ${
                inRange === true
                  ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                  : inRange === false
                  ? "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800"
                  : "bg-muted border-border"
              }`}
            >
              {inRange === true && (
                <p className="text-emerald-700 dark:text-emerald-300 font-medium text-xs">
                  ✓ Within coverage zone ({homeVisitRadiusKm} km radius)
                  {distanceKm != null && ` · ${distanceKm.toFixed(1)} km away`}
                </p>
              )}
              {inRange === false && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  <p className="text-rose-700 dark:text-rose-300 font-medium text-xs">
                    Outside coverage zone — {distanceKm?.toFixed(1)} km away (max {homeVisitRadiusKm} km)
                  </p>
                </div>
              )}
              {inRange === null && (
                <p className="text-muted-foreground text-xs">
                  Provider covers up to {homeVisitRadiusKm} km from their base
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

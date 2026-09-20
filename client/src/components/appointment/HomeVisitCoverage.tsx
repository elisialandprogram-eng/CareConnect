import { MapPin, Navigation, Home, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        <h4 className="text-sm font-semibold">{t("member_home_visit.title", "Home visit details")}</h4>
      </div>

      <div className="space-y-2 text-sm">
        {patientAddress && (
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("member_home_visit.your_address", "Your address")}</p>
              <p className="font-medium">{patientAddress}</p>
            </div>
          </div>
        )}

        {providerCity && (
          <div className="flex items-start gap-2">
            <Navigation className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("member_home_visit.provider_base", "Provider base")}</p>
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
                  {t("member_home_visit.within_zone", "✓ Within coverage zone ({{radius}} km radius)", { radius: homeVisitRadiusKm })}
                  {distanceKm != null && ` · ${t("member_home_visit.away", "{{distance}} km away", { distance: distanceKm.toFixed(1) })}`}
                </p>
              )}
              {inRange === false && (
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                  <p className="text-rose-700 dark:text-rose-300 font-medium text-xs">
                    {t("member_home_visit.outside_zone", "Outside coverage zone — {{distance}} km away (max {{radius}} km)", { distance: distanceKm?.toFixed(1), radius: homeVisitRadiusKm })}
                  </p>
                </div>
              )}
              {inRange === null && (
                <p className="text-muted-foreground text-xs">
                  {t("member_home_visit.covers_up_to", "Provider covers up to {{radius}} km from their base", { radius: homeVisitRadiusKm })}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

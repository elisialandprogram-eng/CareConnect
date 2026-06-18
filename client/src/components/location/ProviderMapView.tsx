import { useEffect, useRef, useState } from "react";
import type { ProviderWithUser } from "@shared/schema";
import { Star, MapPin, Navigation2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { useCurrency } from "@/lib/currency";

interface Props {
  providers: ProviderWithUser[];
  isLoading?: boolean;
}

// Fallback city coordinates for common Hungarian / Iranian cities
const CITY_COORDS: Record<string, [number, number]> = {
  budapest: [47.4979, 19.0402],
  debrecen: [47.5316, 21.6273],
  miskolc: [48.1035, 20.7784],
  pécs: [46.0727, 18.2329],
  pecs: [46.0727, 18.2329],
  győr: [47.6875, 17.6504],
  gyor: [47.6875, 17.6504],
  nyíregyháza: [47.9554, 21.7166],
  nyiregyhaza: [47.9554, 21.7166],
  kecskemét: [46.9066, 19.6918],
  kecskemet: [46.9066, 19.6918],
  székesfehérvár: [47.1865, 18.4122],
  szekesfehervar: [47.1865, 18.4122],
  tehran: [35.6892, 51.389],
  تهران: [35.6892, 51.389],
  isfahan: [32.6539, 51.6660],
  mashhad: [36.2605, 59.6168],
  shiraz: [29.5918, 52.5837],
  tabriz: [38.0962, 46.2738],
};

function getCityCoords(city?: string | null): [number, number] | null {
  if (!city) return null;
  const key = city.toLowerCase().trim();
  return CITY_COORDS[key] ?? null;
}

function getProviderCoords(p: ProviderWithUser): [number, number] | null {
  const lat = (p as any).latitude;
  const lng = (p as any).longitude;
  if (lat && lng && !isNaN(Number(lat)) && !isNaN(Number(lng))) {
    return [Number(lat), Number(lng)];
  }
  const userCity = (p.user as any)?.city ?? (p as any).city;
  return getCityCoords(userCity);
}

export function ProviderMapView({ providers, isLoading }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const { t } = useTranslation();
  const { format: formatAmount } = useCurrency();
  const [selectedProvider, setSelectedProvider] = useState<ProviderWithUser | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      if (!mapRef.current || mapInstanceRef.current) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);

      const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: false }).setView(
        [47.4979, 19.0402],
        7,
      );
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 18,
      }).addTo(map);

      mapInstanceRef.current = map;
    });

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstanceRef.current) return;

    import("leaflet").then((L) => {
      const map = mapInstanceRef.current;
      if (!map) return;

      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];

      const pinIcon = (color: string) =>
        L.divIcon({
          className: "",
          html: `<div style="width:32px;height:32px;background:${color};border:2px solid white;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;">
                   <span style="transform:rotate(45deg);font-size:14px;color:white;font-weight:700;display:block;margin:auto;padding-top:2px;">✚</span>
                 </div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 32],
          popupAnchor: [0, -34],
        });

      const typeColors: Record<string, string> = {
        physician:            "#2563eb",
        mental_health:        "#7c3aed",
        nutrition:            "#65a30d",
        rehabilitation:       "#059669",
        dental:               "#0891b2",
        alternative_medicine: "#0d9488",
        nursing:              "#e11d48",
      };

      const bounds: [number, number][] = [];

      for (const p of providers) {
        const coords = getProviderCoords(p);
        if (!coords) continue;

        const color = typeColors[(p as any).providerType ?? (p as any).provider_type ?? "physician"] ?? "#2563eb";
        const name = `${p.user?.firstName ?? ""} ${p.user?.lastName ?? ""}`.trim() || "Provider";
        const city = (p.user as any)?.city ?? (p as any).city ?? "";
        const rating = Number((p as any).rating ?? 0).toFixed(1);
        const fee = (p as any).consultationFee ?? (p as any).consultation_fee;

        const marker = L.marker(coords, { icon: pinIcon(color) })
          .bindPopup(
            `<div style="min-width:180px;font-family:sans-serif;">
               <div style="font-weight:700;font-size:14px;margin-bottom:4px;">${name}</div>
               <div style="font-size:12px;color:#555;margin-bottom:4px;text-transform:capitalize;">${(p as any).providerType ?? "Provider"}${city ? ` • ${city}` : ""}</div>
               <div style="font-size:12px;color:#f59e0b;margin-bottom:6px;">★ ${rating}</div>
               ${fee ? `<div style="font-size:12px;margin-bottom:8px;">From ${formatAmount(Number(fee))}</div>` : ""}
               <a href="/provider/${p.id}" style="display:block;background:#2563eb;color:white;text-align:center;padding:6px 10px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">View Profile</a>
             </div>`,
            { maxWidth: 240 },
          )
          .addTo(map);

        marker.on("click", () => setSelectedProvider(p));
        markersRef.current.push(marker);
        bounds.push(coords);
      }

      if (bounds.length > 0) {
        map.fitBounds(bounds as any, { padding: [40, 40], maxZoom: 13 });
      }
    });
  }, [providers, formatAmount]);

  const providersWithCoords = providers.filter((p) => getProviderCoords(p) !== null);

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card overflow-hidden h-[500px] animate-pulse flex items-center justify-center">
        <Navigation2 className="h-8 w-8 text-muted-foreground animate-bounce" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <MapPin className="h-4 w-4" />
          {providersWithCoords.length > 0
            ? t("providers.map_showing", "Showing {{n}} provider(s) on map", { n: providersWithCoords.length })
            : t("providers.map_no_coords", "No provider locations available yet")}
        </span>
        <div className="flex items-center gap-3 text-xs">
          {[
            { label: t("common.physicians", "Physicians"), color: "#2563eb" },
            { label: t("common.mental_health_pros", "Mental Health"), color: "#7c3aed" },
            { label: t("common.nutrition_pros", "Nutrition"), color: "#65a30d" },
            { label: t("common.rehabilitation_pros", "Rehab"), color: "#059669" },
            { label: t("common.dental_pros", "Dental"), color: "#0891b2" },
            { label: t("common.alternative_medicine_pros", "Holistic"), color: "#0d9488" },
            { label: t("common.nursing_pros", "Nursing"), color: "#e11d48" },
          ].map((item) => (
            <span key={item.label} className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-full border border-white shadow-sm" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div
        ref={mapRef}
        className="rounded-xl border bg-muted overflow-hidden"
        style={{ height: 460 }}
        data-testid="provider-map"
      />

      {selectedProvider && (
        <div className="rounded-lg border bg-card p-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="font-semibold">
              {`${selectedProvider.user?.firstName ?? ""} ${selectedProvider.user?.lastName ?? ""}`.trim()}
            </p>
            <p className="text-sm text-muted-foreground capitalize">
              {(selectedProvider as any).providerType ?? "Provider"}
              {(selectedProvider.user as any)?.city ? ` • ${(selectedProvider.user as any).city}` : ""}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm">{Number((selectedProvider as any).rating ?? 0).toFixed(1)}</span>
              <Badge variant="outline" className="text-xs ml-2">
                {(selectedProvider as any).status}
              </Badge>
            </div>
          </div>
          <Button asChild size="sm">
            <Link href={`/provider/${selectedProvider.id}`}>
              {t("common.view_profile", "View Profile")}
            </Link>
          </Button>
        </div>
      )}

      {providersWithCoords.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-4">
          {t("providers.map_hint", "Provider locations appear on the map once they set up their clinic address.")}
        </p>
      )}
    </div>
  );
}

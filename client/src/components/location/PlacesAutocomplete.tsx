/**
 * PlacesAutocomplete — reusable Google Places autocomplete input.
 *
 * Uses the Google Maps JS API (loaded via @vis.gl/react-google-maps APIProvider).
 * Falls back to a plain <Input> when no API key is set so the rest of the form
 * still works without Maps configured.
 *
 * Usage:
 *   <PlacesAutocomplete
 *     value={address}
 *     onChange={(text, structured) => { ... }}
 *     placeholder="Enter address"
 *   />
 */

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    google: any;
  }
}

export interface StructuredAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  formattedAddress?: string;
  placeId?: string;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (rawText: string, structured?: StructuredAddress) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

const MAPS_KEY = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let mapsLoaded = false;
let mapsLoading = false;
const mapsCallbacks: Array<() => void> = [];

function loadMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve) => {
    if (mapsLoaded) { resolve(); return; }
    mapsCallbacks.push(resolve);
    if (mapsLoading) return;
    mapsLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      mapsLoaded = true;
      mapsCallbacks.forEach((cb) => cb());
      mapsCallbacks.length = 0;
    };
    document.head.appendChild(script);
  });
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder = "Enter address",
  className,
  disabled,
  "data-testid": testId,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!MAPS_KEY) return;

    setLoading(true);
    loadMapsScript(MAPS_KEY).then(() => {
      setReady(true);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || autocompleteRef.current) return;

    const ac = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["address"],
      fields: [
        "formatted_address",
        "geometry",
        "place_id",
        "address_components",
      ],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place?.geometry?.location) return;

      const structured = parsePlaceResult(place);
      onChange(place.formatted_address ?? "", structured);
    });

    autocompleteRef.current = ac;

    return () => {
      window.google?.maps?.event?.clearInstanceListeners(ac);
    };
  }, [ready, onChange]);

  return (
    <div className="relative">
      <MapPin className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin pointer-events-none" />
      )}
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={MAPS_KEY ? placeholder : placeholder + " (type manually)"}
        className={cn("pl-9", className)}
        disabled={disabled}
        data-testid={testId}
        autoComplete="off"
      />
    </div>
  );
}

function parsePlaceResult(place: any): StructuredAddress {
  const components: any[] = place.address_components ?? [];

  const getComp = (types: string[]): string =>
    components.find((c: any) =>
      types.some((t) => c.types.includes(t)),
    )?.long_name ?? "";
  const getShort = (types: string[]): string =>
    components.find((c: any) =>
      types.some((t) => c.types.includes(t)),
    )?.short_name ?? "";

  const streetNumber = getComp(["street_number"]);
  const route = getComp(["route"]);
  const addressLine1 =
    [streetNumber, route].filter(Boolean).join(" ") || undefined;

  return {
    addressLine1,
    city:
      getComp(["locality", "postal_town", "sublocality_level_1"]) || undefined,
    state: getComp(["administrative_area_level_1"]) || undefined,
    postalCode: getShort(["postal_code"]) || undefined,
    country: getComp(["country"]) || undefined,
    latitude: place.geometry?.location?.lat(),
    longitude: place.geometry?.location?.lng(),
    formattedAddress: place.formatted_address,
    placeId: place.place_id,
  };
}

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MapPin, LocateFixed, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export type PickedLocation = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

interface LocationPickerProps {
  value: PickedLocation;
  onChange: (loc: PickedLocation) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
}

const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || "";

const DEFAULT_CENTER = { lat: 47.4979, lng: 19.0402 }; // Budapest

export function LocationPicker({
  value,
  onChange,
  required,
  label,
  placeholder,
}: LocationPickerProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isLocating, setIsLocating] = useState(false);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast({
        title: t("location.geolocation_unsupported", "Geolocation not supported"),
        variant: "destructive",
      });
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        onChange({ ...value, latitude: lat, longitude: lng });
        if (apiKey) {
          // Reverse geocode handled by inner component when coords change
        }
        setIsLocating(false);
      },
      (err) => {
        setIsLocating(false);
        toast({
          title: t("location.geolocation_failed", "Could not get location"),
          description: err.message,
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  if (!apiKey) {
    return (
      <div className="space-y-2">
        {label && (
          <Label htmlFor="address">
            {label} {required ? <span className="text-destructive">*</span> : null}
          </Label>
        )}
        <div className="relative">
          <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            id="address"
            placeholder={placeholder || t("location.enter_address", "Enter your full address")}
            value={value.address}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            className="pl-9"
            data-testid="input-address"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={useMyLocation}
            disabled={isLocating}
            data-testid="button-use-location"
          >
            <LocateFixed className="h-4 w-4 mr-2" />
            {isLocating
              ? t("location.locating", "Locating...")
              : t("location.use_my_location", "Use my current location")}
          </Button>
          {value.latitude != null && value.longitude != null && (
            <span className="text-xs text-muted-foreground">
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            "location.maps_disabled_hint",
            "Map view will appear here once a Google Maps API key is configured."
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {label && (
        <Label htmlFor="address">
          {label} {required ? <span className="text-destructive">*</span> : null}
        </Label>
      )}
      <APIProvider apiKey={apiKey} libraries={["places"]}>
        <LocationPickerInner
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          isLocating={isLocating}
          onUseMyLocation={useMyLocation}
        />
      </APIProvider>
    </div>
  );
}

function LocationPickerInner({
  value,
  onChange,
  placeholder,
  isLocating,
  onUseMyLocation,
}: {
  value: PickedLocation;
  onChange: (loc: PickedLocation) => void;
  placeholder?: string;
  isLocating: boolean;
  onUseMyLocation: () => void;
}) {
  const { t } = useTranslation();
  const map = useMap();
  const placesLib = useMapsLibrary("places");
  const geocodingLib = useMapsLibrary("geocoding");
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const [searchText, setSearchText] = useState(value.address || "");

  const center =
    value.latitude != null && value.longitude != null
      ? { lat: value.latitude, lng: value.longitude }
      : DEFAULT_CENTER;

  useEffect(() => {
    if (geocodingLib && !geocoderRef.current) {
      geocoderRef.current = new geocodingLib.Geocoder();
    }
  }, [geocodingLib]);

  useEffect(() => {
    if (!placesLib || !inputRef.current || autocompleteRef.current) return;
    const ac = new placesLib.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry", "name"],
    });
    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      if (!place.geometry?.location) return;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const addr = place.formatted_address || place.name || "";
      setSearchText(addr);
      onChange({ address: addr, latitude: lat, longitude: lng });
      if (map) {
        map.panTo({ lat, lng });
        map.setZoom(16);
      }
    });
    autocompleteRef.current = ac;
  }, [placesLib, map, onChange]);

  useEffect(() => {
    if (!map) return;
    if (value.latitude != null && value.longitude != null) {
      map.panTo({ lat: value.latitude, lng: value.longitude });
    }
  }, [map, value.latitude, value.longitude]);

  // Reverse geocode when coords change but address is empty (e.g. after geolocate)
  useEffect(() => {
    if (
      geocoderRef.current &&
      value.latitude != null &&
      value.longitude != null &&
      !value.address
    ) {
      geocoderRef.current.geocode(
        { location: { lat: value.latitude, lng: value.longitude } },
        (results, status) => {
          if (status === "OK" && results && results[0]) {
            const addr = results[0].formatted_address;
            setSearchText(addr);
            onChange({
              address: addr,
              latitude: value.latitude,
              longitude: value.longitude,
            });
          }
        }
      );
    }
  }, [value.latitude, value.longitude, value.address, onChange]);

  const handleMapClick = (ev: any) => {
    const lat = ev?.detail?.latLng?.lat;
    const lng = ev?.detail?.latLng?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return;
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
        const addr =
          status === "OK" && results && results[0] ? results[0].formatted_address : "";
        setSearchText(addr);
        onChange({ address: addr, latitude: lat, longitude: lng });
      });
    } else {
      onChange({ address: value.address, latitude: lat, longitude: lng });
    }
  };

  const handleMarkerDragEnd = (ev: any) => {
    const lat = ev?.latLng?.lat?.();
    const lng = ev?.latLng?.lng?.();
    if (typeof lat !== "number" || typeof lng !== "number") return;
    if (geocoderRef.current) {
      geocoderRef.current.geocode({ location: { lat, lng } }, (results, status) => {
        const addr =
          status === "OK" && results && results[0] ? results[0].formatted_address : "";
        setSearchText(addr);
        onChange({ address: addr, latitude: lat, longitude: lng });
      });
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder={placeholder || t("location.search_address", "Search for an address")}
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            onChange({ ...value, address: e.target.value });
          }}
          className="pl-9"
          data-testid="input-address"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onUseMyLocation}
          disabled={isLocating}
          data-testid="button-use-location"
        >
          <LocateFixed className="h-4 w-4 mr-2" />
          {isLocating
            ? t("location.locating", "Locating...")
            : t("location.use_my_location", "Use my current location")}
        </Button>
        {value.latitude != null && value.longitude != null && (
          <span className="text-xs text-muted-foreground">
            {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
          </span>
        )}
      </div>
      <div className="h-64 w-full rounded-lg overflow-hidden border">
        <Map
          defaultCenter={center}
          defaultZoom={value.latitude != null ? 16 : 12}
          gestureHandling="greedy"
          disableDefaultUI={false}
          mapId="bookingLocationPicker"
          onClick={handleMapClick}
          data-testid="location-map"
        >
          {value.latitude != null && value.longitude != null && (
            <AdvancedMarker
              position={{ lat: value.latitude, lng: value.longitude }}
              draggable
              onDragEnd={handleMarkerDragEnd}
            />
          )}
        </Map>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          "location.map_hint",
          "Click on the map or drag the pin to fine-tune the exact spot."
        )}
      </p>
    </div>
  );
}

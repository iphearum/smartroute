"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouteStore } from "@/features/routes/store/route-store";
import { MapControlButton } from "@/shared/ui/map-controls";
import { MapLayerSettings } from "./map-layer-settings";
import { ProfileMenu } from "@/features/auth/components/profile-menu";

function dispatchMapEvent(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

const subscribeToHydration = () => () => {};

function useClientReady() {
  return useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
}

export function MapActionControls() {
  const locationRequestRunning = useRef(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null),
    [locating, setLocating] = useState(false),
    hasRoute = useRouteStore((state) => state.routes.length > 0),
    clientReady = useClientReady();

  useEffect(() => {
    const showError = (event: Event) =>
      setLocationStatus((event as CustomEvent<string>).detail);
    window.addEventListener("smartroute:location-error", showError);
    return () =>
      window.removeEventListener("smartroute:location-error", showError);
  }, []);

  useEffect(() => {
    if (!locationStatus) return;
    const timer = window.setTimeout(() => setLocationStatus(null), 7_000);
    return () => window.clearTimeout(timer);
  }, [locationStatus]);

  const locate = () => {
    if (locationRequestRunning.current) return;
    if (!window.isSecureContext) {
      setLocationStatus("Location requires a secure HTTPS connection.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("Location is not available on this device.");
      return;
    }
    locationRequestRunning.current = true;
    setLocating(true);
    setLocationStatus(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        locationRequestRunning.current = false;
        setLocating(false);
        dispatchMapEvent("smartroute:show-current-location", {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
      },
      (error) => {
        locationRequestRunning.current = false;
        setLocating(false);
        setLocationStatus(
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied. Allow it in device Settings, then try again."
            : error.code === error.TIMEOUT
              ? "Location timed out. Check Location Services and try again."
              : "Your current location is unavailable. Check Location Services.",
        );
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  };

  return (
    <div className="right-pannel-control absolute flex flex-col gap-2">
      <ProfileMenu />
      <div className="relative">
        <MapLayerSettings>
          <MapControlButton
            onClick={locate}
            aria-label={locating ? "Finding my location" : "Go to my location"}
            aria-busy={locating}
            disabled={locating}
            className={locating ? "is-locating" : undefined}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m5 11 14-6-6 14-2.3-5.7L5 11Z" />
            </svg>
          </MapControlButton>
          <MapControlButton
            onClick={() => dispatchMapEvent("smartroute:focus-selected-route")}
            aria-label="Focus selected route"
            disabled={!clientReady || !hasRoute}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 4H4v5M15 4h5v5M9 20H4v-5m11 5h5v-5" />
            </svg>
          </MapControlButton>
          <MapControlButton
            onClick={() => dispatchMapEvent("smartroute:reset-map-view")}
            aria-label="Reset map view north"
          >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z" />
          </svg>
          </MapControlButton>
        </MapLayerSettings>
        {locationStatus && (
          <p className="map-location-status" role="alert">
            {locationStatus}
          </p>
        )}
      </div>
    </div>
  );
}

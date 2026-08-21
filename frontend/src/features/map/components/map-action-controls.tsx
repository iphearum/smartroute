"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouteStore } from "@/features/routes/store/route-store";
import { MapControlButton } from "@/shared/ui/map-controls";
import { FiCompass, FiMaximize, FiNavigation } from "react-icons/fi";
import { MapLayerSettings } from "./map-layer-settings";
import { ProfileMenu } from "@/features/auth/components/profile-menu";
import { useI18n } from "@/features/i18n/use-i18n";

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

export function MapActionControls({
  assistantOpen = false,
  assistantWidth = 400,
}: {
  assistantOpen?: boolean;
  assistantWidth?: number;
}) {
  const locationRequestRunning = useRef(false);
  const [locationStatus, setLocationStatus] = useState<string | null>(null),
    [locating, setLocating] = useState(false),
    hasRoute = useRouteStore((state) => state.routes.length > 0),
    clientReady = useClientReady();
  const t = useI18n();

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

  useEffect(() => {
    const requestLocation = () => locate();
    window.addEventListener(
      "smartroute:request-current-location",
      requestLocation,
    );
    return () =>
      window.removeEventListener(
        "smartroute:request-current-location",
        requestLocation,
      );
  }, []);

  return (
    <div
      className="right-pannel-control absolute flex flex-col gap-2 transition-[right] duration-300"
      style={{
        right: assistantOpen
          ? `min(${assistantWidth + 18}px, 100vw)`
          : undefined,
      }}
    >
      <ProfileMenu />
      <div className="relative">
        <MapLayerSettings>
          <MapControlButton
            onClick={locate}
            aria-label={
              locating
                ? t("map.actions.findingLocation", "Finding my location")
                : t("map.actions.goToLocation", "Go to my location")
            }
            aria-busy={locating}
            disabled={locating}
            className={locating ? "is-locating" : undefined}
          >
            <FiNavigation aria-hidden="true" />
          </MapControlButton>
          <MapControlButton
            onClick={() => dispatchMapEvent("smartroute:focus-selected-route")}
            aria-label={t("map.actions.focusRoute", "Focus selected route")}
            disabled={!clientReady || !hasRoute}
          >
            <FiMaximize aria-hidden="true" />
          </MapControlButton>
          <MapControlButton
            onClick={() => dispatchMapEvent("smartroute:reset-map-view")}
            aria-label={t("map.actions.resetNorth", "Reset map view north")}
          >
            <FiCompass aria-hidden="true" />
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

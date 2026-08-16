"use client";

import { useEffect, useState } from "react";

function dispatchMapEvent(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export function MapActionControls() {
  const [isFullscreen, setIsFullscreen] = useState(false),
    [locationStatus, setLocationStatus] = useState<string | null>(null),
    [locating, setLocating] = useState(false);

  useEffect(() => {
    const update = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

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
    if (!window.isSecureContext) {
      setLocationStatus("Location requires a secure HTTPS connection.");
      return;
    }
    if (!navigator.geolocation) {
      setLocationStatus("Location is not available on this device.");
      return;
    }
    setLocating(true);
    setLocationStatus(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        dispatchMapEvent("smartroute:show-current-location", {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        });
      },
      (error) => {
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

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (document.fullscreenEnabled)
      await document.documentElement.requestFullscreen();
  };

  return (
    <>
      <div
        className="map-action-controls liquid-card"
        role="group"
        aria-label="Map controls"
      >
        <button
          type="button"
          onClick={locate}
          aria-label={locating ? "Finding my location" : "Go to my location"}
          aria-busy={locating}
          className={locating ? "is-locating" : undefined}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 11 14-6-6 14-2.3-5.7L5 11Z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 4H4v5M15 4h5v5M9 20H4v-5m11 5h5v-5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => dispatchMapEvent("smartroute:reset-map-view")}
          aria-label="Reset map view north"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" />
            <path d="m12 5 3 8-3-1.5L9 13l3-8Z" />
            <path d="M12 2v2M12 20v2" />
          </svg>
        </button>
      </div>
      {locationStatus && (
        <p className="map-location-status" role="alert">
          {locationStatus}
        </p>
      )}
    </>
  );
}

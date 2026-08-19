"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Place } from "@/features/routes/domain/types";
import { routesApi } from "@/features/routes/api/routes-api";
import { placeName, type MapLanguage } from "@/features/i18n/language";

export function useViewportPlaces(
  map: React.RefObject<MapLibreMap | null>,
  mapReady: boolean,
  language: MapLanguage,
) {
  const [places, setPlaces] = useState<Place[]>([]),
    loadedBounds = useRef<{
      south: number;
      west: number;
      north: number;
      east: number;
      zoom: number;
    } | null>(null);

  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !mapReady) return;
    let controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      active = true;
    const indicator = document.getElementById("map-data-loading");
    const load = () => {
      const visibleBounds = currentMap.getBounds(),
        zoom = currentMap.getZoom(),
        // Wider low-zoom viewports cover far more ground per request, but a
        // tighter high-zoom view benefits from pulling in everything nearby
        // since the area itself is already small.
        placesLimit =
          zoom >= 18 ? 1000 : zoom >= 16 ? 750 : zoom >= 14 ? 500 : 250;
      if (zoom < 12) {
        loadedBounds.current = null;
        setPlaces((current) => (current.length ? [] : current));
        return;
      }
      const loaded = loadedBounds.current;
      if (
        loaded &&
        // A wide, low-zoom fetch is capped at a small `limit`, so once the
        // user zooms in meaningfully further, that leftover data is too
        // sparse for the tighter view even though it still geographically
        // contains it -- refetch instead of quietly showing whatever
        // handful of far-flung places survived the earlier cap.
        zoom <= loaded.zoom + 1 &&
        visibleBounds.getSouth() >= loaded.south &&
        visibleBounds.getWest() >= loaded.west &&
        visibleBounds.getNorth() <= loaded.north &&
        visibleBounds.getEast() <= loaded.east
      )
        return;
      controller?.abort();
      controller = new AbortController();
      const latPadding =
          (visibleBounds.getNorth() - visibleBounds.getSouth()) * 0.35,
        lonPadding = (visibleBounds.getEast() - visibleBounds.getWest()) * 0.35,
        bounds = {
          south: visibleBounds.getSouth() - latPadding,
          west: visibleBounds.getWest() - lonPadding,
          north: visibleBounds.getNorth() + latPadding,
          east: visibleBounds.getEast() + lonPadding,
        };
      indicator?.classList.replace("hidden", "flex");
      routesApi
        .viewportPlaces(
          {
            south: bounds.south,
            west: bounds.west,
            north: bounds.north,
            east: bounds.east,
          },
          placesLimit,
          controller.signal,
        )
        .then((items) => {
          if (!active) return;
          loadedBounds.current = { ...bounds, zoom };
          setPlaces(
            items.map((place) => ({
              ...place,
              name: placeName(place, language),
            })),
          );
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
        })
        .finally(() => {
          if (active && !controller?.signal.aborted)
            indicator?.classList.replace("flex", "hidden");
        });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    currentMap.on("moveend", schedule);
    load();
    return () => {
      active = false;
      loadedBounds.current = null;
      controller?.abort();
      if (timer) clearTimeout(timer);
      currentMap.off("moveend", schedule);
      indicator?.classList.replace("flex", "hidden");
    };
  }, [map, mapReady, language]);

  return places;
}

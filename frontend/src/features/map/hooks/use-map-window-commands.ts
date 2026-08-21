"use client";
import { useRef } from "react";
import type { FeatureCollection, Polygon } from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useWindowEvent } from "@/shared/hooks/use-window-event";

// Wires the `smartroute:*` custom window events that other parts of the app
// (search results, the "locate me" button, route selection, etc.) dispatch
// to drive the map without a direct prop/ref dependency on this component.
export function useMapWindowCommands(
  map: React.RefObject<MapLibreMap | null>,
  maplibre: React.RefObject<typeof import("maplibre-gl") | null>,
) {
  const currentLocationMarker = useRef<MapLibreMarker | null>(null);

  useWindowEvent("smartroute:focus-coordinate", (event) => {
    const detail = (
      event as CustomEvent<{ latitude: number; longitude: number }>
    ).detail;
    if (Number.isFinite(detail?.latitude) && Number.isFinite(detail?.longitude))
      map.current?.flyTo({
        center: [detail.longitude, detail.latitude],
        zoom: 16,
        duration: 600,
      });
  });

  useWindowEvent("smartroute:show-current-location", (event) => {
    const detail = (
      event as CustomEvent<{
        latitude: number;
        longitude: number;
        accuracy?: number;
      }>
    ).detail;
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker;
    if (
      !currentMap ||
      !MapMarker ||
      !Number.isFinite(detail?.latitude) ||
      !Number.isFinite(detail?.longitude)
    )
      return;
    const accuracy = Number.isFinite(detail.accuracy)
        ? Math.max(0, detail.accuracy || 0)
        : 0,
      latitude = detail.latitude,
      longitude = detail.longitude,
      ring: [number, number][] = [];
    if (accuracy > 0) {
      const latRadius = accuracy / 111_320,
        lonRadius = accuracy / (111_320 * Math.cos((latitude * Math.PI) / 180));
      for (let index = 0; index <= 48; index++) {
        const angle = (index / 48) * Math.PI * 2;
        ring.push([
          longitude + Math.cos(angle) * lonRadius,
          latitude + Math.sin(angle) * latRadius,
        ]);
      }
    }
    const data: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: ring.length
        ? [
            {
              type: "Feature",
              properties: { kind: "accuracy" },
              geometry: { type: "Polygon", coordinates: [ring] },
            },
          ]
        : [],
    };
    (
      currentMap.getSource("current-location") as GeoJSONSource | undefined
    )?.setData(data);
    if (!currentLocationMarker.current) {
      const markerElement = document.createElement("div");
      markerElement.className = "current-location-marker";
      markerElement.setAttribute("role", "img");
      markerElement.setAttribute("aria-label", "Your current location");
      markerElement.innerHTML =
        '<span class="current-location-wave wave-one"></span><span class="current-location-wave wave-two"></span><span class="current-location-dot"></span>';
      currentLocationMarker.current = new MapMarker({
        element: markerElement,
        anchor: "center",
      })
        .setLngLat([longitude, latitude])
        .addTo(currentMap);
    } else currentLocationMarker.current.setLngLat([longitude, latitude]);
    currentMap.stop();
    currentMap.flyTo({
      center: [longitude, latitude],
      zoom: Math.max(currentMap.getZoom(), 16),
      duration: 600,
    });
  });

  useWindowEvent("smartroute:reset-map-view", () =>
    map.current?.easeTo({
      center: [104.9282, 11.5564],
      zoom: 12,
      duration: 600,
    }),
  );

  useWindowEvent("smartroute:clear-route-points", () => {
    const state = useRouteStore.getState();
    state.points.forEach((_, index) => state.clearPoint(index));
  });

  useWindowEvent("smartroute:focus-selected-route", () => {
    const currentMap = map.current,
      MapBounds = maplibre.current?.LngLatBounds,
      state = useRouteStore.getState(),
      route = state.routes[state.selectedRoute];
    if (!currentMap || !MapBounds || !route?.geometry.length) return;
    const bounds = new MapBounds();
    [...route.geometry, ...(route.connectors || []).flat()].forEach((point) =>
      bounds.extend(point),
    );
    currentMap.fitBounds(bounds, {
      padding: { top: 70, right: 60, bottom: 60, left: 420 },
      maxZoom: 16,
      duration: 600,
    });
  });
}

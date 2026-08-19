"use client";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Coordinate } from "@/features/routes/domain/types";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { routesApi } from "@/features/routes/api/routes-api";
import { MarkerLayer } from "@/features/map/lib/marker-layer";
import { nearestPlaceLabel } from "@/features/map/lib/place-label";
import { PinLocation } from "@/shared/ui/pin";

export function useRouteEndpointMarkers(
  map: React.RefObject<MapLibreMap | null>,
  maplibre: React.RefObject<typeof import("maplibre-gl") | null>,
  mapReady: boolean,
  coordinates: (Coordinate | null)[],
  calculatePoint: ReturnType<typeof useRouteCalculation>["calculatePoint"],
  routesVisible: boolean,
) {
  const layer = useRef(new MarkerLayer()).current;

  useEffect(() => {
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker;
    if (!MapMarker || !currentMap || !mapReady) return;
    layer.clear();
    if (!routesVisible) return;
    coordinates.forEach((point, index) => {
      if (!point) return;
      const color =
          index === 0
            ? "#047857"
            : index === coordinates.length - 1
              ? "#ef4444"
              : "#6366f1",
        element = document.createElement("div");
      element.className = "route-endpoint-marker";
      element.title =
        index === 0
          ? "Starting point"
          : index === coordinates.length - 1
            ? "Destination"
            : `Stop ${index}`;
      element.innerHTML = renderToStaticMarkup(
        <PinLocation
          size={34}
          color={color}
          stroke="white"
          strokeWidth={4}
          strokeLinejoin="round"
          paintOrder="stroke"
          style={{ filter: "drop-shadow(0 2px 3px rgb(15 23 42 / 35%))" }}
        />,
      );
      const marker = new MapMarker({
        element,
        draggable: true,
        anchor: "bottom",
      })
        .setLngLat([point[1], point[0]])
        .addTo(currentMap);
      marker.on("dragend", async () => {
        const value = marker.getLngLat(),
          next: Coordinate = [value.lat, value.lng],
          moved = await calculatePoint(index, next);
        if (!moved) return;
        let name = "Pinned location";
        try {
          name = nearestPlaceLabel(await routesApi.nearest(next));
        } catch {}
        useRouteStore.getState().setPoint(index, {
          name,
          latitude: next[0],
          longitude: next[1],
        });
      });
      layer.add(marker);
    });
  }, [map, maplibre, coordinates, calculatePoint, mapReady, routesVisible, layer]);
}

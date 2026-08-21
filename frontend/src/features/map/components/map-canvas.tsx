"use client";
import { useCallback } from "react";
import type { Coordinate } from "@/features/routes/domain/types";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { routesApi } from "@/features/routes/api/routes-api";
import type { MapLanguage } from "@/features/i18n/language";
import { nearestPlaceLabel } from "@/features/map/lib/place-label";
import { useMaplibreMap } from "@/features/map/hooks/use-maplibre-map";
import { useMapLayerVisibility } from "@/features/map/hooks/use-map-layer-visibility";
import { useMapWindowCommands } from "@/features/map/hooks/use-map-window-commands";
import { useViewportPlaces } from "@/features/map/hooks/use-viewport-places";
import { useRouteEndpointMarkers } from "@/features/map/hooks/use-route-endpoint-markers";
import { usePoiMarkers } from "@/features/map/hooks/use-poi-markers";
import { useRouteLayer } from "@/features/map/hooks/use-route-layer";
import { useLatestRef } from "@/shared/hooks/use-latest-ref";
import type { MapLayerVisibility } from "@/shared/state/app-shell-context";
import { MapControlButton, MapControlGroup } from "@/shared/ui/map-controls";
import { FiMinus, FiPlus } from "react-icons/fi";

export function MapCanvas({
  poiFilters = [],
  language = "en",
  layerVisibility,
  assistantOpen = false,
  assistantWidth = 400,
}: {
  poiFilters?: string[];
  language?: MapLanguage;
  layerVisibility: MapLayerVisibility;
  assistantOpen?: boolean;
  assistantWidth?: number;
}) {
  const coordinates = useRouteStore((s) => s.coordinates),
    routes = useRouteStore((s) => s.routes),
    selected = useRouteStore((s) => s.selectedRoute),
    mode = useRouteStore((s) => s.mode),
    setSelectedRoute = useRouteStore((s) => s.setSelectedRoute),
    { calculatePoint } = useRouteCalculation();
  const calculatePointRef = useLatestRef(calculatePoint);

  const onMapClick = useCallback(
    async (coordinate: Coordinate) => {
      const index = useRouteStore.getState().activePoint,
        moved = await calculatePointRef.current?.(index, coordinate, {
          name: "Pinned location",
          latitude: coordinate[0],
          longitude: coordinate[1],
        });
      if (!moved) return;
      try {
        const nearest = await routesApi.nearest(coordinate);
        useRouteStore.getState().setPoint(index, {
          name: nearestPlaceLabel(nearest),
          latitude: coordinate[0],
          longitude: coordinate[1],
        });
      } catch {}
    },
    [calculatePointRef],
  );

  const { elementRef, map, maplibre, mapReady } = useMaplibreMap({
    onMapClick,
  });
  useMapLayerVisibility(map, mapReady, layerVisibility);
  useMapWindowCommands(map, maplibre);
  const places = useViewportPlaces(map, mapReady, language);
  useRouteEndpointMarkers(
    map,
    maplibre,
    mapReady,
    coordinates,
    calculatePoint,
    layerVisibility.routes,
  );
  usePoiMarkers(
    map,
    maplibre,
    mapReady,
    places,
    poiFilters,
    layerVisibility.places,
    calculatePointRef,
  );
  useRouteLayer(
    map,
    maplibre,
    mapReady,
    routes,
    selected,
    mode,
    setSelectedRoute,
    layerVisibility.routes,
  );

  return (
    <div
      className="absolute inset-y-0 left-0 transition-[right] duration-300 ease-out"
      style={{ right: assistantOpen ? `min(${assistantWidth}px, 100vw)` : 0 }}
    >
      <div
        ref={elementRef}
        className="absolute inset-0"
        aria-label="Interactive route map"
      />
      <MapControlGroup className="map-zoom-controls" label="Map zoom">
        <MapControlButton
          onClick={() => map.current?.zoomIn({ duration: 240 })}
          aria-label="Zoom in"
        >
          <FiPlus aria-hidden="true" />
        </MapControlButton>
        <MapControlButton
          onClick={() => map.current?.zoomOut({ duration: 240 })}
          aria-label="Zoom out"
        >
          <FiMinus aria-hidden="true" />
        </MapControlButton>
      </MapControlGroup>
    </div>
  );
}

"use client";
import { useEffect } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { MapLayerVisibility } from "@/shared/state/app-shell-context";

export function useMapLayerVisibility(
  map: React.RefObject<MapLibreMap | null>,
  mapReady: boolean,
  layerVisibility: MapLayerVisibility,
) {
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !mapReady) return;
    const groups: Record<
      Exclude<keyof MapLayerVisibility, "places" | "routes">,
      string[]
    > = {
      roads: ["road-casing", "roads", "road-labels-major", "road-labels-minor"],
      buildings: ["buildings"],
      land: ["landcover", "landuse", "parks"],
      water: ["water", "waterways", "water-labels"],
      boundaries: ["boundaries"],
    };
    for (const [group, layerIds] of Object.entries(groups))
      for (const layerId of layerIds)
        if (currentMap.getLayer(layerId))
          currentMap.setLayoutProperty(
            layerId,
            "visibility",
            layerVisibility[group as keyof typeof groups] ? "visible" : "none",
          );
    for (const layerId of ["place-labels-region", "place-labels-local"])
      if (currentMap.getLayer(layerId))
        currentMap.setLayoutProperty(
          layerId,
          "visibility",
          layerVisibility.places ? "visible" : "none",
        );
    for (const layerId of ["route-outline", "route-line", "route-connectors"])
      if (currentMap.getLayer(layerId))
        currentMap.setLayoutProperty(
          layerId,
          "visibility",
          layerVisibility.routes ? "visible" : "none",
        );
  }, [map, layerVisibility, mapReady]);
}

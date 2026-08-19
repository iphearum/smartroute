"use client";
import { useEffect, useRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FeatureCollection, LineString } from "geojson";
import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { RouteOption, TravelMode } from "@/features/routes/domain/types";
import { MotorbikeIcon } from "@/shared/ui/motorbike-icon";
import { BikeIcon, CarIcon, WalkIcon } from "@/shared/ui/vehicle-icons";
import { MarkerLayer } from "@/features/map/lib/marker-layer";
import { vehicleAtRoutePoint } from "@/features/map/lib/route-geometry";

// Draws the selected/candidate route lines, the floating duration/distance
// labels (with simple collision avoidance so overlapping routes stay
// legible), and mode-transfer markers.
export function useRouteLayer(
  map: React.RefObject<MapLibreMap | null>,
  maplibre: React.RefObject<typeof import("maplibre-gl") | null>,
  mapReady: boolean,
  routes: RouteOption[],
  selected: number,
  mode: TravelMode,
  setSelectedRoute: (index: number) => void,
  routesVisible: boolean,
) {
  const layer = useRef(new MarkerLayer()).current;

  useEffect(() => {
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker;
    if (!MapMarker || !currentMap || !mapReady) return;
    layer.clear();
    const features: FeatureCollection<LineString>["features"] = [];
    const drawOrder = routes
      .map((route, index) => ({ route, index }))
      .sort(
        (a, b) => Number(a.index === selected) - Number(b.index === selected),
      );
    drawOrder.forEach(({ route, index }) => {
      const active = index === selected,
        geometries = route.segments?.length
          ? route.segments.map((segment) => segment.geometry)
          : [route.geometry];
      geometries.forEach(
        (geometry, segmentIndex) =>
          geometry.length > 1 &&
          features.push({
            type: "Feature",
            properties: {
              kind: "route",
              routeIndex: index,
              active,
              mode: route.segments?.[segmentIndex]?.mode ?? mode,
            },
            geometry: { type: "LineString", coordinates: geometry },
          }),
      );
    });
    (routes[selected]?.connectors || []).forEach(
      (connector) =>
        connector.length > 1 &&
        features.push({
          type: "Feature",
          properties: { kind: "connector", routeIndex: selected, active: true },
          geometry: { type: "LineString", coordinates: connector },
        }),
    );
    (currentMap.getSource("routes") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features,
    });
    const chosen = routes[selected];
    if (chosen && routesVisible) {
      const bounds = new maplibre.current!.LngLatBounds();
      [...chosen.geometry, ...(chosen.connectors || []).flat()].forEach(
        (point) => bounds.extend(point),
      );
      currentMap.fitBounds(bounds, {
        padding: { top: 70, right: 60, bottom: 60, left: 420 },
        maxZoom: 16,
      });
    }
    const occupiedLabelPoints: { x: number; y: number }[] = [];
    if (!routesVisible) return;
    routes.forEach((route, index) => {
      if (!route.geometry.length) return;
      const preferredFraction = Math.min(0.8, 0.32 + index * 0.18),
        candidateFractions = [
          ...new Set([preferredFraction, 0.5, 0.3, 0.7, 0.15, 0.85]),
        ],
        candidates = candidateFractions.map((fraction) => {
          const [longitude, latitude] =
            route.geometry[
              Math.min(
                route.geometry.length - 1,
                Math.round((route.geometry.length - 1) * fraction),
              )
            ];
          return {
            longitude,
            latitude,
            point: currentMap.project([longitude, latitude]),
          };
        }),
        labelPosition =
          candidates.find((candidate) =>
            occupiedLabelPoints.every(
              (point) =>
                Math.abs(candidate.point.x - point.x) >= 112 ||
                Math.abs(candidate.point.y - point.y) >= 64,
            ),
          ) ?? candidates[0],
        lon = labelPosition.longitude,
        lat = labelPosition.latitude,
        active = index === selected,
        minutes = Math.max(1, Math.round(route.duration / 60)),
        distance = (route.length / 1000).toFixed(1),
        vehicleMode = vehicleAtRoutePoint(
          route,
          lon,
          lat,
          mode === "combined" ? "motorbike" : mode,
        ),
        VehicleIcon = {
          car: CarIcon,
          motorbike: MotorbikeIcon,
          bike: BikeIcon,
          walk: WalkIcon,
        }[vehicleMode],
        symbol = renderToStaticMarkup(<VehicleIcon />);
      occupiedLabelPoints.push(labelPosition.point);
      const mapPoint = labelPosition.point,
        mapWidth = currentMap.getCanvas().clientWidth,
        pointerPosition =
          mapPoint.x < 120
            ? "left"
            : mapPoint.x > mapWidth - 120
              ? "right"
              : (["left", "center", "right"] as const)[index % 3],
        pointerAnchor = { left: 18, center: 48, right: 78 }[pointerPosition],
        element = document.createElement("div");
      element.className = "route-info-icon";
      element.innerHTML = `<button type="button" class="route-info-label pointer-${pointerPosition}${active ? " active" : ""}" aria-label="Select ${minutes} minute ${vehicleMode} route"><span><i class="route-vehicle" aria-hidden="true">${symbol}</i><strong>${minutes} min</strong></span><small>${distance} km</small></button>`;
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedRoute(index);
      });
      const label = new MapMarker({
        element,
        anchor: "bottom",
        offset: [48 - pointerAnchor, 0],
      })
        .setLngLat([lon, lat])
        .addTo(currentMap);
      layer.add(label);
    });
    routes[selected]?.transfers?.forEach((transfer) => {
      const element = document.createElement("div");
      element.className = "route-transfer-marker";
      element.textContent = "⇄";
      element.title = "Transfer from car to motorbike";
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", element.title);
      layer.add(
        new MapMarker({ element, anchor: "center" })
          .setLngLat(transfer.coordinate)
          .addTo(currentMap),
      );
    });
  }, [
    map,
    maplibre,
    routes,
    selected,
    mode,
    setSelectedRoute,
    mapReady,
    routesVisible,
    layer,
  ]);
}

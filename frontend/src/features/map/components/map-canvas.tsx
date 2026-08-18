"use client";
import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { FeatureCollection, LineString, Polygon } from "geojson";
import type {
  GeoJSONSource,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
} from "maplibre-gl";
import type {
  Coordinate,
  Place,
  RouteOption,
  TravelMode,
} from "@/features/routes/domain/types";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { routesApi } from "@/features/routes/api/routes-api";
import { placeName, type MapLanguage } from "@/features/i18n/language";
import { PinLocation } from "@/shared/ui/pin";
import { MotorbikeIcon } from "@/shared/ui/motorbike-icon";
import { BikeIcon, CarIcon, WalkIcon } from "@/shared/ui/vehicle-icons";
import {
  basemapMode,
  complexTextGlyphsUrl,
  complexTextPluginUrl,
  localBasemapStyle,
  onlineBasemapStyle,
  worldBasemapLayerId,
} from "@/features/map/basemap-style";
import type { MapLayerVisibility } from "@/shared/state/app-shell-context";
import { MapControlButton, MapControlGroup } from "@/shared/ui/map-controls";

type SegmentMode = Exclude<TravelMode, "combined">;

let complexTextPluginPromise: Promise<void> | null = null;

function ensureComplexTextPlugin(maplibregl: typeof import("maplibre-gl")) {
  const status = maplibregl.getRTLTextPluginStatus();
  if (status === "loaded") return Promise.resolve();
  if (!complexTextPluginPromise && status === "unavailable")
    complexTextPluginPromise = maplibregl.setRTLTextPlugin(
      complexTextPluginUrl,
      false,
    );
  return complexTextPluginPromise ?? Promise.resolve();
}

const cambodiaBounds = {
  west: 102.3,
  south: 10.3,
  east: 107.7,
  north: 14.8,
};

function localBasemapCoversViewport(map: MapLibreMap) {
  const bounds = map.getBounds();
  return (
    map.getZoom() >= 8 &&
    bounds.getWest() >= cambodiaBounds.west &&
    bounds.getSouth() >= cambodiaBounds.south &&
    bounds.getEast() <= cambodiaBounds.east &&
    bounds.getNorth() <= cambodiaBounds.north
  );
}

function vehicleAtRoutePoint(
  route: RouteOption,
  longitude: number,
  latitude: number,
  fallback: SegmentMode,
) {
  let closestDistance = Number.POSITIVE_INFINITY,
    closestMode = fallback;
  for (const segment of route.segments || []) {
    if (!segment.mode) continue;
    for (const [pointLongitude, pointLatitude] of segment.geometry) {
      const distance =
        (pointLongitude - longitude) ** 2 + (pointLatitude - latitude) ** 2;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestMode = segment.mode;
      }
    }
  }
  return closestMode;
}

const poiIcons = {
  food: '<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
  cafe: '<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 2h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2"/>',
  hotel:
    '<path d="M3 20V7m18 13V11a3 3 0 0 0-3-3h-7v8M3 16h18M6 11h5V7a2 2 0 0 0-2-2H6v6Z"/>',
  medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
  shopping: '<path d="M5 8h14l-1 13H6L5 8Zm3 1V6a4 4 0 0 1 8 0v3"/>',
  fuel: '<path d="M5 3h10v18H5V3Zm2 3h6v5H7V6Zm8 1h3l2 3v8a2 2 0 0 1-4 0v-5"/>',
  education:
    '<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c3 3 9 3 12 0v-5M22 9v7"/>',
  finance: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18"/>',
  park: '<path d="M12 3 7 10h3l-5 7h6v4h2v-4h6l-5-7h3l-5-7Z"/>',
  transit: '<path d="M5 4h14v12H5V4Zm3 15h8M8 8h8M8 13h.01M16 13h.01"/>',
  place:
    '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>',
} as const;
function poiAppearance(place: Place) {
  const value =
    `${String(place.metadata?.category_group || "")} ${place.category || ""}`.toLowerCase();
  let key: keyof typeof poiIcons = "place";
  if (/restaurant|fast_food|food|bar|pub/.test(value)) key = "food";
  else if (/cafe|coffee/.test(value)) key = "cafe";
  else if (/hotel|guest|hostel|motel/.test(value)) key = "hotel";
  else if (/hospital|clinic|doctor|dentist|pharmacy|health/.test(value))
    key = "medical";
  else if (/shop|mall|market|supermarket/.test(value)) key = "shopping";
  else if (/fuel|charging/.test(value)) key = "fuel";
  else if (/school|college|university|library/.test(value)) key = "education";
  else if (/bank|atm|finance/.test(value)) key = "finance";
  else if (/park|garden|playground|nature/.test(value)) key = "park";
  else if (/bus|station|transit|ferry/.test(value)) key = "transit";
  return {
    key,
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">${poiIcons[key]}</svg>`,
  };
}
const poiPriority: Record<keyof typeof poiIcons, number> = {
  medical: 0,
  transit: 1,
  fuel: 2,
  shopping: 3,
  hotel: 4,
  education: 5,
  park: 6,
  finance: 7,
  food: 8,
  cafe: 9,
  place: 10,
};
function poiImageUrl(metadata: Record<string, unknown>) {
  for (const value of [metadata.image, metadata.wikimedia_commons]) {
    if (typeof value !== "string") continue;
    if (/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(value)) {
      const name = value.split("/wiki/File:")[1];
      if (name)
        return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(decodeURIComponent(name))}`;
    }
    if (/^https:\/\//i.test(value)) return value;
    if (/^File:/i.test(value))
      return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(value.slice(5).trim())}`;
  }
  return null;
}
function poiCard(place: Place, onAdd: () => void) {
  const displayName = place.name,
    metadata = place.metadata || {},
    appearance = poiAppearance(place),
    card = document.createElement("article"),
    media = document.createElement("div"),
    marker = document.createElement("span"),
    fallback = document.createElement("div");
  card.className = `poi-preview poi-${appearance.key}`;
  media.className = "poi-preview-media";
  marker.className = "poi-preview-marker";
  marker.innerHTML = appearance.icon;
  fallback.className = "poi-preview-fallback";
  fallback.innerHTML = appearance.icon;
  const imageValue = poiImageUrl(metadata);
  if (imageValue) {
    const image = document.createElement("img");
    image.className = "poi-preview-image";
    image.src = imageValue;
    image.alt = `Photo of ${displayName}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(fallback));
    media.append(image);
  } else media.append(fallback);
  media.append(marker);
  card.append(media);
  const body = document.createElement("div"),
    heading = document.createElement("div"),
    title = document.createElement("strong"),
    category = document.createElement("span"),
    favorite = document.createElement("button");
  body.className = "poi-preview-body";
  heading.className = "poi-preview-heading";
  title.textContent = displayName;
  category.textContent = (place.category || "Place").replaceAll("_", " ");
  favorite.className = "poi-preview-favorite";
  favorite.type = "button";
  favorite.setAttribute("aria-label", `Save ${displayName}`);
  favorite.setAttribute("aria-pressed", "false");
  favorite.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>';
  favorite.addEventListener("click", () => {
    const pressed = favorite.getAttribute("aria-pressed") !== "true";
    favorite.setAttribute("aria-pressed", String(pressed));
    favorite.setAttribute(
      "aria-label",
      `${pressed ? "Remove" : "Save"} ${displayName}${pressed ? " from saved places" : ""}`,
    );
  });
  heading.append(title, favorite);
  body.append(heading, category);
  if (place.address) {
    const address = document.createElement("p");
    address.textContent = place.address;
    body.append(address);
  }
  if (typeof metadata.opening_hours === "string") {
    const hours = document.createElement("p");
    hours.className = "poi-preview-hours";
    hours.textContent = `Open hours · ${metadata.opening_hours}`;
    body.append(hours);
  }
  const footer = document.createElement("div"),
    source = document.createElement("small"),
    button = document.createElement("button");
  footer.className = "poi-preview-footer";
  source.textContent = "PsarAI place";
  button.type = "button";
  button.textContent = "＋ Add stop";
  button.addEventListener("click", onAdd);
  footer.append(source, button);
  body.append(footer);
  card.append(body);
  return card;
}
export function MapCanvas({
  poiFilters = [],
  language = "en",
  layerVisibility,
}: {
  poiFilters?: string[];
  language?: MapLanguage;
  layerVisibility: MapLayerVisibility;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<MapLibreMap | null>(null),
    maplibre = useRef<typeof import("maplibre-gl") | null>(null),
    routeMarkers = useRef<MapLibreMarker[]>([]),
    endpointMarkers = useRef<MapLibreMarker[]>([]),
    poiMarkers = useRef<MapLibreMarker[]>([]),
    currentLocationMarker = useRef<MapLibreMarker | null>(null),
    calculateRef = useRef<ReturnType<typeof useRouteCalculation> | null>(null),
    loadedPlacesBounds = useRef<{
      south: number;
      west: number;
      north: number;
      east: number;
    } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]),
    [mapReady, setMapReady] = useState(false),
    coordinates = useRouteStore((s) => s.coordinates),
    routes = useRouteStore((s) => s.routes),
    selected = useRouteStore((s) => s.selectedRoute),
    mode = useRouteStore((s) => s.mode),
    setCoordinate = useRouteStore((s) => s.setCoordinate),
    setSelectedRoute = useRouteStore((s) => s.setSelectedRoute),
    calculate = useRouteCalculation();
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
  }, [layerVisibility, mapReady]);
  useEffect(() => {
    calculateRef.current = calculate;
  }, [calculate]);
  useEffect(() => {
    const focus = (event: Event) => {
      const detail = (
        event as CustomEvent<{ latitude: number; longitude: number }>
      ).detail;
      if (
        Number.isFinite(detail?.latitude) &&
        Number.isFinite(detail?.longitude)
      )
        map.current?.flyTo({
          center: [detail.longitude, detail.latitude],
          zoom: 16,
          duration: 600,
        });
    };
    window.addEventListener("smartroute:focus-coordinate", focus);
    return () =>
      window.removeEventListener("smartroute:focus-coordinate", focus);
  }, []);
  useEffect(() => {
    const showCurrentLocation = (event: Event) => {
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
          lonRadius =
            accuracy / (111_320 * Math.cos((latitude * Math.PI) / 180));
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
    };
    window.addEventListener(
      "smartroute:show-current-location",
      showCurrentLocation,
    );
    return () =>
      window.removeEventListener(
        "smartroute:show-current-location",
        showCurrentLocation,
      );
  }, []);
  useEffect(() => {
    const reset = () =>
      map.current?.easeTo({
        center: [104.9282, 11.5564],
        zoom: 12,
        duration: 600,
      });
    window.addEventListener("smartroute:reset-map-view", reset);
    return () => window.removeEventListener("smartroute:reset-map-view", reset);
  }, []);
  useEffect(() => {
    const focusSelectedRoute = () => {
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
    };
    window.addEventListener(
      "smartroute:focus-selected-route",
      focusSelectedRoute,
    );
    return () =>
      window.removeEventListener(
        "smartroute:focus-selected-route",
        focusSelectedRoute,
      );
  }, []);
  useEffect(() => {
    let active = true;
    import("maplibre-gl").then(async (maplibregl) => {
      let pmtilesProtocolRegistered = false;
      if (basemapMode === "hybrid") {
        const { Protocol } = await import("pmtiles");
        try {
          await ensureComplexTextPlugin(maplibregl);
        } catch (error) {
          console.error("Khmer map-label shaping failed to load", error);
        }
        if (!active || !element.current || map.current) return;
        const protocol = new Protocol({ metadata: true });
        maplibregl.addProtocol("pmtiles", protocol.tile);
        pmtilesProtocolRegistered = true;
      }
      if (!active || !element.current || map.current) return;
      maplibre.current = maplibregl;
      const currentMap = new maplibregl.Map({
        container: element.current,
        style:
          basemapMode === "hybrid"
            ? localBasemapStyle(
                `${window.location.origin}/api/backend/maps/tiles/cambodia.pmtiles`,
              )
            : onlineBasemapStyle(),
        center: [104.9282, 11.5564],
        zoom: 13,
        attributionControl: false,
        maxZoom: basemapMode === "hybrid" ? 19 : 20,
        transformRequest:
          basemapMode === "hybrid"
            ? (url, resourceType) => {
                if (resourceType !== "Glyphs") return undefined;
                const range = url.match(/(\d+-\d+)\.pbf$/)?.[1],
                  rangeStart = Number(range?.split("-")[0]);
                if (
                  !range ||
                  ![59904, 60160, 60416, 60672, 60928].includes(rangeStart)
                )
                  return undefined;
                return { url: complexTextGlyphsUrl.replace("{range}", range) };
              }
            : undefined,
      });
      map.current = currentMap;
      currentMap.addControl(
        new maplibregl.AttributionControl({
          customAttribution: "PsarAI Platform",
          compact: false,
        }),
        "bottom-right",
      );
      currentMap.on("error", (event) =>
        console.error("Map error", event.error),
      );
      currentMap.on("load", () => {
        if (basemapMode === "hybrid") {
          let worldBasemapVisible = false;
          const syncWorldBasemap = () => {
            const shouldBeVisible = !localBasemapCoversViewport(currentMap);
            if (shouldBeVisible === worldBasemapVisible) return;
            worldBasemapVisible = shouldBeVisible;
            currentMap.setLayoutProperty(
              worldBasemapLayerId,
              "visibility",
              shouldBeVisible ? "visible" : "none",
            );
          };
          syncWorldBasemap();
          currentMap.on("move", syncWorldBasemap);
        }
        currentMap.addSource("routes", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        currentMap.addLayer({
          id: "route-outline",
          type: "line",
          source: "routes",
          filter: ["==", ["get", "kind"], "route"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#fff",
            "line-opacity": 0.9,
            "line-width": ["case", ["==", ["get", "active"], true], 11, 7],
          },
        });
        currentMap.addLayer({
          id: "route-line",
          type: "line",
          source: "routes",
          filter: ["==", ["get", "kind"], "route"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": [
              "case",
              ["!=", ["get", "active"], true],
              "#6475dc",
              ["==", ["get", "mode"], "motorbike"],
              "#d97706",
              "#087f5b",
            ],
            "line-opacity": ["case", ["==", ["get", "active"], true], 1, 0.6],
            "line-width": ["case", ["==", ["get", "active"], true], 7, 4],
          },
        });
        currentMap.addLayer({
          id: "route-connectors",
          type: "line",
          source: "routes",
          filter: ["==", ["get", "kind"], "connector"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#087f5b",
            "line-width": 4,
            "line-opacity": 0.9,
            "line-dasharray": [1, 2.25],
          },
        });
        currentMap.addSource("current-location", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        currentMap.addLayer({
          id: "current-location-accuracy",
          type: "fill",
          source: "current-location",
          filter: ["==", ["get", "kind"], "accuracy"],
          paint: {
            "fill-color": "#10b981",
            "fill-opacity": 0.1,
            "fill-outline-color": "#087f5b",
          },
        });
        setMapReady(true);
      });
      currentMap.on("click", "route-line", (event) => {
        event.preventDefault();
        const index = Number(event.features?.[0]?.properties?.routeIndex);
        if (Number.isInteger(index))
          useRouteStore.getState().setSelectedRoute(index);
      });
      currentMap.on("mouseenter", "route-line", () => {
        currentMap.getCanvas().style.cursor = "pointer";
      });
      currentMap.on("mouseleave", "route-line", () => {
        currentMap.getCanvas().style.cursor = "";
      });
      currentMap.on("click", async (event) => {
        if (event.defaultPrevented) return;
        const coordinate: Coordinate = [event.lngLat.lat, event.lngLat.lng],
          state = useRouteStore.getState(),
          index = state.activePoint;
        state.setPoint(index, {
          name: "Pinned location",
          latitude: coordinate[0],
          longitude: coordinate[1],
        });
        try {
          const nearest = await routesApi.nearest(coordinate);
          useRouteStore.getState().setPoint(index, {
            name: nearest.name || "Pinned location",
            latitude: coordinate[0],
            longitude: coordinate[1],
          });
        } catch {}
        const latest = useRouteStore.getState(),
          ready = latest.coordinates.filter(Boolean) as Coordinate[];
        if (ready.length === latest.coordinates.length)
          void calculateRef.current?.(ready);
      });
      const observer = new ResizeObserver(() => currentMap.resize());
      observer.observe(element.current);
      currentMap.once("remove", () => observer.disconnect());
      currentMap.once("remove", () => {
        if (pmtilesProtocolRegistered) maplibregl.removeProtocol("pmtiles");
      });
    });
    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
      currentLocationMarker.current = null;
      maplibre.current = null;
    };
  }, []);
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !mapReady) return;
    let controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      active = true;
    const indicator = document.getElementById("map-data-loading");
    const load = () => {
      const visibleBounds = currentMap.getBounds();
      if (currentMap.getZoom() < 12) {
        loadedPlacesBounds.current = null;
        setPlaces((current) => (current.length ? [] : current));
        return;
      }
      const loaded = loadedPlacesBounds.current;
      if (
        loaded &&
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
            ...bounds,
          },
          250,
          controller.signal,
        )
        .then((items) => {
          if (!active) return;
          loadedPlacesBounds.current = bounds;
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
      loadedPlacesBounds.current = null;
      controller?.abort();
      if (timer) clearTimeout(timer);
      currentMap.off("moveend", schedule);
      indicator?.classList.replace("flex", "hidden");
    };
  }, [mapReady, language]);
  useEffect(() => {
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker;
    if (!MapMarker || !currentMap || !mapReady) return;
    endpointMarkers.current.forEach((marker) => marker.remove());
    endpointMarkers.current = [];
    if (!layerVisibility.routes) return;
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
      marker.on("dragend", () => {
        const value = marker.getLngLat(),
          next: Coordinate = [value.lat, value.lng];
        setCoordinate(index, next);
        const all = coordinates
          .map((item, i) => (i === index ? next : item))
          .filter(Boolean) as Coordinate[];
        if (all.length === coordinates.length) void calculate(all);
      });
      endpointMarkers.current.push(marker);
    });
  }, [coordinates, setCoordinate, calculate, mapReady, layerVisibility.routes]);
  useEffect(() => {
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker,
      MapPopup = maplibre.current?.Popup;
    if (!MapMarker || !MapPopup || !currentMap || !mapReady) return;
    poiMarkers.current.forEach((marker) => marker.remove());
    poiMarkers.current = [];
    const entries = (layerVisibility.places ? places : [])
      .flatMap((place) => {
        const appearance = poiAppearance(place);
        if (poiFilters.length && !poiFilters.includes(appearance.key))
          return [];
        const element = document.createElement("button");
        element.type = "button";
        element.className = `poi-map-icon poi-${appearance.key}`;
        element.innerHTML = `<span class="poi-map-icon-visual">${appearance.icon}</span><b>${place.name}</b>`;
        element.setAttribute("aria-label", place.name);
        const marker = new MapMarker({ element }).setLngLat([
          place.longitude,
          place.latitude,
        ]);
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        const popup = new MapPopup({
          className: "poi-popup",
          closeButton: false,
          offset: 20,
          maxWidth: "360px",
        });
        const open = () => {
          if (closeTimer) clearTimeout(closeTimer);
          const card = poiCard(place, () => {
            const state = useRouteStore.getState();
            state.setPoint(state.activePoint, place);
            const latest = useRouteStore.getState(),
              ready = latest.coordinates.filter(Boolean) as Coordinate[];
            if (ready.length === latest.coordinates.length)
              void calculateRef.current?.(ready);
            popup.remove();
          });
          card.addEventListener("click", (event) => event.stopPropagation());
          popup
            .setDOMContent(card)
            .setLngLat([place.longitude, place.latitude])
            .addTo(currentMap);
          popup
            .getElement()
            .addEventListener(
              "mouseenter",
              () => closeTimer && clearTimeout(closeTimer),
            );
          popup
            .getElement()
            .addEventListener("mouseleave", () => popup.remove());
        };
        element.addEventListener("mouseenter", open);
        element.addEventListener("mouseleave", () => {
          closeTimer = setTimeout(() => popup.remove(), 180);
        });
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          open();
        });
        poiMarkers.current.push(marker);
        return [{ marker, element, priority: poiPriority[appearance.key] }];
      })
      .sort((a, b) => a.priority - b.priority);
    const refresh = () => {
      const zoom = currentMap.getZoom(),
        spacing =
          zoom >= 18
            ? 30
            : zoom >= 17
              ? 36
              : zoom >= 16
                ? 46
                : zoom >= 15
                  ? 62
                  : zoom >= 14
                    ? 90
                    : zoom >= 13
                      ? 110
                      : 130,
        maxVisible =
          zoom >= 18
            ? 100
            : zoom >= 17
              ? 85
              : zoom >= 16
                ? 60
                : zoom >= 15
                  ? 35
                  : zoom >= 14
                    ? 24
                    : zoom >= 13
                      ? 16
                      : zoom >= 12
                        ? 10
                        : 0,
        occupied = new Set<string>(),
        visible = new Set<MapLibreMarker>();
      if (maxVisible) {
        for (const entry of entries) {
          const point = currentMap.project(entry.marker.getLngLat()),
            cellX = Math.floor(point.x / spacing),
            cellY = Math.floor(point.y / spacing);
          let blocked = false;
          for (let x = -1; x <= 1 && !blocked; x++)
            for (let y = -1; y <= 1; y++)
              if (occupied.has(`${cellX + x}:${cellY + y}`)) {
                blocked = true;
                break;
              }
          if (blocked) continue;
          occupied.add(`${cellX}:${cellY}`);
          visible.add(entry.marker);
          if (visible.size >= maxVisible) break;
        }
      }
      entries.forEach(({ marker, element, priority }) => {
        const shown = element.isConnected,
          shouldShow = visible.has(marker),
          showName =
            shouldShow && (zoom >= 17 || (zoom >= 16 && priority <= 4));
        if (shouldShow && !shown) marker.addTo(currentMap);
        else if (!shouldShow && shown) marker.remove();
        element.classList.toggle("show-name", showName);
      });
    };
    currentMap.on("zoomend moveend", refresh);
    refresh();
    return () => {
      currentMap.off("zoomend moveend", refresh);
      poiMarkers.current.forEach((marker) => marker.remove());
      poiMarkers.current = [];
    };
  }, [places, poiFilters, mapReady, calculate, layerVisibility.places]);
  useEffect(() => {
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker;
    if (!MapMarker || !currentMap || !mapReady) return;
    routeMarkers.current.forEach((marker) => marker.remove());
    routeMarkers.current = [];
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
    if (chosen && layerVisibility.routes) {
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
    if (!layerVisibility.routes) return;
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
      routeMarkers.current.push(label);
    });
    routes[selected]?.transfers?.forEach((transfer) => {
      const element = document.createElement("div");
      element.className = "route-transfer-marker";
      element.textContent = "⇄";
      element.title = "Transfer from car to motorbike";
      element.setAttribute("role", "img");
      element.setAttribute("aria-label", element.title);
      routeMarkers.current.push(
        new MapMarker({ element, anchor: "center" })
          .setLngLat(transfer.coordinate)
          .addTo(currentMap),
      );
    });
  }, [
    routes,
    selected,
    mode,
    setSelectedRoute,
    mapReady,
    layerVisibility.routes,
  ]);
  return (
    <div className="absolute inset-0">
      <div
        ref={element}
        className="absolute inset-0"
        aria-label="Interactive route map"
      />
      <MapControlGroup className="map-zoom-controls" label="Map zoom">
        <MapControlButton
          onClick={() => map.current?.zoomIn({ duration: 240 })}
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </MapControlButton>
        <MapControlButton
          onClick={() => map.current?.zoomOut({ duration: 240 })}
          aria-label="Zoom out"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </MapControlButton>
      </MapControlGroup>
    </div>
  );
}

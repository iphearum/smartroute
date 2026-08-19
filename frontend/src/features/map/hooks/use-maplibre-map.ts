"use client";
import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { Coordinate } from "@/features/routes/domain/types";
import { useRouteStore } from "@/features/routes/store/route-store";
import {
  basemapMode,
  complexTextGlyphsUrl,
  ensureComplexTextPlugin,
  localBasemapCoversViewport,
  localBasemapStyle,
  mapWorkerUrl,
  onlineBasemapStyle,
  worldBasemapLayerId,
} from "@/features/map/basemap-style";

// Owns the MapLibre `Map` instance itself: creation/teardown, the pmtiles
// protocol + RTL text plugin for the hybrid (Khmer-label) basemap, the base
// route/current-location sources and layers every other map hook draws
// into, and viewport resize handling. Stays ignorant of routing/POI
// concerns -- `onMapClick` is the one hook the caller gets to plug routing
// behavior into a plain map click.
export function useMaplibreMap({
  onMapClick,
}: {
  onMapClick: (coordinate: Coordinate) => void;
}) {
  const element = useRef<HTMLDivElement>(null),
    map = useRef<MapLibreMap | null>(null),
    maplibre = useRef<typeof import("maplibre-gl") | null>(null),
    onMapClickRef = useRef(onMapClick);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    onMapClickRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    let active = true;
    import("maplibre-gl").then(async (maplibregl) => {
      maplibregl.setWorkerUrl(mapWorkerUrl);
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
      currentMap.on("click", (event) => {
        if (event.defaultPrevented) return;
        onMapClickRef.current([event.lngLat.lat, event.lngLat.lng]);
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
      maplibre.current = null;
    };
  }, []);

  return { elementRef: element, map, maplibre, mapReady };
}

"use client";
import { useEffect, useRef } from "react";
import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";
import type { Place } from "@/features/routes/domain/types";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { usePoiThemes } from "@/features/places/hooks/use-poi-themes";
import { poiPreviewCard } from "@/features/places/components/poi-preview-card";
import { MarkerLayer } from "@/features/map/lib/marker-layer";
import { isShopPlace } from "@/features/shops/lib/shop-place";

// Owns POI markers end-to-end: classifying places into themes, rendering
// the marker DOM, the hover preview popup, and the zoom-based declutter
// pass that keeps dense areas readable (fewer, higher-priority icons at low
// zoom; everything at high zoom).
export function usePoiMarkers(
  map: React.RefObject<MapLibreMap | null>,
  maplibre: React.RefObject<typeof import("maplibre-gl") | null>,
  mapReady: boolean,
  places: Place[],
  poiFilters: string[],
  placesVisible: boolean,
  calculatePointRef: React.RefObject<
    ReturnType<typeof useRouteCalculation>["calculatePoint"] | null
  >,
) {
  const layer = useRef(new MarkerLayer()).current;
  const { themes, classify, priorityFor, iconMarkup } = usePoiThemes();

  useEffect(() => {
    const currentMap = map.current,
      MapMarker = maplibre.current?.Marker,
      MapPopup = maplibre.current?.Popup;
    if (!MapMarker || !MapPopup || !currentMap || !mapReady) return;
    layer.clear();
    const entries = (placesVisible ? places : [])
      .flatMap((place) => {
        const theme = classify(place);
        if (poiFilters.length && !poiFilters.includes(theme.key)) return [];
        const icon = iconMarkup(theme);
        const element = document.createElement("button");
        element.type = "button";
        element.className = `poi-map-icon poi-${theme.key}`;
        element.innerHTML = `<span class="poi-map-icon-visual">${icon}</span><b>${place.name}</b>`;
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
          const card = poiPreviewCard(
            place,
            () => {
              const activePoint = useRouteStore.getState().activePoint;
              void calculatePointRef.current?.(
                activePoint,
                [place.latitude, place.longitude],
                place,
              );
              popup.remove();
            },
            classify,
            iconMarkup,
            () => {
              window.dispatchEvent(
                new CustomEvent("smartroute:open-place-detail", {
                  detail: place,
                }),
              );
              popup.remove();
            },
            isShopPlace(place)
              ? () => {
                  window.dispatchEvent(
                    new CustomEvent("smartroute:open-shop-platform", {
                      detail: place,
                    }),
                  );
                  popup.remove();
                }
              : undefined,
          );
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
        layer.add(marker);
        return [{ marker, element, priority: priorityFor(theme.key) }];
      })
      .sort((a, b) => a.priority - b.priority);
    const MARKER_CONFIG = [
      { minZoom: 18, spacing: 30, maxVisible: 250 },
      { minZoom: 17, spacing: 36, maxVisible: 213 },
      { minZoom: 16, spacing: 46, maxVisible: 150 },
      { minZoom: 15, spacing: 62, maxVisible: 150 },
      { minZoom: 14, spacing: 74, maxVisible: 150 },
      { minZoom: 13, spacing: 86, maxVisible: 150 },
      { minZoom: 12, spacing: 100, maxVisible: 150 },
      { minZoom: 9, spacing: 80, maxVisible: 200}
    ] as const;

    // A filter narrows the mix down to one or a few categories, so there's
    // no cross-category competition for screen space anymore -- the
    // per-zoom caps above (tuned for the full ~20-category mix) would
    // otherwise hide filtered results the user specifically asked to see.
    // Drop the count cap entirely while filtered: `spacing`'s grid-based
    // occupancy check below is still what prevents markers from visually
    // overlapping, so this shows every matching, on-screen place that fits.
    const getMarkerConfig = (zoom: number) => {
      const base = MARKER_CONFIG.find(({ minZoom }) => zoom >= minZoom) ?? {
        spacing: 100,
        maxVisible: 0,
      };
      if (!poiFilters.length) return base;
      return { spacing: base.spacing, maxVisible: Number.POSITIVE_INFINITY };
    };

    const refresh = () => {
      const zoom = currentMap.getZoom();
      const { spacing, maxVisible } = getMarkerConfig(zoom);

      const visible = new Set<MapLibreMarker>();
      const occupied = new Set<string>();

      const { clientWidth: width, clientHeight: height } =
        currentMap.getCanvas();

      const margin = 100;

      for (const { marker } of entries) {
        if (visible.size >= maxVisible) break;

        const point = currentMap.project(marker.getLngLat());

        if (
          point.x < -margin ||
          point.x > width + margin ||
          point.y < -margin ||
          point.y > height + margin
        ) {
          continue;
        }

        const cellX = Math.floor(point.x / spacing);
        const cellY = Math.floor(point.y / spacing);

        let occupiedNearby = false;

        for (let dx = -1; dx <= 1 && !occupiedNearby; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            if (occupied.has(`${cellX + dx}:${cellY + dy}`)) {
              occupiedNearby = true;
              break;
            }
          }
        }

        if (occupiedNearby) continue;

        occupied.add(`${cellX}:${cellY}`);
        visible.add(marker);
      }

      for (const { marker, element, priority } of entries) {
        const shouldShow = visible.has(marker);

        if (shouldShow !== element.isConnected) {
          shouldShow ? marker.addTo(currentMap) : marker.remove();
        }

        const showName =
          shouldShow &&
          (zoom >= 17 ||
            (zoom >= 16 && priority <= 4) ||
            (zoom >= 13 && priority <= 2));

        element.classList.toggle("show-name", showName);
      }
    };
    currentMap.on("zoomend", refresh);
    currentMap.on("moveend", refresh);
    refresh();
    return () => {
      currentMap.off("zoomend", refresh);
      currentMap.off("moveend", refresh);
      layer.clear();
    };
  }, [
    map,
    maplibre,
    places,
    poiFilters,
    mapReady,
    placesVisible,
    themes,
    classify,
    priorityFor,
    iconMarkup,
    calculatePointRef,
    layer,
  ]);
}

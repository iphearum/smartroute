"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Marker } from "maplibre-gl";
import { useMaplibreMap } from "../hooks/use-maplibre-map";
import { Icon } from "@/shared/ui/icon";

export type MapViewLocation = {
  latitude: number;
  longitude: number;
};

export type MapViewMarker = MapViewLocation & {
  id: string;
  color?: string;
  label?: string;
};

export type MapViewProps = {
  center?: MapViewLocation;
  zoom?: number;
  markers?: readonly MapViewMarker[];
  className?: string;
  mapLabel?: string;
  showZoomControls?: boolean;
  showRecenterControl?: boolean;
  onMapClick?: (location: MapViewLocation) => void;
  children?: ReactNode;
};

const DEFAULT_CENTER: MapViewLocation = {
  latitude: 11.5564,
  longitude: 104.9282,
};

const join = (...values: Array<string | undefined>) =>
  values.filter(Boolean).join(" ");

export function MapView({
  center = DEFAULT_CENTER,
  zoom = 13,
  markers = [],
  className,
  mapLabel = "Interactive map",
  showZoomControls = false,
  showRecenterControl = false,
  onMapClick,
  children,
}: MapViewProps) {
  const markerRefs = useRef(new Map<string, Marker>());
  const { elementRef, map, maplibre, mapReady } = useMaplibreMap({
    onMapClick: (coordinate) =>
      onMapClick?.({ latitude: coordinate[0], longitude: coordinate[1] }),
  });

  useEffect(() => {
    if (!mapReady || !map.current || !maplibre.current) return;

    map.current.flyTo({
      center: [center.longitude, center.latitude],
      zoom,
      duration: 500,
    });
  }, [center.latitude, center.longitude, map, mapReady, zoom]);

  useEffect(() => {
    if (!mapReady || !map.current || !maplibre.current) return;

    const activeIds = new Set(markers.map((marker) => marker.id));
    for (const [id, marker] of markerRefs.current) {
      if (!activeIds.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    }

    for (const item of markers) {
      const position: [number, number] = [item.longitude, item.latitude];
      const existing = markerRefs.current.get(item.id);
      if (existing) {
        existing.setLngLat(position);
        continue;
      }

      const marker = new maplibre.current.Marker({
        color: item.color || "#087f5b",
      })
        .setLngLat(position)
        .addTo(map.current);
      if (item.label) {
        marker.getElement().setAttribute("role", "img");
        marker.getElement().setAttribute("aria-label", item.label);
        marker.getElement().setAttribute("title", item.label);
      }
      markerRefs.current.set(item.id, marker);
    }
  }, [map, mapReady, maplibre, markers]);

  useEffect(
    () => () => {
      for (const marker of markerRefs.current.values()) marker.remove();
      markerRefs.current.clear();
    },
    [],
  );

  const recenter = () => {
    map.current?.flyTo({
      center: [center.longitude, center.latitude],
      zoom,
      duration: 350,
    });
  };

  return (
    <div className={join("map-view", className)}>
      <div ref={elementRef} className="absolute inset-0" aria-label={mapLabel} />
      {showZoomControls && (
        <div className="map-view-zoom-controls liquid-card" role="group" aria-label="Map zoom controls">
          <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>
            +
          </button>
          <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>
            −
          </button>
        </div>
      )}
      {showRecenterControl && (
        <button
          type="button"
          className="map-view-recenter liquid-card"
          aria-label="Recenter map"
          onClick={recenter}
        >
          <Icon name="locate" className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

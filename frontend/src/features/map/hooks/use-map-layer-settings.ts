"use client";

import { useEffect, useRef, useState } from "react";
import type { Coordinate } from "@/features/routes/domain/types";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { useRouteStore } from "@/features/routes/store/route-store";
import {
  defaultMapLayers,
  type MapLayerKey,
  type MapLayerVisibility,
  useAppShell,
} from "@/shared/state/app-shell-context";

export const mapLayerOptions: { key: MapLayerKey; label: string }[] = [
  { key: "roads", label: "Roads" },
  { key: "buildings", label: "Buildings" },
  { key: "land", label: "Land & parks" },
  { key: "water", label: "Water" },
  { key: "boundaries", label: "Boundaries" },
  { key: "places", label: "Places & shops" },
  { key: "routes", label: "Routes" },
];

export const mapLayerPresets: {
  label: string;
  layers: MapLayerVisibility;
}[] = [
  { label: "Standard", layers: defaultMapLayers },
  {
    label: "Navigation",
    layers: {
      roads: true,
      buildings: true,
      land: false,
      water: true,
      boundaries: false,
      places: true,
      routes: true,
    },
  },
  {
    label: "Clean",
    layers: {
      roads: true,
      buildings: false,
      land: false,
      water: false,
      boundaries: false,
      places: false,
      routes: true,
    },
  },
  {
    label: "Commerce",
    layers: {
      roads: true,
      buildings: true,
      land: false,
      water: true,
      boundaries: false,
      places: true,
      routes: false,
    },
  },
];

const routingSettingsStorageKey = "smartroute-routing-settings";

export function useMapLayerSettings() {
  const [open, setOpen] = useState(false),
    triggerGroupRef = useRef<HTMLDivElement>(null),
    popoverRef = useRef<HTMLElement>(null),
    layers = useAppShell((state) => state.mapLayers),
    toggleLayer = useAppShell((state) => state.toggleMapLayer),
    setLayers = useAppShell((state) => state.setMapLayers),
    mode = useRouteStore((state) => state.mode),
    coordinates = useRouteStore((state) => state.coordinates),
    allowDestinationAccess = useRouteStore(
      (state) => state.allowDestinationAccess,
    ),
    setAllowDestinationAccess = useRouteStore(
      (state) => state.setAllowDestinationAccess,
    ),
    { calculateAll } = useRouteCalculation();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(routingSettingsStorageKey);
      if (!stored) {
        localStorage.setItem(
          routingSettingsStorageKey,
          JSON.stringify({ allowDestinationAccess: false }),
        );
        return;
      }
      const settings = JSON.parse(stored) as {
        allowDestinationAccess?: unknown;
      };
      if (typeof settings.allowDestinationAccess === "boolean")
        setAllowDestinationAccess(settings.allowDestinationAccess);
    } catch {
      try {
        localStorage.setItem(
          routingSettingsStorageKey,
          JSON.stringify({ allowDestinationAccess: false }),
        );
      } catch {}
    }
  }, [setAllowDestinationAccess]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !triggerGroupRef.current?.contains(target) &&
        !popoverRef.current?.contains(target)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selectPreset = (preset: MapLayerVisibility) => setLayers({ ...preset }),
    isPresetActive = (preset: MapLayerVisibility) =>
      mapLayerOptions.every(({ key }) => layers[key] === preset[key]),
    updateDestinationAccess = (allow: boolean) => {
      try {
        localStorage.setItem(
          routingSettingsStorageKey,
          JSON.stringify({ allowDestinationAccess: allow }),
        );
      } catch {}
      setAllowDestinationAccess(allow);
      const ready = coordinates.filter(Boolean) as Coordinate[];
      if (ready.length === coordinates.length)
        queueMicrotask(() => calculateAll(ready));
    };

  return {
    triggerGroupRef,
    popoverRef,
    open,
    layers,
    toggleOpen: () => setOpen((current) => !current),
    toggleLayer,
    selectPreset,
    isPresetActive,
    destinationAccessAvailable:
      mode === "car" || mode === "motorbike" || mode === "combined",
    allowDestinationAccess,
    updateDestinationAccess,
  };
}

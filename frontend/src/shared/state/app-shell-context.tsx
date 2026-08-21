"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import type { MapLanguage } from "@/features/i18n/language";

export type AppNavSection =
  | "Explore"
  | "Locate"
  | "Place data"
  | "Directions"
  | "Map tools";
export type MapLayerKey =
  | "roads"
  | "buildings"
  | "land"
  | "water"
  | "boundaries"
  | "places"
  | "routes";
export type MapLayerVisibility = Record<MapLayerKey, boolean>;

export const defaultMapLayers: MapLayerVisibility = {
  roads: true,
  buildings: false,
  land: true,
  water: true,
  boundaries: false,
  places: true,
  routes: true,
};

const mapLayersStorageKey = "smartroute-map-layers";
const mapLayersVersionKey = "smartroute-map-layers-version";
const currentMapLayersVersion = "2";

export interface AppShellState {
  sidebarCollapsed: boolean;
  activeNav: AppNavSection;
  poiFilters: string[];
  language: MapLanguage;
  placeDataOpen: boolean;
  mapLayers: MapLayerVisibility;
  toggleSidebar: () => void;
  setActiveNav: (section: AppNavSection) => void;
  togglePoiFilter: (key: string) => void;
  toggleMapLayer: (key: MapLayerKey) => void;
  setMapLayers: (layers: MapLayerVisibility) => void;
  setLanguage: (language: MapLanguage) => void;
  hydrateLanguage: () => void;
  openPlaceData: () => void;
  closePlaceData: () => void;
}

function createAppShellStore() {
  return createStore<AppShellState>((set) => ({
    sidebarCollapsed: false,
    activeNav: "Explore",
    poiFilters: [],
    language: "en",
    placeDataOpen: false,
    mapLayers: defaultMapLayers,
    toggleSidebar: () =>
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setActiveNav: (activeNav) => set({ activeNav }),
    togglePoiFilter: (key) =>
      set((state) => ({
        poiFilters: state.poiFilters.includes(key)
          ? state.poiFilters.filter((value) => value !== key)
          : [...state.poiFilters, key],
      })),
    toggleMapLayer: (key) =>
      set((state) => {
        const mapLayers = { ...state.mapLayers, [key]: !state.mapLayers[key] };
        localStorage.setItem(mapLayersStorageKey, JSON.stringify(mapLayers));
        return { mapLayers };
      }),
    setMapLayers: (mapLayers) => {
      localStorage.setItem(mapLayersStorageKey, JSON.stringify(mapLayers));
      set({ mapLayers });
    },
    setLanguage: (language) => {
      localStorage.setItem("smartroute-language", language);
      set({ language });
    },
    hydrateLanguage: () => {
      const saved = localStorage.getItem("smartroute-language");
      if (saved === "en" || saved === "km") set({ language: saved });
      try {
        const storedLayers = localStorage.getItem(mapLayersStorageKey);
        if (!storedLayers) {
          localStorage.setItem(
            mapLayersStorageKey,
            JSON.stringify(defaultMapLayers),
          );
          localStorage.setItem(mapLayersVersionKey, currentMapLayersVersion);
          return;
        }
        const layers = JSON.parse(
          storedLayers,
        ) as Partial<MapLayerVisibility> | null;
        if (layers) {
          const migrated =
            localStorage.getItem(mapLayersVersionKey) !==
            currentMapLayersVersion;
          if (migrated) layers.places = true;
          const mapLayers = Object.fromEntries(
            Object.entries(defaultMapLayers).map(([key, fallback]) => [
              key,
              typeof layers[key as MapLayerKey] === "boolean"
                ? layers[key as MapLayerKey]
                : fallback,
            ]),
          ) as MapLayerVisibility;
          if (migrated) {
            localStorage.setItem(
              mapLayersStorageKey,
              JSON.stringify(mapLayers),
            );
            localStorage.setItem(mapLayersVersionKey, currentMapLayersVersion);
          }
          set({
            mapLayers,
          });
        }
      } catch {}
    },
    openPlaceData: () => set({ placeDataOpen: true }),
    closePlaceData: () => set({ placeDataOpen: false }),
  }));
}

type AppShellStore = StoreApi<AppShellState>;
const AppShellContext = createContext<AppShellStore | null>(null);

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createAppShellStore);

  useEffect(() => store.getState().hydrateLanguage(), [store]);

  return (
    <AppShellContext.Provider value={store}>
      {children}
    </AppShellContext.Provider>
  );
}

export function useAppShell<Selected>(
  selector: (state: AppShellState) => Selected,
) {
  const store = useContext(AppShellContext);
  if (!store)
    throw new Error("useAppShell must be used within AppShellProvider");
  return useStore(store, selector);
}

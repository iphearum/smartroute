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

export type AppNavSection = "Explore" | "Locate" | "Place data" | "Node IDs";

export interface AppShellState {
  sidebarCollapsed: boolean;
  activeNav: AppNavSection;
  poiFilters: string[];
  language: MapLanguage;
  placeDataOpen: boolean;
  toggleSidebar: () => void;
  setActiveNav: (section: AppNavSection) => void;
  togglePoiFilter: (key: string) => void;
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
    toggleSidebar: () =>
      set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
    setActiveNav: (activeNav) => set({ activeNav }),
    togglePoiFilter: (key) =>
      set((state) => ({
        poiFilters: state.poiFilters.includes(key)
          ? state.poiFilters.filter((value) => value !== key)
          : [...state.poiFilters, key],
      })),
    setLanguage: (language) => {
      localStorage.setItem("smartroute-language", language);
      set({ language });
    },
    hydrateLanguage: () => {
      const saved = localStorage.getItem("smartroute-language");
      if (saved === "en" || saved === "km") set({ language: saved });
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

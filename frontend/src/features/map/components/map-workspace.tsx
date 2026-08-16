"use client";

import { PoiLoader } from "@/features/places/components/poi-loader";
import { RoutePanel } from "@/features/routes/components/route-panel";
import {
  type AppNavSection,
  useAppShell,
} from "@/shared/state/app-shell-context";
import { Icon, type IconName } from "@/shared/ui/icon";
import { LiquidSwitch } from "@/shared/ui/liquid";
import { MapCanvas } from "./map-canvas";

const railItems: { icon: IconName; label: AppNavSection }[] = [
  { icon: "home", label: "Explore" },
  { icon: "locate", label: "Locate" },
  { icon: "database", label: "Place data" },
  { icon: "bookmark", label: "Node IDs" },
];
const categories = [
  { key: "cafe", label: "☕ Cafés" },
  { key: "food", label: "🍜 Restaurants" },
  { key: "hotel", label: "🏨 Hotels" },
  { key: "fuel", label: "⛽ Fuel" },
  { key: "medical", label: "🏥 Hospitals" },
  { key: "shopping", label: "🛍 Markets" },
];

export function MapWorkspace() {
  const sidebarCollapsed = useAppShell((state) => state.sidebarCollapsed),
    toggleSidebar = useAppShell((state) => state.toggleSidebar),
    poiFilters = useAppShell((state) => state.poiFilters),
    togglePoiFilter = useAppShell((state) => state.togglePoiFilter),
    activeNav = useAppShell((state) => state.activeNav),
    setActiveNav = useAppShell((state) => state.setActiveNav),
    language = useAppShell((state) => state.language),
    openPlaceData = useAppShell((state) => state.openPlaceData);
  return (
    <main
      className={`map-workspace relative h-dvh min-h-0 overflow-hidden ${sidebarCollapsed ? "" : "has-bottom-nav"}`}
      lang={language}
    >
      <MapCanvas poiFilters={poiFilters} language={language} />
      <nav
        className={`desktop-rail liquid-card liquid-dock absolute z-[800] ${sidebarCollapsed ? "dock-hidden" : ""}`}
        aria-label="Primary navigation"
        aria-hidden={sidebarCollapsed}
      >
        <LiquidSwitch
          ariaLabel="Map sections"
          value={activeNav}
          onChange={(value) => {
            setActiveNav(value);
            if (value === "Place data") openPlaceData();
          }}
          items={railItems.map((item) => ({
            value: item.label,
            label: item.label,
            icon: <Icon name={item.icon} />,
          }))}
        />
      </nav>
      <RoutePanel
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        language={language}
      />
      <header className="workspace-command-bar absolute z-[650]">
        <div
          className="category-strip-next flex min-w-0 gap-2 overflow-x-auto p-2 pb-5 [scrollbar-width:none]"
          aria-label="Filter places"
        >
          {categories.map((category) => {
            const active = poiFilters.includes(category.key);
            return (
              <button
                key={category.key}
                onClick={() => togglePoiFilter(category.key)}
                aria-pressed={active}
                className={`liquid-chip h-[40px] shrink-0 rounded-full px-4 text-xs font-bold transition-all ${active ? "active text-emerald-800" : "text-slate-700 hover:text-emerald-800"}`}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </header>
      <PoiLoader />
      <div
        id="map-data-loading"
        className="liquid-pill pointer-events-none absolute bottom-28 left-1/2 z-[650] hidden -translate-x-1/2 items-center gap-2 px-4 py-2 text-[11px] font-bold text-emerald-800"
        role="status"
      >
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-700" />
        Loading visible map data…
      </div>
      <div className="map-footer liquid-pill absolute bottom-6 left-6 z-[600] flex items-center gap-2 px-4 py-2 text-[11px] font-bold text-slate-700">
        <span className="h-2 w-2 rounded-full bg-emerald-600 ring-4 ring-emerald-100" />
        Search for a place or pin the map
      </div>
    </main>
  );
}

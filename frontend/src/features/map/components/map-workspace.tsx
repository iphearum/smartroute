"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { PoiLoader } from "@/features/places/components/poi-loader";
import { PlaceDetailPanel } from "@/features/places/components/place-detail-panel";
import { RoutePanel } from "@/features/routes/components/route-panel";
import {
  type AppNavSection,
  useAppShell,
} from "@/shared/state/app-shell-context";
import { Icon, type IconName } from "@/shared/ui/icon";
import { LiquidSwitch } from "@/shared/ui/liquid";
import { usePersistentWindowPosition } from "@/shared/hooks/use-persistent-window-position";
import { MapCanvas } from "./map-canvas";
import { MapActionControls } from "./map-action-controls";
import { ShopPlatformPanel } from "@/features/shops/components/shop-platform-panel";
import { AiMapAssistant } from "@/features/assistant/components/ai-map-assistant";
import { useI18n } from "@/features/i18n/use-i18n";
import { useRouteStore } from "@/features/routes/store/route-store";
import {
  ClearRouteBottomSheet,
  MapToolsMenu,
} from "./map-tools-menu";

const railItems: { icon: IconName; label: AppNavSection; key: string }[] = [
  { icon: "home", label: "Explore", key: "map.explore" },
  { icon: "locate", label: "Locate", key: "map.locate" },
  { icon: "database", label: "Place data", key: "map.placeData" },
  { icon: "directions", label: "Directions", key: "map.directions" },
  { icon: "menu", label: "Map tools", key: "map.tools.title" },
];
const triggerFlavors = ["flame", "frost", "aurora", "verdant"] as const;
const categories = [
  { key: "cafe", translationKey: "map.categories.cafe" },
  { key: "food", translationKey: "map.categories.food" },
  { key: "hotel", translationKey: "map.categories.hotel" },
  { key: "fuel", translationKey: "map.categories.fuel" },
  { key: "medical", translationKey: "map.categories.medical" },
  { key: "shopping", translationKey: "map.categories.shopping" },
];

export function MapWorkspace() {
  const workspaceRef = useRef<HTMLElement>(null),
    triggerZoneRef = useRef<HTMLDivElement>(null),
    suppressShopClick = useRef(false),
    [triggerPosition, setTriggerPosition] = usePersistentWindowPosition(
      "shop-platform-trigger",
    ),
    [triggerFlavor, setTriggerFlavor] =
      useState<(typeof triggerFlavors)[number]>("flame"),
    [assistantOpen, setAssistantOpen] = useState(false),
    [assistantWidth, setAssistantWidth] = useState(400);
  // pick the pill's mood on the client so server and first client render agree
  useEffect(() => {
    setTriggerFlavor(
      triggerFlavors[Math.floor(Math.random() * triggerFlavors.length)],
    );
  }, []);
  useEffect(() => {
    const clampTrigger = () => {
      const zone = triggerZoneRef.current,
        button = zone?.querySelector(".shop-platform-trigger");
      if (!zone || !button) return;
      const zoneRect = zone.getBoundingClientRect(),
        maxX = -(zoneRect.width - button.getBoundingClientRect().width),
        maxY = Math.max(
          0,
          zoneRect.height - button.getBoundingClientRect().height,
        ),
        x = Math.max(maxX, Math.min(0, triggerPosition.x)),
        y = Math.max(0, Math.min(maxY, triggerPosition.y));
      if (x !== triggerPosition.x || y !== triggerPosition.y)
        setTriggerPosition({ version: 1, x, y });
    };
    const frame = window.requestAnimationFrame(clampTrigger);
    window.addEventListener("resize", clampTrigger);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", clampTrigger);
    };
  }, [setTriggerPosition, triggerPosition]);
  const sidebarCollapsed = useAppShell((state) => state.sidebarCollapsed),
    toggleSidebar = useAppShell((state) => state.toggleSidebar),
    poiFilters = useAppShell((state) => state.poiFilters),
    togglePoiFilter = useAppShell((state) => state.togglePoiFilter),
    activeNav = useAppShell((state) => state.activeNav),
    setActiveNav = useAppShell((state) => state.setActiveNav),
    language = useAppShell((state) => state.language),
    mapLayers = useAppShell((state) => state.mapLayers),
    openPlaceData = useAppShell((state) => state.openPlaceData),
    openBottomSheet = useAppShell((state) => state.openBottomSheet),
    routes = useRouteStore((state) => state.routes),
    points = useRouteStore((state) => state.points);
  const [mapToolsOpen, setMapToolsOpen] = useState(false);
  const t = useI18n();
  return (
    <main
      ref={workspaceRef}
      className={`map-workspace fixed inset-0 overflow-hidden ${sidebarCollapsed ? "" : "has-bottom-nav"} ${assistantOpen ? "assistant-open" : ""}`}
      style={
        { "--assistant-width": `${assistantWidth}px` } as React.CSSProperties
      }
      lang={language}
    >
      <MapCanvas
        poiFilters={poiFilters}
        language={language}
        layerVisibility={mapLayers}
        assistantOpen={assistantOpen}
        assistantWidth={assistantWidth}
      />
      <MapActionControls
        assistantOpen={assistantOpen}
        assistantWidth={assistantWidth}
      />
      <nav
        className={`desktop-rail map-primary-nav liquid-card liquid-dock absolute ${sidebarCollapsed ? "dock-hidden" : ""}`}
        aria-label={t("map.primaryNavigation", "Primary navigation")}
        aria-hidden={sidebarCollapsed}
      >
        <LiquidSwitch
          ariaLabel="Map sections"
          value={activeNav}
          onChange={(value) => {
            setActiveNav(value);
            if (value === "Locate")
              window.dispatchEvent(
                new CustomEvent("smartroute:request-current-location"),
              );
            if (value === "Place data") openPlaceData();
            if (value === "Directions")
              openBottomSheet({
                id: "route-planner",
                title: t("routes.title", "Choose your route"),
              });
            setMapToolsOpen(value === "Map tools");
          }}
          items={railItems.map((item) => ({
            value: item.label,
            label: t(item.key, item.label),
            icon: <Icon name={item.icon} />,
          }))}
        />
      </nav>
      {mapToolsOpen && (
        <MapToolsMenu
          hasRoute={routes.length > 0}
          hasPoints={points.length > 0}
          onClearRequested={() => {
            setMapToolsOpen(false);
            setActiveNav("Explore");
          }}
          onAction={(tool) => {
            const events = {
              clear: "smartroute:clear-route-points",
              focus: "smartroute:focus-selected-route",
              reset: "smartroute:reset-map-view",
            } as const;
            window.dispatchEvent(new CustomEvent(events[tool]));
            setMapToolsOpen(false);
            setActiveNav("Explore");
          }}
        />
      )}
      <ClearRouteBottomSheet
        onConfirm={() => {
          window.dispatchEvent(
            new CustomEvent("smartroute:clear-route-points"),
          );
          setActiveNav("Explore");
        }}
      />
      <RoutePanel
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
        language={language}
      />
      <header className="workspace-command-bar absolute z-[650]">
        <div
          className="category-strip-next ml-[-10px] pl-[10px] items-center h-[56px] transition-all duration-300 rounded-full flex min-w-0 gap-2 overflow-x-auto [scrollbar-width:none]"
          aria-label={t("map.filterPlaces", "Filter places")}
        >
          {categories.map((category) => {
            const active = poiFilters.includes(category.key);
            return (
              <button
                key={category.key}
                onClick={() => togglePoiFilter(category.key)}
                aria-pressed={active}
                className={`liquid-chip h-[34px] shrink-0 rounded-full px-4 text-xs font-bold transition-all ${active ? "active text-emerald-800" : "text-slate-700 hover:text-emerald-800"}`}
              >
                {t(category.translationKey, category.key)}
              </button>
            );
          })}
        </div>
      </header>
      <div
        ref={triggerZoneRef}
        className="shop-platform-trigger-zone absolute z-[700] pointer-events-none"
      >
        <motion.button
          type="button"
          className="shop-platform-trigger liquid-pill"
          style={{ x: triggerPosition.x, y: triggerPosition.y }}
          data-flavor={triggerFlavor}
          drag
          dragConstraints={triggerZoneRef}
          dragMomentum={false}
          dragElastic={0.08}
          whileTap={{ scale: 0.96 }}
          aria-label="Open shops and restaurants platform"
          onDragStart={() => {
            suppressShopClick.current = true;
          }}
          onDragEnd={() => {
            const zone = triggerZoneRef.current,
              button = triggerZoneRef.current?.querySelector(
                ".shop-platform-trigger",
              );
            if (zone && button) {
              const zoneRect = zone.getBoundingClientRect(),
                buttonRect = button.getBoundingClientRect();
              setTriggerPosition({
                version: 1,
                x:
                  buttonRect.left -
                  zoneRect.left -
                  (zoneRect.width - buttonRect.width),
                y: buttonRect.top - zoneRect.top,
              });
            }
            window.setTimeout(() => {
              suppressShopClick.current = false;
            }, 180);
          }}
          onClick={(event) => {
            if (suppressShopClick.current) {
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            window.dispatchEvent(
              new CustomEvent("smartroute:open-shop-platform", {
                detail: {
                  anchor: {
                    left: rect.left,
                    top: rect.top,
                    width: rect.width,
                    height: rect.height,
                  },
                },
              }),
            );
          }}
        >
          <Icon name="box" className="h-4 w-4" />
        </motion.button>
      </div>
      <PoiLoader />
      <PlaceDetailPanel />
      <ShopPlatformPanel />
      <AiMapAssistant
        onOpenChange={setAssistantOpen}
        asideWidth={assistantWidth}
        onAsideWidthChange={setAssistantWidth}
      />
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

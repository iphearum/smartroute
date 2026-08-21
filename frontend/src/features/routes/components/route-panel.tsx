"use client";

import { useEffect, useRef, useState } from "react";
import type { IconType } from "react-icons";
import {
  FaBicycle,
  FaCar,
  FaMotorcycle,
  FaRoute,
  FaWalking,
} from "react-icons/fa";
import { FiSend } from "react-icons/fi";
import { useDragControls, type PanInfo } from "framer-motion";
import { placeName, type MapLanguage } from "@/features/i18n/language";
import { PlaceResults } from "@/features/search/components/place-results";
import { usePlaceSearch } from "@/features/search/hooks/use-place-search";
import { useRecentPlaces } from "@/features/search/hooks/use-recent-places";
import { Icon } from "@/shared/ui/icon";
import { LiquidCard, LiquidSwitch } from "@/shared/ui/liquid";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { useAppShell } from "@/shared/state/app-shell-context";
import { PinLocation } from "@/shared/ui/pin";
import { useLocalStore } from "@/shared/hooks/use-local-store";
import { useWindowSession } from "@/shared/hooks/use-window-session";
import type { Coordinate, Place, TravelMode } from "../domain/types";
import { DirectionsDetail } from "./directions-detail";
import { useRouteCalculation } from "../hooks/use-route-calculation";
import { useRouteStore } from "../store/route-store";
import { useI18n } from "@/features/i18n/use-i18n";

const modes: TravelMode[] = ["car", "motorbike", "combined", "bike", "walk"];
const isTravelMode = (value: unknown): value is TravelMode =>
  typeof value === "string" && modes.includes(value as TravelMode);
const modeIcons: Record<TravelMode, IconType> = {
  car: FaCar,
  motorbike: FaMotorcycle,
  combined: FaRoute,
  bike: FaBicycle,
  walk: FaWalking,
};
const modeLabels: Record<TravelMode, string> = {
  car: "Car",
  motorbike: "Motorbike",
  combined: "Suggested",
  bike: "Bike",
  walk: "Walk",
};

export function RoutePanel({
  sidebarCollapsed = false,
  onToggleSidebar,
  language = "en",
}: {
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  language?: MapLanguage;
}) {
  const [showDetails, setShowDetails] = useState(false),
    [focused, setFocused] = useState<number | null>(null),
    [drafts, setDrafts] = useState<Record<number, string>>({});
  const dragBoundsRef = useRef<HTMLDivElement>(null),
    dragControls = useDragControls();
  const {
    entry: windowSession,
    hydrated: windowSessionReady,
    update: updateWindow,
    setOpen: setWindowOpen,
    zIndex,
    bringToFront,
  } = useWindowSession("route-planner-window");

  // The planner is always on screen, so it always holds a slot in the stack.
  // Waiting for hydration keeps it from claiming the top slot on every reload.
  useEffect(() => {
    if (windowSessionReady && !windowSession.open) setWindowOpen(true);
  }, [setWindowOpen, windowSession.open, windowSessionReady]);
  const points = useRouteStore((s) => s.points),
    coordinates = useRouteStore((s) => s.coordinates),
    activePoint = useRouteStore((s) => s.activePoint),
    mode = useRouteStore((s) => s.mode),
    status = useRouteStore((s) => s.status),
    error = useRouteStore((s) => s.error),
    progress = useRouteStore((s) => s.progress),
    routes = useRouteStore((s) => s.routes),
    selectedRoute = useRouteStore((s) => s.selectedRoute);
  const setActivePoint = useRouteStore((s) => s.setActivePoint),
    clearPoint = useRouteStore((s) => s.clearPoint),
    addDestination = useRouteStore((s) => s.addDestination),
    swapEndpoints = useRouteStore((s) => s.swapEndpoints),
    setMode = useRouteStore((s) => s.setMode);
  const [savedMode, saveMode] = useLocalStore<TravelMode>(
    "smartroute-route-mode",
    "combined",
    isTravelMode,
  );
  const t = useI18n();
  const activeSheet = useAppShell((state) => state.bottomSheet),
    openBottomSheet = useAppShell((state) => state.openBottomSheet),
    closeBottomSheet = useAppShell((state) => state.closeBottomSheet);
  const expanded = activeSheet?.id === "route-planner";
  const openPlanner = () =>
    openBottomSheet({
      id: "route-planner",
      title: t("routes.title", "Choose your route"),
    });
  const routeStops = points.filter((point): point is Place => Boolean(point));

  useEffect(() => setMode(savedMode), [savedMode, setMode]);

  useEffect(() => {
    const clampPosition = () => {
      const bounds = dragBoundsRef.current;
      if (!bounds) return;
      const maxX = Math.max(0, bounds.clientWidth - 430),
        maxY = Math.max(0, bounds.clientHeight - 120),
        x = Math.min(Math.max(0, windowSession.x), maxX),
        y = Math.min(Math.max(0, windowSession.y), maxY);
      if (x !== windowSession.x || y !== windowSession.y)
        updateWindow({ x, y });
    };
    clampPosition();
    window.addEventListener("resize", clampPosition);
    return () => window.removeEventListener("resize", clampPosition);
  }, [updateWindow, windowSession.x, windowSession.y]);

  const { calculateAll, calculatePoint, removePoint } = useRouteCalculation(),
    recent = useRecentPlaces(),
    query =
      focused === null
        ? ""
        : (drafts[focused] ??
          (points[focused] ? placeName(points[focused], language) : "")),
    search = usePlaceSearch(query);
  const readyCoordinates = (override?: {
    index: number;
    coordinate: Coordinate;
  }) =>
    coordinates
      .map((item, index) =>
        override?.index === index ? override.coordinate : item,
      )
      .filter(Boolean) as Coordinate[];
  const choose = (place: Place, index: number) => {
    const named = { ...place, name: placeName(place, language) };
    void calculatePoint(index, [named.latitude, named.longitude], named);
    setDrafts((current) => {
      const next = { ...current };
      delete next[index];
      return next;
    });
    recent.remember(place);
    setFocused(null);
    if (index > 0) openPlanner();
  };
  const focus = (index: number) => {
    openPlanner();
    setFocused(index);
    setActivePoint(index);
  };
  const useLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        choose(
          {
            name: "Your location",
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
          activePoint,
        );
        window.dispatchEvent(
          new CustomEvent("smartroute:show-current-location", {
            detail: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
            },
          }),
        );
      },
      (error) =>
        window.dispatchEvent(
          new CustomEvent("smartroute:location-error", {
            detail:
              error.code === error.PERMISSION_DENIED
                ? "Location access was denied. Allow it in device Settings, then try again."
                : "Your current location is unavailable. Check Location Services.",
          }),
        ),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
    );
  const recalculate = () => {
    const ready = readyCoordinates();
    if (ready.length === coordinates.length)
      queueMicrotask(() => calculateAll(ready));
  };
  const topQuery =
    drafts[1] ?? (points[1] ? placeName(points[1], language) : "");
  const finishDrag = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (info.offset.x === 0 && info.offset.y === 0) return;
    updateWindow({
      x: windowSession.x + info.offset.x,
      y: windowSession.y + info.offset.y,
    });
  };
  return (
    <div
      ref={dragBoundsRef}
      className="pointer-events-none absolute inset-0"
      style={{ zIndex }}
      onPointerDownCapture={bringToFront}
    >
      <section
        className="planner-panel pointer-events-auto absolute top-3.5 z-[1100] w-[390px] transition-[left] duration-300"
        // style={{ left: sidebarCollapsed ? 14 : 30 }}
      >
        <LiquidCard className="liquid-search flex h-[56px] items-center rounded-full py-0 pl-[18px] pr-2">
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
              aria-label={
                sidebarCollapsed ? "Open sidebar" : "Collapse sidebar"
              }
              aria-expanded={!sidebarCollapsed}
            >
              <span
                className="flex w-[17px] flex-col gap-[3px]"
                aria-hidden="true"
              >
                <span className="h-[2px] rounded bg-current" />
                <span className="h-[2px] rounded bg-current" />
                <span className="h-[2px] rounded bg-current" />
              </span>
            </button>
          )}
          <input
            value={expanded ? "" : topQuery}
            onFocus={() => {
              if (!expanded) {
                setFocused(1);
                setActivePoint(1);
              }
            }}
            onBlur={() =>
              setFocused((current) => (current === 1 ? null : current))
            }
            onChange={(event) =>
              setDrafts((current) => ({ ...current, 1: event.target.value }))
            }
            placeholder="Search for a place or pin the map"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            readOnly={expanded}
          />
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600"
            aria-label="Search"
          >
            <Icon name="search" className="h-5 w-5" />
          </button>
          <button
            onClick={openPlanner}
            className="ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-700 text-white"
            aria-label="Directions"
          >
            <FiSend aria-hidden="true" className="h-[18px] w-[18px]" />
          </button>
        </LiquidCard>
        {!expanded && focused === 1 && (
          <LiquidCard
            variant="popover"
            className="mt-3 max-h-[70vh] overflow-auto rounded-[24px] p-2"
            onMouseDown={(event) => event.preventDefault()}
          >
            {query.trim().length < 2 ? (
              <>
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Recent searches
                </p>
                <PlaceResults
                  places={recent.places}
                  onSelect={(place) => choose(place, 1)}
                  history
                  language={language}
                />
              </>
            ) : (
              <PlaceResults
                places={search.results}
                onSelect={(place) => choose(place, 1)}
                language={language}
              />
            )}
          </LiquidCard>
        )}
        <BottomSheet
          id="route-planner"
          title={t("routes.title", "Choose your route")}
          ariaLabelledBy="route-planner-title"
          className="route-planner-card mt-3 max-h-[calc(100dvh-92px)] overflow-auto rounded-[28px]"
          draggableProps={{
            initialSnap: "full",
            drag: true,
            dragListener: false,
            sheetDragControls: dragControls,
            dragConstraints: dragBoundsRef,
            dragElastic: 0.04,
            dragMomentum: false,
            onDragEnd: finishDrag,
            style: { x: windowSession.x, y: windowSession.y },
          }}
        >
          {showDetails && routes[selectedRoute] ? (
            <DirectionsDetail
              route={routes[selectedRoute]}
              destination={points.at(-1) || null}
              onBack={() => setShowDetails(false)}
              onFocus={([longitude, latitude]) =>
                window.dispatchEvent(
                  new CustomEvent("smartroute:focus-coordinate", {
                    detail: { latitude, longitude },
                  }),
                )
              }
            />
          ) : (
            <>
              <header
                className="route-planner-header flex items-center gap-3 px-5 pb-2 pt-4"
                onPointerDown={(event) => {
                  const target = event.target as HTMLElement;
                  if (
                    target.closest(
                      'button, a, input, select, textarea, [role="button"], [contenteditable="true"]',
                    )
                  )
                    return;
                  dragControls.start(event);
                }}
              >
                <div
                  className="route-planner-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Drag directions panel"
                  onPointerDown={(event) => dragControls.start(event)}
                  onKeyDown={(event) => {
                    const offsets = {
                      ArrowLeft: [-24, 0],
                      ArrowRight: [24, 0],
                      ArrowUp: [0, -24],
                      ArrowDown: [0, 24],
                    } as const;
                    const offset = offsets[event.key as keyof typeof offsets];
                    if (!offset) return;
                    event.preventDefault();
                    updateWindow({
                      x: windowSession.x + offset[0],
                      y: windowSession.y + offset[1],
                    });
                  }}
                >
                  <span />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
                    Directions
                  </p>
                  <strong id="route-planner-title" className="text-lg">
                    Choose your route
                  </strong>
                </div>
                <button
                  onClick={() => closeBottomSheet("route-planner")}
                  className="grid h-8 w-8 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
                >
                  <Icon name="close" className="h-5 w-5" />
                </button>
              </header>
              <div className="route-mode-shell liquid-card mx-3 my-2 h-[58px] rounded-full p-1">
                <LiquidSwitch
                  className="route-mode-switch"
                  ariaLabel="Travel mode"
                  value={mode}
                  onChange={(value) => {
                    setMode(value);
                    saveMode(value);
                    recalculate();
                  }}
                  items={modes.map((value) => {
                    const ModeIcon = modeIcons[value];
                    return {
                      value,
                      label: modeLabels[value],
                      icon: <ModeIcon />,
                    };
                  })}
                />
              </div>
              <div className="px-[18px] pb-[18px] pt-2">
                <div className="relative pl-8">
                  <span className="absolute bottom-8 left-[9px] top-8 w-px bg-slate-300" />
                  {points.map((point, index) => {
                    const last = index === points.length - 1;
                    return (
                      <div key={index} className="relative mb-2">
                        <PinLocation
                          size={24}
                          color={
                            index === 0
                              ? "var(--color-brand-primary)"
                              : last
                                ? "var(--color-status-danger)"
                                : "var(--color-status-info)"
                          }
                          className="route-point-marker absolute -left-[35px] top-[14px] z-10"
                        />
                        <label
                          onClick={() => focus(index)}
                          className={`route-point-card flex min-h-[60px] items-center rounded-[18px] border px-3 py-2 ${activePoint === index ? "active" : ""}`}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-slate-500">
                              {index === 0
                                ? "Starting point"
                                : last
                                  ? `Destination ${point?.privince ?? ""}`
                                  : `Stop ${index}`}
                            </span>
                            <input
                              value={drafts[index] ?? point?.name ?? ""}
                              onFocus={() => focus(index)}
                              onBlur={() =>
                                setFocused((current) =>
                                  current === index ? null : current,
                                )
                              }
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [index]: event.target.value,
                                }))
                              }
                              placeholder={
                                index === 0
                                  ? "Search or pin on map"
                                  : last
                                    ? "Search or pin destination"
                                    : "Search or pin stop"
                              }
                              className="w-full bg-transparent text-[13px] font-semibold outline-none"
                            />
                          </span>
                          <button
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (points.length > 2 && index > 0)
                                void removePoint(index);
                              else clearPoint(index);
                            }}
                            className="h-7 w-7 rounded-full text-slate-400 hover:bg-slate-100"
                          >
                            ×
                          </button>
                        </label>
                        {focused === index && query.trim().length >= 2 && (
                          <div
                            className="liquid-popover absolute left-0 right-0 top-full z-30 mt-2 max-h-60 overflow-auto rounded-[18px] p-1"
                            onMouseDown={(event) => event.preventDefault()}
                          >
                            <PlaceResults
                              places={search.results}
                              onSelect={(place) => choose(place, index)}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={addDestination}
                  disabled={points.length >= 7}
                  className="route-add-action mb-3 h-11 w-full rounded-[16px] text-xs font-bold disabled:opacity-40"
                >
                  ＋ Add destination
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={useLocation}
                    className="route-secondary-action flex h-10 items-center justify-center gap-2 rounded-[16px] text-[11px] font-bold text-slate-600"
                  >
                    <Icon name="locate" className="h-4 w-4" />
                    Use my location
                  </button>
                  <button
                    onClick={() => {
                      swapEndpoints();
                      const swapped = [coordinates[1], coordinates[0]].filter(
                        Boolean,
                      ) as Coordinate[];
                      if (swapped.length === 2)
                        queueMicrotask(() => calculateAll(swapped));
                    }}
                    disabled={points.length !== 2}
                    className="route-secondary-action h-10 rounded-[16px] text-[11px] font-bold text-slate-600 disabled:opacity-40"
                  >
                    ⇅ Swap points
                  </button>
                </div>
                <p
                  className={`route-status mt-3 rounded-[16px] p-3 text-[10px] ${status === "error" ? "text-red-600" : "text-slate-500"}`}
                >
                  {status === "calculating"
                    ? progress || "Calculating route…"
                    : error ||
                      "Click the map, search, or drag a marker to change a point."}
                </p>
                {routes[selectedRoute] && (
                  <button
                    onClick={() => setShowDetails(true)}
                    className="route-summary-card mt-3 w-full text-left"
                  >
                    <span className="route-summary-header">
                      <span>
                        <small>{t("routes.travelTime", "Travel time")}</small>
                        <strong>
                          {Math.max(
                            1,
                            Math.round(routes[selectedRoute].duration / 60),
                          )}{" "}
                          {t("routes.minutes", "min")}
                        </strong>
                      </span>
                      <span>
                        <small>{t("routes.distance", "Distance")}</small>
                        <strong>
                          {(routes[selectedRoute].length / 1000).toFixed(1)} km
                        </strong>
                      </span>
                      <Icon
                        name="chevron-right"
                        className="route-summary-chevron"
                      />
                    </span>
                    <span className="route-summary-stops">
                      {routeStops.slice(0, 2).map((stop, index) => (
                        <span key={`${stop.name}-${index}`}>
                          <i className={index === 0 ? "start" : "end"} />
                          <strong>{stop.name}</strong>
                        </span>
                      ))}
                    </span>
                    <span className="route-summary-footer">
                      <span>{modeLabels[mode]}</span>
                      <span>
                        {t("routes.viewDirections", "View directions")}
                      </span>
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </BottomSheet>
      </section>
    </div>
  );
}

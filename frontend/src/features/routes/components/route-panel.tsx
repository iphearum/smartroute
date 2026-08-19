"use client";

import { useEffect, useState } from "react";
import { placeName, type MapLanguage } from "@/features/i18n/language";
import { PlaceResults } from "@/features/search/components/place-results";
import { usePlaceSearch } from "@/features/search/hooks/use-place-search";
import { useRecentPlaces } from "@/features/search/hooks/use-recent-places";
import { Icon } from "@/shared/ui/icon";
import {
  DraggableLiquidSheet,
  LiquidCard,
  LiquidSwitch,
} from "@/shared/ui/liquid";
import { PinLocation } from "@/shared/ui/pin";
import { MotorbikeIcon } from "@/shared/ui/motorbike-icon";
import { CombinedModeIcon } from "@/shared/ui/combined-mode-icon";
import { useLocalStore } from "@/shared/hooks/use-local-store";
import { BikeIcon, CarIcon, WalkIcon } from "@/shared/ui/vehicle-icons";
import type { Coordinate, Place, TravelMode } from "../domain/types";
import { DirectionsDetail } from "./directions-detail";
import { useRouteCalculation } from "../hooks/use-route-calculation";
import { useRouteStore } from "../store/route-store";

const modes: TravelMode[] = ["car", "motorbike", "combined", "bike", "walk"];
const isTravelMode = (value: unknown): value is TravelMode =>
  typeof value === "string" && modes.includes(value as TravelMode);
const modeIcons = {
  car: CarIcon,
  motorbike: MotorbikeIcon,
  combined: CombinedModeIcon,
  bike: BikeIcon,
  walk: WalkIcon,
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
  const [expanded, setExpanded] = useState(false),
    [showDetails, setShowDetails] = useState(false),
    [focused, setFocused] = useState<number | null>(null),
    [drafts, setDrafts] = useState<Record<number, string>>({});
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

  useEffect(() => setMode(savedMode), [savedMode, setMode]);

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
    if (index > 0) setExpanded(true);
  };
  const focus = (index: number) => {
    setExpanded(true);
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
  return (
    <section
      className="planner-panel absolute top-3.5 z-[1100] w-[390px] transition-[left] duration-300"
      // style={{ left: sidebarCollapsed ? 14 : 30 }}
    >
      <LiquidCard className="liquid-search flex h-[56px] items-center rounded-full py-0 pl-[18px] pr-2">
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-slate-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
            aria-label={sidebarCollapsed ? "Open sidebar" : "Collapse sidebar"}
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
          onBlur={() => setFocused((current) => (current === 1 ? null : current))}
          onChange={(event) =>
            setDrafts((current) => ({ ...current, 1: event.target.value }))
          }
          placeholder="Search for a place or pin the map"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          readOnly={expanded}
        />
        <button
          className="grid h-9 w-9 place-items-center rounded-full text-slate-600"
          aria-label="Search"
        >
          <Icon name="search" className="h-5 w-5" />
        </button>
        <button
          onClick={() => setExpanded(true)}
          className="ml-1 grid h-9 w-9 place-items-center rounded-full bg-emerald-700 text-white"
          aria-label="Directions"
        >
          <Icon name="directions" className="h-[22px] w-[22px]" />
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
      <DraggableLiquidSheet
        open={expanded}
        onClose={() => setExpanded(false)}
        ariaLabel="Route planner"
        className="route-planner-card mt-3 max-h-[calc(100dvh-92px)] overflow-auto rounded-[28px]"
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
            <header className="route-planner-header flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <p className="text-[9px] font-extrabold uppercase tracking-widest text-emerald-700">
                  Directions
                </p>
                <strong className="text-lg">Choose your route</strong>
              </div>
              <button
                onClick={() => setExpanded(false)}
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
                          index === 0 ? "#047857" : last ? "#ef4444" : "#6366f1"
                        }
                        className="absolute -left-[35px] top-[14px] z-10 drop-shadow-[0_2px_2px_rgba(15,23,42,.25)]"
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
                                ? `Destination ${point?.privince??''}`
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
                  className="mt-3 flex w-full items-center rounded-xl border-l-4 border-emerald-700 bg-emerald-50 p-3 text-left transition-colors hover:bg-emerald-100"
                >
                  <span className="flex-1">
                    <strong className="text-lg text-emerald-800">
                      {Math.max(
                        1,
                        Math.round(routes[selectedRoute].duration / 60),
                      )}{" "}
                      min
                    </strong>
                    <span className="ml-2 text-xs text-slate-500">
                      {(routes[selectedRoute].length / 1000).toFixed(1)} km
                    </span>
                    <span className="mt-1 block text-[10px] text-slate-500">
                      View turn-by-turn directions
                    </span>
                  </span>
                  <span className="text-xl text-emerald-700">›</span>
                </button>
              )}
            </div>
          </>
        )}
      </DraggableLiquidSheet>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type LType from "leaflet";
import type { Coordinate, Place } from "@/features/routes/domain/types";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { routesApi } from "@/features/routes/api/routes-api";
import { placeName, type MapLanguage } from "@/features/i18n/language";
import { PinLocation } from "@/shared/ui/pin";
import { MotorbikeIcon } from "@/shared/ui/motorbike-icon";
import { BikeIcon, CarIcon, WalkIcon } from "@/shared/ui/vehicle-icons";
const poiIcons = {
  food: '<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
  cafe: '<path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm13 2h2a3 3 0 0 1 0 6h-2M7 3v2m4-2v2m4-2v2"/>',
  hotel:
    '<path d="M3 20V7m18 13V11a3 3 0 0 0-3-3h-7v8M3 16h18M6 11h5V7a2 2 0 0 0-2-2H6v6Z"/>',
  medical: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
  shopping: '<path d="M5 8h14l-1 13H6L5 8Zm3 1V6a4 4 0 0 1 8 0v3"/>',
  fuel: '<path d="M5 3h10v18H5V3Zm2 3h6v5H7V6Zm8 1h3l2 3v8a2 2 0 0 1-4 0v-5"/>',
  education:
    '<path d="m2 9 10-5 10 5-10 5L2 9Zm4 2v5c3 3 9 3 12 0v-5M22 9v7"/>',
  finance: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M3 21h18"/>',
  park: '<path d="M12 3 7 10h3l-5 7h6v4h2v-4h6l-5-7h3l-5-7Z"/>',
  transit: '<path d="M5 4h14v12H5V4Zm3 15h8M8 8h8M8 13h.01M16 13h.01"/>',
  place:
    '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>',
} as const;
function poiAppearance(place: Place) {
  const value =
    `${String(place.metadata?.category_group || "")} ${place.category || ""}`.toLowerCase();
  let key: keyof typeof poiIcons = "place";
  if (/restaurant|fast_food|food|bar|pub/.test(value)) key = "food";
  else if (/cafe|coffee/.test(value)) key = "cafe";
  else if (/hotel|guest|hostel|motel/.test(value)) key = "hotel";
  else if (/hospital|clinic|doctor|dentist|pharmacy|health/.test(value))
    key = "medical";
  else if (/shop|mall|market|supermarket/.test(value)) key = "shopping";
  else if (/fuel|charging/.test(value)) key = "fuel";
  else if (/school|college|university|library/.test(value)) key = "education";
  else if (/bank|atm|finance/.test(value)) key = "finance";
  else if (/park|garden|playground|nature/.test(value)) key = "park";
  else if (/bus|station|transit|ferry/.test(value)) key = "transit";
  return {
    key,
    icon: `<svg viewBox="0 0 24 24" aria-hidden="true">${poiIcons[key]}</svg>`,
  };
}
const poiPriority: Record<keyof typeof poiIcons, number> = {
  medical: 0,
  transit: 1,
  fuel: 2,
  shopping: 3,
  hotel: 4,
  education: 5,
  park: 6,
  finance: 7,
  food: 8,
  cafe: 9,
  place: 10,
};
function poiImageUrl(metadata: Record<string, unknown>) {
  for (const value of [metadata.image, metadata.wikimedia_commons]) {
    if (typeof value !== "string") continue;
    if (/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/i.test(value)) {
      const name = value.split("/wiki/File:")[1];
      if (name)
        return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(decodeURIComponent(name))}`;
    }
    if (/^https:\/\//i.test(value)) return value;
    if (/^File:/i.test(value))
      return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(value.slice(5).trim())}`;
  }
  return null;
}
function poiCard(place: Place, onAdd: () => void) {
  const displayName = place.name,
    metadata = place.metadata || {},
    appearance = poiAppearance(place),
    card = document.createElement("article"),
    fallback = document.createElement("div");
  card.className = `poi-preview poi-${appearance.key}`;
  fallback.className = "poi-preview-fallback";
  fallback.innerHTML = appearance.icon;
  const imageValue = poiImageUrl(metadata);
  if (imageValue) {
    const image = document.createElement("img");
    image.className = "poi-preview-image";
    image.src = imageValue;
    image.alt = `Photo of ${displayName}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.replaceWith(fallback));
    card.append(image);
  } else card.append(fallback);
  const body = document.createElement("div"),
    heading = document.createElement("div"),
    title = document.createElement("strong"),
    category = document.createElement("span");
  body.className = "poi-preview-body";
  heading.className = "poi-preview-heading";
  title.textContent = displayName;
  category.textContent = (place.category || "Place").replaceAll("_", " ");
  heading.append(title, category);
  body.append(heading);
  if (place.address) {
    const address = document.createElement("p");
    address.textContent = place.address;
    body.append(address);
  }
  if (typeof metadata.opening_hours === "string") {
    const hours = document.createElement("p");
    hours.className = "poi-preview-hours";
    hours.textContent = `Open hours · ${metadata.opening_hours}`;
    body.append(hours);
  }
  const footer = document.createElement("div"),
    source = document.createElement("small"),
    button = document.createElement("button");
  footer.className = "poi-preview-footer";
  source.textContent = "OpenStreetMap";
  button.type = "button";
  button.textContent = "＋ Add stop";
  button.addEventListener("click", onAdd);
  footer.append(source, button);
  body.append(footer);
  card.append(body);
  return card;
}
export function MapCanvas({
  poiFilters = [],
  language = "en",
}: {
  poiFilters?: string[];
  language?: MapLanguage;
}) {
  const element = useRef<HTMLDivElement>(null),
    leaflet = useRef<typeof LType | null>(null),
    map = useRef<LType.Map | null>(null),
    routeLayers = useRef<LType.Layer[]>([]),
    markers = useRef<LType.Marker[]>([]),
    poiLayers = useRef<LType.Marker[]>([]),
    loadedPlacesBounds = useRef<LType.LatLngBounds | null>(null);
  const [places, setPlaces] = useState<Place[]>([]),
    [mapReady, setMapReady] = useState(false),
    coordinates = useRouteStore((s) => s.coordinates),
    routes = useRouteStore((s) => s.routes),
    selected = useRouteStore((s) => s.selectedRoute),
    mode = useRouteStore((s) => s.mode),
    setCoordinate = useRouteStore((s) => s.setCoordinate),
    setSelectedRoute = useRouteStore((s) => s.setSelectedRoute),
    calculate = useRouteCalculation();
  useEffect(() => {
    const focus = (event: Event) => {
      const detail = (
        event as CustomEvent<{ latitude: number; longitude: number }>
      ).detail;
      if (
        Number.isFinite(detail?.latitude) &&
        Number.isFinite(detail?.longitude)
      )
        map.current?.flyTo([detail.latitude, detail.longitude], 17, {
          duration: 0.6,
        });
    };
    window.addEventListener("smartroute:focus-coordinate", focus);
    return () =>
      window.removeEventListener("smartroute:focus-coordinate", focus);
  }, []);
  useEffect(() => {
    let active = true;
    import("leaflet").then(({ default: L }) => {
      if (!active || !element.current || map.current) return;
      leaflet.current = L;
      map.current = L.map(element.current, { zoomControl: false }).setView(
        [11.5564, 104.9282],
        13,
      );
      L.control.zoom({ position: "bottomright" }).addTo(map.current);
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxZoom: 20,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
        },
      ).addTo(map.current);
      map.current.on("click", async (event) => {
        const coordinate: Coordinate = [event.latlng.lat, event.latlng.lng],
          state = useRouteStore.getState(),
          index = state.activePoint;
        state.setPoint(index, {
          name: "Pinned location",
          latitude: coordinate[0],
          longitude: coordinate[1],
        });
        try {
          const nearest = await routesApi.nearest(coordinate);
          useRouteStore.getState().setPoint(index, {
            name: nearest.name || "Pinned location",
            latitude: coordinate[0],
            longitude: coordinate[1],
          });
        } catch {}
        const latest = useRouteStore.getState(),
          ready = latest.coordinates.filter(Boolean) as Coordinate[];
        if (ready.length === latest.coordinates.length) void calculate(ready);
      });
      setMapReady(true);
    });
    return () => {
      active = false;
      map.current?.remove();
      map.current = null;
    };
  }, [calculate]);
  useEffect(() => {
    const currentMap = map.current;
    if (!currentMap || !mapReady) return;
    let controller: AbortController | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      active = true;
    const indicator = document.getElementById("map-data-loading");
    const load = () => {
      const visibleBounds = currentMap.getBounds();
      if (currentMap.getZoom() < 14) {
        loadedPlacesBounds.current = null;
        setPlaces((current) => (current.length ? [] : current));
        return;
      }
      if (loadedPlacesBounds.current?.contains(visibleBounds)) return;
      controller?.abort();
      controller = new AbortController();
      const bounds = visibleBounds.pad(0.35);
      indicator?.classList.replace("hidden", "flex");
      routesApi
        .viewportPlaces(
          {
            south: bounds.getSouth(),
            west: bounds.getWest(),
            north: bounds.getNorth(),
            east: bounds.getEast(),
          },
          250,
          controller.signal,
        )
        .then((items) => {
          if (!active) return;
          loadedPlacesBounds.current = bounds;
          setPlaces(
            items.map((place) => ({
              ...place,
              name: placeName(place, language),
            })),
          );
        })
        .catch((error) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
        })
        .finally(() => {
          if (active && !controller?.signal.aborted)
            indicator?.classList.replace("flex", "hidden");
        });
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 250);
    };
    currentMap.on("moveend zoomend", schedule);
    load();
    return () => {
      active = false;
      loadedPlacesBounds.current = null;
      controller?.abort();
      if (timer) clearTimeout(timer);
      currentMap.off("moveend zoomend", schedule);
      indicator?.classList.replace("flex", "hidden");
    };
  }, [mapReady, language]);
  useEffect(() => {
    const L = leaflet.current,
      currentMap = map.current;
    if (!L || !currentMap) return;
    markers.current.forEach((marker) => marker.remove());
    markers.current = [];
    coordinates.forEach((point, index) => {
      if (!point) return;
      const color =
          index === 0
            ? "#047857"
            : index === coordinates.length - 1
              ? "#ef4444"
              : "#6366f1",
        icon = L.divIcon({
          className: "",
          html: renderToStaticMarkup(
            <PinLocation
              size={34}
              color={color}
              stroke="white"
              strokeWidth={4}
              strokeLinejoin="round"
              paintOrder="stroke"
              style={{ filter: "drop-shadow(0 2px 3px rgb(15 23 42 / 35%))" }}
            />,
          ),
          iconSize: [34, 34],
          iconAnchor: [17, 34],
        });
      const marker = L.marker(point, { icon, draggable: true }).addTo(
        currentMap,
      );
      marker.bindTooltip(
        index === 0
          ? "Starting point"
          : index === coordinates.length - 1
            ? "Destination"
            : `Stop ${index}`,
      );
      marker.on("dragend", (event) => {
        const value = (event.target as LType.Marker).getLatLng(),
          next: [number, number] = [value.lat, value.lng];
        setCoordinate(index, next);
        const all = coordinates
          .map((item, i) => (i === index ? next : item))
          .filter(Boolean) as Coordinate[];
        if (all.length === coordinates.length) void calculate(all);
      });
      markers.current.push(marker);
    });
  }, [coordinates, setCoordinate, calculate]);
  useEffect(() => {
    const L = leaflet.current,
      currentMap = map.current;
    if (!L || !currentMap) return;
    poiLayers.current.forEach((marker) => marker.remove());
    poiLayers.current = [];
    const entries = places
      .flatMap((place) => {
        const appearance = poiAppearance(place);
        if (poiFilters.length && !poiFilters.includes(appearance.key))
          return [];
        const icon = L.divIcon({
            className: `poi-map-icon poi-${appearance.key}`,
            html: `<span>${appearance.icon}</span>`,
            iconSize: [28, 28],
            iconAnchor: [14, 14],
          }),
          marker = L.marker([place.latitude, place.longitude], {
            icon,
            zIndexOffset: 100,
          });
        marker.bindTooltip(place.name, {
          permanent: true,
          direction: "right",
          offset: [13, 0],
          className: `poi-name-tooltip poi-${appearance.key}`,
        });
        let closeTimer: ReturnType<typeof setTimeout> | undefined;
        marker.bindPopup(() => {
          const card = poiCard(place, () => {
            const state = useRouteStore.getState();
            state.setPoint(state.activePoint, place);
            const latest = useRouteStore.getState(),
              ready = latest.coordinates.filter(Boolean) as Coordinate[];
            if (ready.length === latest.coordinates.length)
              void calculate(ready);
            marker.closePopup();
          });
          L.DomEvent.disableClickPropagation(card);
          return card;
        }, {
          className: "poi-popup",
          closeButton: false,
          offset: [0, -10],
          maxWidth: 320,
          minWidth: 300,
        });
        marker.on("mouseover", () => {
          if (closeTimer) clearTimeout(closeTimer);
          marker.openPopup();
        });
        marker.on("mouseout", () => {
          closeTimer = setTimeout(() => marker.closePopup(), 180);
        });
        marker.on("popupopen", () => {
          const popup = marker.getPopup()?.getElement();
          popup?.addEventListener("mouseenter", () => {
            if (closeTimer) clearTimeout(closeTimer);
          });
          popup?.addEventListener("mouseleave", () => marker.closePopup());
        });
        poiLayers.current.push(marker);
        return [{ marker, priority: poiPriority[appearance.key] }];
      })
      .sort((a, b) => a.priority - b.priority);
    const refresh = () => {
      const zoom = currentMap.getZoom(),
        spacing =
          zoom >= 18
            ? 30
            : zoom === 17
              ? 36
              : zoom === 16
                ? 46
                : zoom === 15
                  ? 62
                  : 90,
        maxVisible =
          zoom >= 18
            ? 100
            : zoom === 17
              ? 85
              : zoom === 16
                ? 60
                : zoom === 15
                  ? 35
                  : zoom === 14
                    ? 16
                    : 0,
        occupied = new Set<string>(),
        visible = new Set<LType.Marker>();
      if (maxVisible) {
        for (const entry of entries) {
          const point = currentMap.latLngToContainerPoint(
              entry.marker.getLatLng(),
            ),
            cellX = Math.floor(point.x / spacing),
            cellY = Math.floor(point.y / spacing);
          let blocked = false;
          for (let x = -1; x <= 1 && !blocked; x++)
            for (let y = -1; y <= 1; y++)
              if (occupied.has(`${cellX + x}:${cellY + y}`)) {
                blocked = true;
                break;
              }
          if (blocked) continue;
          occupied.add(`${cellX}:${cellY}`);
          visible.add(entry.marker);
          if (visible.size >= maxVisible) break;
        }
      }
      entries.forEach(({ marker, priority }) => {
        const shown = currentMap.hasLayer(marker),
          shouldShow = visible.has(marker),
          showName =
            shouldShow && (zoom >= 17 || (zoom === 16 && priority <= 4));
        if (shouldShow && !shown) marker.addTo(currentMap);
        else if (!shouldShow && shown) marker.remove();
        if (showName && currentMap.hasLayer(marker)) marker.openTooltip();
        else marker.closeTooltip();
      });
    };
    currentMap.on("zoomend moveend", refresh);
    refresh();
    return () => {
      currentMap.off("zoomend moveend", refresh);
      poiLayers.current.forEach((marker) => marker.remove());
      poiLayers.current = [];
    };
  }, [places, poiFilters, mapReady, calculate]);
  useEffect(() => {
    const L = leaflet.current,
      currentMap = map.current;
    if (!L || !currentMap) return;
    routeLayers.current.forEach((layer) => layer.remove());
    routeLayers.current = [];
    const drawOrder = routes
      .map((route, index) => ({ route, index }))
      .sort(
        (a, b) => Number(a.index === selected) - Number(b.index === selected),
      );
    drawOrder.forEach(({ route, index }) => {
      const active = index === selected,
        geometries = route.segments?.length
          ? route.segments.map((segment) => segment.geometry)
          : [route.geometry];
      geometries.forEach((geometry) => {
        const points = geometry.map(
          ([lon, lat]) => [lat, lon] as Coordinate,
        );
        if (points.length < 2) return;
        const outline = L.polyline(points, {
          color: "white",
          weight: active ? 11 : 7,
          opacity: 0.9,
        }).addTo(currentMap),
          line = L.polyline(points, {
            color: active ? "#087f5b" : "#6475dc",
            weight: active ? 7 : 4,
            opacity: active ? 1 : 0.6,
          }).addTo(currentMap);
        routeLayers.current.push(outline, line);
        line.on("click", () => setSelectedRoute(index));
        const path = (line as LType.Polyline & { _path?: SVGPathElement })
          ._path;
        if (path) {
          const length = Math.ceil(path.getTotalLength());
          path.style.setProperty("--route-length", String(length));
          path.classList.add("route-draw");
        }
      });
    });
    (routes[selected]?.connectors || []).forEach((connector) => {
      const points = connector.map(([lon, lat]) => [lat, lon] as Coordinate),
        outline = L.polyline(points, {
          color: "white",
          weight: 7,
          opacity: 0.95,
          dashArray: "2 9",
          lineCap: "round",
        }).addTo(currentMap),
        line = L.polyline(points, {
          color: "#087f5b",
          weight: 4,
          opacity: 0.9,
          dashArray: "2 9",
          lineCap: "round",
        }).addTo(currentMap);
      routeLayers.current.push(outline, line);
    });
    const chosen = routes[selected];
    if (chosen) {
      const bounds = L.latLngBounds(
        [...chosen.geometry, ...(chosen.connectors || []).flat()].map(
          ([lon, lat]) => [lat, lon] as Coordinate,
        ),
      );
      currentMap.fitBounds(bounds, {
        paddingTopLeft: [420, 70],
        paddingBottomRight: [60, 60],
        maxZoom: 17,
      });
    }
    const occupiedLabelPoints: LType.Point[] = [];
    routes.forEach((route, index) => {
      if (!route.geometry.length) return;
      const preferredFraction = Math.min(0.8, 0.32 + index * 0.18),
        candidateFractions = [
          ...new Set([preferredFraction, 0.5, 0.3, 0.7, 0.15, 0.85]),
        ],
        candidates = candidateFractions.map((fraction) => {
          const [longitude, latitude] =
            route.geometry[
              Math.min(
                route.geometry.length - 1,
                Math.round((route.geometry.length - 1) * fraction),
              )
            ];
          return {
            longitude,
            latitude,
            point: currentMap.latLngToContainerPoint([latitude, longitude]),
          };
        }),
        labelPosition =
          candidates.find((candidate) =>
            occupiedLabelPoints.every(
              (point) =>
                Math.abs(candidate.point.x - point.x) >= 112 ||
                Math.abs(candidate.point.y - point.y) >= 64,
            ),
          ) ?? candidates[0],
        lon = labelPosition.longitude,
        lat = labelPosition.latitude,
        active = index === selected,
        minutes = Math.max(1, Math.round(route.duration / 60)),
        distance = (route.length / 1000).toFixed(1),
        VehicleIcon = {
          car: CarIcon,
          motorbike: MotorbikeIcon,
          bike: BikeIcon,
          walk: WalkIcon,
        }[mode],
        symbol = renderToStaticMarkup(<VehicleIcon />);
      occupiedLabelPoints.push(labelPosition.point);
      const mapPoint = labelPosition.point,
        mapWidth = currentMap.getSize().x,
        pointerPosition =
          mapPoint.x < 120
            ? "left"
            : mapPoint.x > mapWidth - 120
              ? "right"
              : (["left", "center", "right"] as const)[index % 3],
        pointerAnchor = { left: 18, center: 48, right: 78 }[pointerPosition],
        icon = L.divIcon({
          className: "route-info-icon",
          html: `<button type="button" class="route-info-label pointer-${pointerPosition}${active ? " active" : ""}" aria-label="Select ${minutes} minute route"><span><i class="route-vehicle" aria-hidden="true">${symbol}</i><strong>${minutes} min</strong></span><small>${distance} km</small></button>`,
          iconSize: [96, 54],
          iconAnchor: [pointerAnchor, 54],
        });
      const label = L.marker([lat, lon], {
        icon,
        zIndexOffset: active ? 500 : 300,
        interactive: true,
      }).addTo(currentMap);
      label.on("click", () => setSelectedRoute(index));
      routeLayers.current.push(label);
    });
  }, [routes, selected, mode, setSelectedRoute]);
  return (
    <div
      ref={element}
      className="absolute inset-0"
      aria-label="Interactive route map"
    />
  );
}

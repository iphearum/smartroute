import { api } from "@/shared/api/http";
import type {
  Coordinate,
  CoordinateRouteResponse,
  Place,
  TrafficProfile,
  TravelMode,
} from "../domain/types";
export const routesApi = {
  search: (query: string, limit = 6) =>
    api<{ results: Place[] }>(
      `/location/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    ),
  nearest: (coordinate: Coordinate) =>
    api<{ name: string; latitude: number; longitude: number }>(
      `/location/nearest?lat=${coordinate[0]}&lon=${coordinate[1]}`,
    ),
  places: (limit = 100) =>
    api<Place[]>(`/maps/cambodia/phnom_penh/places?limit=${limit}`),
  viewportPlaces: (
    bounds: { south: number; west: number; north: number; east: number },
    limit = 500,
    signal?: AbortSignal,
  ) =>
    api<Place[]>(
      `/maps/data/viewport/places?country=cambodia&south=${bounds.south}&west=${bounds.west}&north=${bounds.north}&east=${bounds.east}&limit=${limit}`,
      { signal },
    ),
  calculate: (
    coordinates: Coordinate[],
    mode: TravelMode,
    traffic: TrafficProfile,
    allowDestinationAccess = false,
  ) =>
    api<CoordinateRouteResponse>("/route/by-coordinates", {
      method: "POST",
      body: JSON.stringify({
        coordinates,
        mode,
        traffic,
        allow_destination_access: allowDestinationAccess,
      }),
    }),
  importPlaces: (query: string) =>
    api<{ id: string }>("/maps/cambodia/phnom_penh/places/import-osm", {
      method: "POST",
      body: JSON.stringify({ query }),
    }),
  importStatus: (id: string) =>
    api<Record<string, number | string>>(
      `/maps/cambodia/phnom_penh/places/import-osm/${encodeURIComponent(id)}`,
    ),
};

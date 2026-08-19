import { create } from "zustand";
import type {
  Coordinate,
  Place,
  RouteOption,
  RouteStatus,
  TrafficProfile,
  TravelMode,
} from "../domain/types";
export interface LegState {
  status: "idle" | "calculating" | "ready" | "error";
  routes: RouteOption[];
  selectedIndex: number;
  error: string | null;
}
const idleLeg = (): LegState => ({
  status: "idle",
  routes: [],
  selectedIndex: 0,
  error: null,
});
interface RouteState {
  points: (Place | null)[];
  coordinates: (Coordinate | null)[];
  activePoint: number;
  mode: TravelMode;
  traffic: TrafficProfile;
  allowDestinationAccess: boolean;
  legs: LegState[];
  routes: RouteOption[];
  selectedRoute: number;
  status: RouteStatus;
  error: string | null;
  progress: string | null;
  setActivePoint: (index: number) => void;
  setPoint: (index: number, place: Place) => void;
  setCoordinate: (index: number, value: Coordinate) => void;
  clearPoint: (index: number) => void;
  addDestination: () => void;
  removeDestination: (index: number) => void;
  swapEndpoints: () => void;
  setMode: (mode: TravelMode) => void;
  setTraffic: (traffic: TrafficProfile) => void;
  setAllowDestinationAccess: (allow: boolean) => void;
  setSelectedRoute: (index: number) => void;
  setLeg: (index: number, patch: Partial<LegState>) => void;
  spliceLegs: (start: number, deleteCount: number, ...items: LegState[]) => void;
  setCalculation: (routes: RouteOption[]) => void;
  setStatus: (status: RouteStatus, error?: string | null) => void;
  setProgress: (progress: string | null) => void;
}
export const useRouteStore = create<RouteState>((set) => ({
  points: [null, null],
  coordinates: [null, null],
  activePoint: 0,
  mode: "combined",
  traffic: "normal",
  allowDestinationAccess: false,
  legs: [idleLeg()],
  routes: [],
  selectedRoute: 0,
  status: "idle",
  error: null,
  progress: null,
  setActivePoint: (activePoint) => set({ activePoint }),
  setPoint: (index, place) =>
    set((state) => {
      const points = [...state.points],
        coordinates = [...state.coordinates];
      points[index] = place;
      coordinates[index] = [place.latitude, place.longitude];
      return {
        points,
        coordinates,
        activePoint:
          index === 0 && coordinates[1] === null ? 1 : state.activePoint,
      };
    }),
  setCoordinate: (index, value) =>
    set((state) => {
      const coordinates = [...state.coordinates];
      coordinates[index] = value;
      return { coordinates };
    }),
  clearPoint: (index) =>
    set((state) => {
      const points = [...state.points],
        coordinates = [...state.coordinates];
      points[index] = null;
      coordinates[index] = null;
      return {
        points,
        coordinates,
        legs: state.legs.map(idleLeg),
        routes: [],
        status: "idle",
        progress: null,
        activePoint: index,
      };
    }),
  addDestination: () =>
    set((state) =>
      state.points.length >= 7
        ? state
        : {
            points: [...state.points, null],
            coordinates: [...state.coordinates, null],
            legs: [...state.legs, idleLeg()],
            activePoint: state.points.length,
          },
    ),
  removeDestination: (index) =>
    set((state) => ({
      points: state.points.filter((_, i) => i !== index),
      coordinates: state.coordinates.filter((_, i) => i !== index),
      legs: state.legs.filter((_, i) => i !== index - 1 && i !== index),
      activePoint: Math.max(0, index - 1),
    })),
  swapEndpoints: () =>
    set((state) => {
      if (state.points.length !== 2) return state;
      return {
        points: [state.points[1], state.points[0]],
        coordinates: [state.coordinates[1], state.coordinates[0]],
        legs: [idleLeg()],
        routes: [],
      };
    }),
  setMode: (mode) => set({ mode }),
  setTraffic: (traffic) => set({ traffic }),
  setAllowDestinationAccess: (allowDestinationAccess) =>
    set({ allowDestinationAccess }),
  setSelectedRoute: (selectedRoute) => set({ selectedRoute }),
  setLeg: (index, patch) =>
    set((state) => {
      const legs = [...state.legs];
      if (!legs[index]) return state;
      legs[index] = { ...legs[index], ...patch };
      return { legs };
    }),
  spliceLegs: (start, deleteCount, ...items) =>
    set((state) => {
      const legs = [...state.legs];
      legs.splice(start, deleteCount, ...items);
      return { legs };
    }),
  setCalculation: (routes) =>
    set({
      routes,
      selectedRoute: Math.max(
        0,
        routes.findIndex((route) => route.recommended),
      ),
      status: "ready",
      error: null,
      progress: null,
    }),
  setStatus: (status, error = null) =>
    set({
      status,
      error,
      progress:
        status === "calculating" ? "Calculating route over HTTP…" : null,
    }),
  setProgress: (progress) => set({ progress }),
}));

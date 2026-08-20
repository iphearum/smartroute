export type Coordinate = [latitude: number, longitude: number];
export type TravelMode = "car" | "motorbike" | "combined" | "bike" | "walk";
export type TrafficProfile = "normal" | "heavy";
export interface Place {
  id?: number;
  name: string;
  privince?: string | null;
  name_base?: string | null;
  base_language?: string | null;
  translated?: boolean;
  latitude: number;
  longitude: number;
  category?: string | null;
  address?: string | null;
  metadata?: Record<string, unknown>;
  status?: "active" | "temporarily_closed" | "permanently_closed" | "moved" | "nonexistent" | "disabled";
  moved_to_place_id?: number | null;
}
export type ManeuverType =
  | "depart"
  | "continue"
  | "slight-left"
  | "slight-right"
  | "turn-left"
  | "turn-right"
  | "u-turn"
  | "transfer"
  | "arrive";
export interface RouteStep {
  type: ManeuverType;
  instruction: string;
  street_name?: string;
  distance: number;
  duration: number;
  coordinate: [longitude: number, latitude: number];
}
export interface RouteOption {
  rank: number;
  recommended: boolean;
  recommendation_reason?: string;
  duration: number;
  length: number;
  geometry: [longitude: number, latitude: number][];
  connectors?: [longitude: number, latitude: number][][];
  segments?: {
    type: "road" | "inferred";
    mode?: Exclude<TravelMode, "combined">;
    geometry: [longitude: number, latitude: number][];
  }[];
  transfers?: {
    coordinate: [longitude: number, latitude: number];
    from_mode: "car";
    to_mode: "motorbike";
    duration: number;
    inferred: boolean;
  }[];
  steps?: RouteStep[];
}
export interface CoordinateRouteResponse {
  routes: RouteOption[];
  recommended_rank: number;
  route_legs: [number, number][];
}
export type RouteStatus = "idle" | "calculating" | "ready" | "error";

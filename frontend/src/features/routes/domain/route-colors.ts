import type { RouteOption } from "./types";

export const COMBIND_ROUTE_COLORS = {
  car: "#087F5B",
  motorbike: "#D97706",
} as const;

export function combindRouteColor(
  sourceMode: RouteOption["source_mode"],
): string {
  return COMBIND_ROUTE_COLORS[sourceMode ?? "car"];
}

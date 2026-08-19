import type { RouteOption, TravelMode } from "@/features/routes/domain/types";

type SegmentMode = Exclude<TravelMode, "combined">;

export function vehicleAtRoutePoint(
  route: RouteOption,
  longitude: number,
  latitude: number,
  fallback: SegmentMode,
) {
  let closestDistance = Number.POSITIVE_INFINITY,
    closestMode = fallback;
  for (const segment of route.segments || []) {
    if (!segment.mode) continue;
    for (const [pointLongitude, pointLatitude] of segment.geometry) {
      const distance =
        (pointLongitude - longitude) ** 2 + (pointLatitude - latitude) ** 2;
      if (distance < closestDistance) {
        closestDistance = distance;
        closestMode = segment.mode;
      }
    }
  }
  return closestMode;
}

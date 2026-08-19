import type { Coordinate } from "./types";

export function coordinateDistanceMeters(a: Coordinate, b: Coordinate) {
  const earthRadiusMeters = 6_371_000,
    toRadians = (degrees: number) => (degrees * Math.PI) / 180,
    [lat1, lon1] = a,
    [lat2, lon2] = b,
    deltaLat = toRadians(lat2 - lat1),
    deltaLon = toRadians(lon2 - lon1),
    haversine =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

// A dragged/clicked point within this radius of its previous position is
// treated as unchanged (~3-5 m² of GPS/drag jitter) so it doesn't trigger a
// route recalculation.
export const POINT_MOVE_THRESHOLD_METERS = 4;

export function isNegligibleMove(
  previous: Coordinate | null,
  next: Coordinate,
  thresholdMeters = POINT_MOVE_THRESHOLD_METERS,
) {
  return (
    previous !== null &&
    coordinateDistanceMeters(previous, next) < thresholdMeters
  );
}

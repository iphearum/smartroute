// A pin rarely lands exactly on an indexed place; label it plainly only
// when the match is close enough to be "basically there", otherwise make
// the approximation explicit so two nearby-but-distinct pins that share the
// same closest place don't read as identical, wrong locations.
export const EXACT_MATCH_METERS = 40;

export function nearestPlaceLabel(nearest: {
  name: string | null;
  distance: number | null;
  province?: string | null;
}) {
  if (!nearest.name)
    return nearest.province ? `Near ${nearest.province}` : "Pinned location";
  return nearest.distance !== null && nearest.distance <= EXACT_MATCH_METERS
    ? nearest.name
    : `Near ${nearest.name}`;
}

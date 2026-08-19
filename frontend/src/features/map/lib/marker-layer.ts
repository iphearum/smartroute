import type { Marker as MapLibreMarker } from "maplibre-gl";

// A set of MapLibre markers whose lifecycle (clear-and-rebuild each time the
// underlying data changes) is otherwise hand-rolled identically in every
// marker-producing effect.
export class MarkerLayer {
  private markers: MapLibreMarker[] = [];

  add(marker: MapLibreMarker) {
    this.markers.push(marker);
  }

  clear() {
    for (const marker of this.markers) marker.remove();
    this.markers = [];
  }
}

# Online-first and hybrid local vector basemaps

## Architecture

The browser defaults to the CARTO Voyager online basemap, matching the map
source and initial zoom from the `development` branch while retaining the
current MapLibre overlays and controls. The optional resource-aware hybrid mode
uses the same Cambodia PBF as GraphHopper to compile a local display cache:

```text
backend/maps/cambodia-latest.osm.pbf
    -> tilemaker
temporary MBTiles archive
    -> go-pmtiles convert + verify
backend/maps/cambodia.pmtiles
    -> FastAPI HTTP range endpoint
    -> Next.js backend proxy
    -> PMTiles protocol + full-size MapLibre vector map
    -> native MapLibre interaction, routes, markers, and controls
```

CARTO Voyager provides all coverage in the default online mode. In hybrid mode,
it provides world coverage only when the complete visible viewport is not
covered by the Cambodia archive at detailed zoom:

```text
https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png
    -> visible MapLibre raster basemap (default online mode)
    -> hidden fallback at detailed Cambodia views (hybrid mode)
    -> visible at low zoom or near/outside Cambodia (hybrid mode)
```

Select the mode at frontend build time:

```dotenv
# Default; never registers PMTiles or requests local map/font assets.
NEXT_PUBLIC_MAP_BASEMAP_MODE=online

# Retained for future local and 3D work.
NEXT_PUBLIC_MAP_BASEMAP_MODE=hybrid
```

Any missing or unrecognized value resolves to `online`. Restart the Next.js
development server after changing this public environment variable.

The PMTiles file and GraphHopper directory are independent derived caches. The
PBF remains the authoritative input; GraphML is not involved in basemap rendering.
The optional `greater-mekong-latest.osm.pbf` is routing-only and must not be fed
to the PMTiles builder; regional display continues to use the online CARTO
basemap so enabling cross-border routes does not increase browser map downloads.

## Build and update

Docker is required for the reproducible tilemaker and PMTiles build. From the
repository root:

```bash
backend/scripts/build_pmtiles.sh
```

The script reads `backend/maps/cambodia-latest.osm.pbf`, uses Tilemaker to create
a temporary MBTiles database, and converts it with the pinned
`ghcr.io/protomaps/go-pmtiles:v1.31.2` image. The converter clusters nearby tile
IDs and preserves content deduplication, which lets viewport navigation use
fewer, more-localized HTTP byte ranges. The script verifies the archive before
atomically replacing `backend/maps/cambodia.pmtiles`. Rebuild after replacing
the PBF. Generated MBTiles and PMTiles files are excluded from Git.

Tilemaker's default OpenMapTiles-compatible configuration is used. Its optional
global coastline and small-scale landcover shapefiles are not included, so the
current style uses its own background and focuses on Cambodia's OSM geometry.

## Serving and resource usage

FastAPI serves the archive at `GET /maps/tiles/cambodia.pmtiles`. Starlette's
`FileResponse` handles byte ranges, allowing the client to request only the
header, directory, and visible vector tiles. Responses advertise a one-day
public cache lifetime and one-week stale-while-revalidate allowance. PMTiles also
deduplicates requests in memory while the page is open. The archive must remain
clustered; avoid restoring Tilemaker's direct PMTiles output because its
scattered tile-data layout increases backend range reads during nearby pans.

In hybrid mode, the frontend accesses the endpoint through
`/api/backend/maps/tiles/cambodia.pmtiles`, keeping deployment same-origin. At
zoom 8 or closer, the CARTO fallback is hidden whenever the visible bounds are
fully inside the Cambodia coverage box (`102.3–107.7 E`, `10.3–14.8 N`). It is
shown when zooming out or moving near/outside that box. Online mode does not
import the PMTiles client chunk, register its protocol, call this endpoint, load
the complex-text plugin, or request vector glyphs.

Do not add the whole archive or CARTO tiles to the service-worker application-
shell cache. HTTP range and PMTiles in-memory caching avoid downloading the
complete archive, while the remote raster relies on normal HTTP caching.
The CARTO source uses standard 256-pixel tiles rather than `@2x` tiles to reduce
network transfer, image decoding work, and GPU texture memory. High-density
screens may render the basemap slightly softer as a result.

## Rendering responsibility

MapLibre renders either the online raster or the local vector source plus
conditional world raster using `frontend/src/features/map/basemap-style.ts` and
directly owns camera interaction, route lines, draggable endpoints, POIs,
popups, viewport loading, and map controls.
Keeping one map instance avoids duplicate render loops and per-frame camera
synchronization while panning or zooming. Route geometry is drawn as GeoJSON WebGL
layers; the smaller interactive endpoint, route-label, and visible POI sets use
MapLibre markers. MapLibre 5.13 remains pinned for PMTiles protocol compatibility.
OpenStreetMap and CARTO attribution must stay visible for CARTO tiles; hybrid
mode also attributes the local OpenStreetMap vector source.

In hybrid mode, the local style renders province/city, district/locality, major and minor road,
and water names from the PMTiles `place`, `transportation_name`, and
`water_name` layers. Tilemaker exposes the source OSM label in `name:latin`; in
Cambodia this field commonly contains Khmer text despite the schema field name.
MapLibre GL JS cannot correctly shape Khmer with its ordinary one-codepoint-at-a-
time glyph rendering. The map therefore loads a commit-pinned
`maplibre-gl-complex-text` plugin, which uses HarfBuzz to shape Khmer, and routes
only the plugin's five Khmer positioned-glyph ranges to a commit-pinned jsDelivr
URL. Ordinary Latin glyphs use MapLibre's demo font endpoint. These immutable
assets are fetched directly by the browser and cached for one year; they do not
pass through FastAPI or enlarge the PMTiles archive. Label density increases
with zoom, and MapLibre collision detection suppresses overlapping names.

The map starts at zoom 13, matching the useful detail level from the
`development` branch map. Its POI cards, marker
behavior, route overlays, camera actions, and liquid controls also retain the
development-derived design without restoring Leaflet.

## Display controls

The layers button provides Standard, Navigation, Clean, and Commerce presets,
plus individual switches for roads, buildings, land and parks, water,
boundaries, places and shops, and route overlays. Local vector layer switches
apply in hybrid mode; CARTO's baked raster contents cannot be toggled
individually in online mode. Place and route switches continue to control the
application overlays in both modes. These operations do not rebuild the PBF or
PMTiles archive.

The focus-route action fits road geometry and connectors with planner-aware
padding and is disabled when no route exists. Zoom actions use shared React map
control primitives, and MapLibre's native navigation control is not mounted.

Current location uses one reusable MapLibre DOM marker with a solid center and
two staggered CSS radio-wave rings. Its accuracy area remains GeoJSON so its
physical radius follows the map. Reduced-motion users see the center and
accuracy area without repeating waves. The locate request is single-flight, and
camera movement stops before flying to the reported position.

Custom place markers load from zoom 12. Decluttering uses inclusive zoom ranges
because MapLibre zoom is fractional. The visible caps increase from 10 at zoom
12 through 16, 24, 35, 60, 85, and 100 at progressively closer levels; collision
spacing decreases at the same thresholds.

Map-layer and routing preferences hydrate after mount from separate local-storage
objects so the server and first client render remain consistent.

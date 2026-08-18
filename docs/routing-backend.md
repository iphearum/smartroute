# Routing backend

## Architecture

`backend/maps/cambodia-latest.osm.pbf` is the default routing input. An optional
routing-only Greater Mekong input covers Cambodia, Laos, Myanmar, Thailand,
Vietnam, and the Chinese regions of Guangxi and Yunnan. GraphHopper imports the
selected PBF into an engine-specific cache and serves coordinate routes over
HTTP. FastAPI remains the public API and translates GraphHopper responses to the
established SmartRoute route contract.

```text
Cambodia OSM PBF -> GraphHopper LM cache -> GraphHopper HTTP -> FastAPI -> frontend
                 -> Pyrosm/OSMnx GraphML --------------------^ (development fallback)
```

The regional PBF is exclusively a GraphHopper routing input. It does not create
regional PMTiles, database places, buildings, or other display features. The
online CARTO basemap continues to provide world display coverage, while the
existing Cambodia place catalog remains unchanged.

## Greater Mekong routing input

Build the optional regional PBF from current Geofabrik extracts:

```bash
backend/scripts/build_greater_mekong_routing_pbf.sh
```

The builder downloads checksum-verified extracts for the five mainland
Southeast Asian countries plus Guangxi and Yunnan, resumes matching partial
downloads, merges them with Osmium, validates the result, and atomically writes
`backend/maps/greater-mekong-latest.osm.pbf`. It uses a local `osmium` binary
when available or builds the reusable
`backend/graphhopper/osmium-tool.Dockerfile` image. Pass `--refresh` to force a
new download even when a source already matches the current remote checksum.

Selecting the regional dataset uses a separate GraphHopper cache and larger
default heap:

```bash
GRAPHHOPPER_REGION=greater-mekong pm2 start ecosystem.config.cjs \
  --only smartroute-graphhopper --update-env
```

Before first startup, import it explicitly from `backend/`:

```bash
java -XX:TieredStopAtLevel=1 -Xmx8g \
  -Ddw.graphhopper.datareader.file=maps/greater-mekong-latest.osm.pbf \
  -Ddw.graphhopper.graph.location=maps/graphhopper-cache-greater-mekong \
  -jar graphhopper/graphhopper-web-11.0.jar import graphhopper/config.yml
```

PM2 accepts `GRAPHHOPPER_DATA_FILE`, `GRAPHHOPPER_CACHE`,
`GRAPHHOPPER_XMS`, `GRAPHHOPPER_XMX`, and
`GRAPHHOPPER_MAX_MEMORY_RESTART` overrides. Setting a custom full-China PBF is
possible through these path options, but the default Greater Mekong build uses
only Guangxi and Yunnan to avoid the substantially larger full-China download
and graph cache. Cross-border results still depend on connected OSM road data,
access tags, and legal/open border crossings; the router must not imply that a
calculated border crossing is currently open or authorized.

GraphML is not an input to GraphHopper. It remains useful for feature extraction,
graph debugging, node-ID endpoints, and local fallback routing.

## Algorithm decision

All four profiles (`car`, `motorcycle`, `bike`, and `foot`) use Landmarks (LM)
preparation. Coordinate requests explicitly disable CH, selecting LM. This gives
substantially faster long routes than unprepared A\*/Dijkstra while retaining more
custom-weighting flexibility than CH.

The adapter uses GraphHopper's `alternative_route` algorithm for two-point
requests and `astarbi` for ordered multi-stop requests. Both run against the LM
preparation rather than an unprepared Python graph.

## Suggested car and motorbike routes

The route planner exposes a `combined` mode for two-point coordinate requests.
The planner labels this mode **Recommended** while retaining `combined` as the
stable frontend state, local-storage, and API value.
It is the default mode for new browsers. The selected route mode persists as
validated JSON under `smartroute-route-mode` through the shared `useLocalStore`
hook and hydrates into the shared route store after mount.
FastAPI delegates this mode to GraphHopper orchestration rather than defining a
fake blended vehicle profile. Each Suggested calculation makes exactly two
GraphHopper requests: one car alternative-route request and one motorbike
alternative-route request. The adapter merges the returned direct routes, ranks
them by total distance with travel time as the tie breaker, and returns up to the
best three distinct alternatives supplied by GraphHopper. It does not duplicate
routes when GraphHopper supplies fewer than three. This fixed two-request budget
replaces the earlier transfer-corridor fan-out and prevents Suggested from
recommending a longer inferred transfer detour.

Suggested responses expose `segments[].mode` for every candidate so MapLibre
renders car routes in green and motorbike routes in amber. Destination-access
behavior applies independently to both profile requests when the existing
setting is enabled. A route-time label derives its vehicle icon from the typed
segment. Suggested supports exactly two input points and requires GraphHopper;
the GraphML fallback returns an explicit error.

## Destination-access roads

The reusable map settings panel exposes an off-by-default **Allow
destination-access roads** preference for car and motorbike routes. It is
disabled for bike and walk modes, retains the restricted-property warning, and
recalculates a complete active route when changed. The browser persists the
preference after mount in the `smartroute-routing-settings` local-storage JSON
object as `allowDestinationAccess`; a missing or invalid value defaults to
`false` without changing the server-rendered snapshot. The frontend sends
`allow_destination_access: true` to `POST /route/by-coordinates`; FastAPI then
selects the separately prepared `car_destination_access` or
`motorcycle_destination_access` LM profile.

The ordinary profiles still block private roads. The opt-in profiles permit
`private`, `destination`, and `delivery` road access with a substantial priority
penalty, so GraphHopper may use them to reach an endpoint but should avoid using
them as through-road shortcuts. Roads with no motorized access remain blocked.
The settings panel warns users to enter restricted property only with permission.

Changing these profiles or `car_access|block_private=false` requires rebuilding
the GraphHopper cache from the PBF before restarting the service.

## Failure and compatibility behavior

- `GRAPHHOPPER_URL` unset: use the current GraphML router.
- `GRAPHHOPPER_URL` set: GraphHopper is authoritative for coordinate routes.
- GraphHopper connection or response failure: return HTTP 502 without fallback.
- Node-ID/debug APIs: continue using the loaded GraphML graph.
- GraphML/database custom-road overlays: not visible in GraphHopper yet.
- The selected GraphHopper cache must be rebuilt after PBF or import-profile
  changes. Cambodia and Greater Mekong caches remain separate.

The current development machine starts GraphHopper with
`-XX:TieredStopAtLevel=1` because its Java 21 JIT crashed during PBF import at
the default compilation level. The constrained compilation mode completed the
same import successfully and is also used by the running local service.

Avoiding silent fallback is deliberate: two engines can snap differently and
produce different restrictions, durations, alternatives, and instructions.
Operational failures should therefore be visible instead of returning an
unexpected route.

## PM2 process management

The root `ecosystem.config.cjs` manages GraphHopper and FastAPI as separate PM2
processes. Start or update just the routing services from the repository root:

```bash
pm2 start ecosystem.config.cjs \
  --only smartroute-graphhopper,smartroute-backend
pm2 save
```

Use these checks after startup:

```bash
pm2 status
pm2 logs smartroute-graphhopper --lines 100
curl http://127.0.0.1:8989/health
```

GraphHopper must have a completed `backend/maps/graphhopper-cache` before PM2
starts it. PM2 restarts both services after a crash, but operating-system reboot
restoration additionally requires the one-time `pm2 startup` command printed for
the current host, followed by `pm2 save`.

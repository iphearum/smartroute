# SmartRoute

SmartRoute is a FastAPI map and routing application for Cambodia. It supports
location search, map pins, multiple destinations, travel modes, recommended routes,
Google Maps link imports, province-level offline road graphs, searchable OSM
features, and custom map updates.

Places can also be extended into merchant branches and online storefronts
without duplicating their map coordinates. The commerce foundation supports
businesses, branches, catalogs, variants, per-branch inventory, place media, and
place-linked 3D models. See `docs/place-commerce-foundation.md` for its API and
security boundary.

![SmartRoute demo](images/demo.png)

## Install

Requires Python 3.11 or newer.

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
python -m pip install -r requirements.txt
cp .env.example .env           # Windows: copy .env.example .env
python artisan migrate
python main.py
```

Open <http://127.0.0.1:8100>. API documentation is available at
<http://127.0.0.1:8100/docs>.

## Artisan commands

The backend includes a Laravel-inspired command runner. Run commands from the
`backend` directory with the virtual environment active:

```bash
python artisan --help
```

### Database migrations

```bash
python artisan migrate --dry-run
python artisan migrate
python artisan migrate:status
python artisan migrate:heads
python artisan migrate:rollback --dry-run
python artisan migrate:rollback
python artisan make:migration add_example_field
python artisan migrate:sql 0002_add_osm_features
```

Rolling back a table migration deletes the data in that table. Back up shared
or production databases first.

Rollback selects exactly one latest row from `tortoise_migrations`, ordered by
`applied_at DESC, id DESC`. You may optionally require a matching recorder ID or
migration name:

```bash
python artisan migrate:rollback 2 --dry-run
python artisan migrate:rollback 0002_add_osm_features
```

The command verifies that the selected row is latest and its migration file
exists before changing the schema. It refuses older IDs/names and missing files.

To completely drop every configured database table and recreate the schema from
all migrations:

```bash
python artisan db:fresh
# Non-interactive development/CI use:
python artisan db:fresh --force
```

This deletes maps, places, features, translations, images, routes, closures,
and migration history. The command refuses known PostgreSQL/MySQL system
databases.

## Local Cambodia PBF workflow

The recommended bulk-data source is `maps/cambodia-latest.osm.pbf`. Download a
current Cambodia extract when necessary:

```bash
curl -L https://download.geofabrik.de/asia/cambodia-latest.osm.pbf \
  -o maps/cambodia-latest.osm.pbf
```

### Convert PBF roads to GraphML

Convert all 25 provinces without Overpass or Nominatim requests:

```bash
python artisan map:convert-pbf --network-type drive --workers 2
```

Convert selected provinces or rebuild existing files:

```bash
python artisan map:convert-pbf \
  --regions siem_reap battambang kampot \
  --network-type drive \
  --workers 2 \
  --force

python artisan map:convert-pbf --regions phnom_penh --network-type drive --workers 1 --force --no-progress
```

Supported network types are `drive`, `bike`, `walk`, and `all`. Pyrosm reads
province boundaries and roads from the PBF, produces an OSMnx-compatible graph,
and writes it atomically to:

```text
maps/cambodia/<province>/base/<province>.graphml
```

Existing files are skipped unless `--force` is supplied. Completed graphs are
registered in the map catalog. Two workers is the recommended default; use one
worker on memory-constrained systems.

### Seed buildings, POIs, and map features

Populate `osm_features` locally without contacting Overpass:

```bash
# Every supported layer for all provinces
python artisan db:seed --workers 2

# Building-only and POI-only commands
python artisan buildings:seed --regions siem_reap battambang --workers 2
python artisan places:seed --regions siem_reap --workers 2

# Select layers explicitly
python artisan features:seed \
  --types buildings pois boundaries landuse natural \
  --regions siem_reap \
  --workers 2
```

Seeds use conflict-aware batch upserts keyed by map, OSM type, OSM ID, and
feature type. Rerunning a seed updates records instead of duplicating them. Each
record preserves GeoJSON, centroid and bounds, Khmer/English names, category,
raw OSM tags, and active state. Use `--batch-size` to tune database batches.

### Batch English and local-name translations

OSM feature names are kept directly on `osm_features`: `name` contains the
English/default value, `name_base` contains the country-local value, and
`base_language` identifies that language (`km` for Cambodia). `translated` is
`true` only when `name_base` was machine-generated; native OSM names remain
`false`. There is no
separate translation table and no language-specific column such as `name_km`.
Sync missing values in bounded batches:

```bash
python artisan translations:sync \
  --regions siem_reap battambang \
  --batch-size 250
```

Existing OSM English/local values are retained. Only missing values are
translated; `--force` refreshes both derived values. Large text is split at safe
boundaries, and URLs, emails, and phone numbers are protected. Short names are
packed into character-limited requests and mapped back in order, reducing
translation-provider network calls. Invalid batch responses retry item-by-item.

## Online OSM fallback workflow

Local PBF processing is preferred for nationwide imports. These commands use
OSMnx and public Overpass services when a local extract is unavailable.

### Download road graphs

```bash
python artisan map:download \
  --regions siem_reap battambang kampot \
  --network-type drive \
  --workers 2
```

Requests use a process-wide randomized delay, retry with exponential backoff,
honor numeric `Retry-After` responses, and rotate through configured public
servers. Configure `OVERPASS_DELAY_MIN`, `OVERPASS_DELAY_MAX`, and
`OVERPASS_MAX_RETRIES` in `.env`. Keep online downloads at two or three workers
to reduce pressure on community infrastructure.

### Fetch searchable places

The nationwide importer processes Cambodia one province at a time, commits each
province independently, and continues after a failed province by default:

```bash
python artisan places:fetch --workers 2
```

Retry or test selected provinces without downloading the others:

```bash
python artisan places:fetch \
  --regions phnom_penh siem_reap battambang \
  --workers 2
```

The command displays a `tqdm` progress bar with the current province, current
download/upsert stage, elapsed time, and downloaded POI count. Use
`--no-progress` when output is redirected to CI or a log file.

Imported names and addresses follow the country's language policy. Cambodia
uses Khmer (`km`) first and English (`en`) as its fallback. Native OSM names are
preferred; `deep-translator` is called only for missing values. Configure this
with the `TRANSLATION_*` settings in `.env`.

Registered GraphML files can also be downloaded through the API:

```text
GET /maps/cambodia/<province>/graphml
```

For example, `http://127.0.0.1:8100/maps/cambodia/siem_reap/graphml` downloads
the Siem Reap road graph with a browser-friendly attachment filename.

GraphML stores the runtime road graph used by NetworkX/A\*. PBF remains the
compact source of truth for rebuilding graphs and extracting features.

## GraphHopper LM routing

Production coordinate routing can use GraphHopper's Landmarks (LM) hybrid mode
directly from the Cambodia PBF. GraphHopper creates and reuses its own optimized
cache; it does not consume the province GraphML files.

From the `backend` directory, download a GraphHopper web JAR compatible with
`graphhopper/config.yml`, then import and start the service:

```bash
java -XX:TieredStopAtLevel=1 -Xmx4g \
  -jar graphhopper/graphhopper-web-11.0.jar import graphhopper/config.yml
java -XX:TieredStopAtLevel=1 -Xms2g -Xmx2g \
  -jar graphhopper/graphhopper-web-11.0.jar server graphhopper/config.yml
```

`TieredStopAtLevel=1` avoids a Java 21 JIT crash observed during the Cambodia
import on the current development runtime. It can be removed after moving to a
JDK build where the import succeeds without it.

The import reads `maps/cambodia-latest.osm.pbf` and writes
`maps/graphhopper-cache`. Delete that cache and rerun the import after replacing
the PBF or changing profiles/import settings. The committed configuration builds
LM preparations for `car`, `motorcycle`, `bike`, and `foot`; CH is intentionally
disabled. It also prepares opt-in `car_destination_access` and
`motorcycle_destination_access` profiles. These allow private/destination roads
at a penalty when the map preference is enabled; default profiles remain
restrictive.

Enable the FastAPI adapter in `.env`:

```dotenv
GRAPHHOPPER_URL=http://127.0.0.1:8989
GRAPHHOPPER_TIMEOUT=15
```

With `GRAPHHOPPER_URL` set, `POST /route/by-coordinates` sends all waypoints to
GraphHopper with `ch.disable=true`, which selects the prepared LM mode. FastAPI
normalizes GraphHopper geometry, duration, alternatives, and instructions to the
existing frontend response. If GraphHopper is unavailable, this endpoint returns
HTTP 502; it does not silently calculate a potentially different route. Without
the setting, the existing Python/GraphML implementation remains active.

Node-ID and graph-inspection endpoints continue to use GraphML. Existing custom
GraphML roads and database overlays are also limited to that router: GraphHopper
will not see them until they are incorporated into its PBF/import pipeline.

### Optional Greater Mekong routes

Cross-border routing can use a routing-only merged extract for Cambodia, Laos,
Myanmar, Thailand, Vietnam, Guangxi, and Yunnan:

```bash
scripts/build_greater_mekong_routing_pbf.sh

java -XX:TieredStopAtLevel=1 -Xmx8g \
  -Ddw.graphhopper.datareader.file=maps/greater-mekong-latest.osm.pbf \
  -Ddw.graphhopper.graph.location=maps/graphhopper-cache-greater-mekong \
  -jar graphhopper/graphhopper-web-11.0.jar import graphhopper/config.yml

GRAPHHOPPER_REGION=greater-mekong pm2 start ../ecosystem.config.cjs \
  --only smartroute-graphhopper --update-env
```

The regional data is consumed only by GraphHopper. It does not replace the
online basemap, build regional PMTiles, or import regional POIs. The builder
uses Geofabrik checksums and resumes partial downloads; `--refresh` forces all
inputs to download again. PM2 defaults the regional graph to a 4–8GB heap and a
separate cache, with environment overrides documented in `.env.example`.

At startup the backend scans `maps/<country>/<province>/base/*.graphml` and
registers every non-empty province graph automatically. The frontend watches
the padded visible map bounds and requests places through
`GET /maps/viewport/places`. Panning and zooming cancel stale requests, show a
loading indicator, and merge returned places by database ID.

Rich local-PBF features are available separately for vector and 3D rendering:

```text
GET /maps/viewport/features?south=11.5&west=104.8&north=11.7&east=105.0&types=building,poi&limit=2000
```

Building responses include GeoJSON, original OSM tags, and derived `height_m`
and `min_height_m` values. Explicit `height` tags are preferred, then building
levels at three metres per level, with a six-metre visual fallback.

### Detailed 3D landmarks

Generic buildings come from OSM. Store a detailed landmark as a CORS-enabled
GLB/GLTF model plus its real-world transform:

```bash
python artisan 3d:asset "Landmark tower" /models/landmark-tower.glb \
  11.5564 104.9282 --province phnom_penh --rotation-z 15 --scale 1
```

Files under `frontend/public/models/` are available as `/models/<file>.glb`.
The 3D frontend retrieves visible models from `GET /maps/viewport/3d-assets`
and renders them with Three.js in the same MapLibre depth buffer as buildings.

## Next.js frontend

The maintainable map UI lives in `frontend/` and uses Next.js, TypeScript,
Tailwind CSS, Zustand, and Leaflet. Keep FastAPI running on port 8100, then:

```bash
cd ../frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open <http://127.0.0.1:3000>. Next.js proxies API requests to FastAPI, so map
components remain independent of backend host configuration and browser CORS.

## Configuration

Edit `.env` when you need different database, map, or server settings:

```dotenv
DB_CONNECTION=sqlite
DB_DATABASE=maps/maps.db
SMARTROUTE_MAP_REGION=cambodia/phnom_penh
APP_HOST=127.0.0.1
APP_PORT=8100
APP_RELOAD=false
```

For MySQL, set `DB_CONNECTION=mysql` and configure `DB_HOST`, `DB_PORT`,
`DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`.

For PostgreSQL, set `DB_CONNECTION=pgsql` (aliases `postgres` and
`postgresql` are also accepted), use port `5432`, and configure the same
database credentials. PostgreSQL connections use the `asyncpg` driver.

Migration `0002_add_osm_features` creates portable JSONB geometry and tag
storage. If PostGIS is installed on PostgreSQL, it also creates a generated SRID
4326 geometry column and GiST spatial index. Without PostGIS, centroid and
bounding-box columns remain available for spatial filtering.

## Usage

1. Search for a place, paste a Google Maps link, or pin a point on the map.
2. Set the destination and add optional stops.
3. Select a travel mode and choose **Show route**.

The recommended route is shown first. Places and route endpoints use readable
location names rather than internal node IDs.

## Map data

Base maps and overlays are organized by region:

```text
maps/<country>/<province>/base/
maps/<country>/<province>/overlays/
```

GraphML stores the runtime road network. PBF stores the original nationwide OSM
extract. The database stores searchable places, buildings, boundaries,
land-use/natural features, raw tags, custom routes, closures, revisions, and
images.

## Development

```bash
# Apply database migrations
python artisan migrate

# Run tests
python -m pip install pytest
python -m pytest -q
```

## Run backend and frontend with PM2

The repository root contains `ecosystem.config.cjs` with two independently
managed services:

- `smartroute-backend` runs FastAPI on `127.0.0.1:8100` using `backend/.venv`.
- `smartroute-frontend` runs the production Next.js server on `0.0.0.0:3100`
  because ports 3000 and 3001 are already used by other local applications.

Install dependencies and build the frontend before its first production start:

```bash
cd backend
uv pip install --python .venv/bin/python -r requirements.txt
cd ../frontend
npm install
npm run build
cd ..
```

Start and manage both services from the repository root:

```bash
pm2 start ecosystem.config.cjs
pm2 status
pm2 logs
pm2 restart ecosystem.config.cjs --update-env
pm2 stop ecosystem.config.cjs
pm2 delete ecosystem.config.cjs
```

Start or inspect only one service when needed:

```bash
pm2 restart smartroute-backend
pm2 restart smartroute-frontend
pm2 logs smartroute-backend
pm2 logs smartroute-frontend
```

Persist the process list and configure startup after verifying both services:

```bash
pm2 save
pm2 startup
```

Run the command printed by `pm2 startup` with the requested privileges, then
run `pm2 save` again.


Merge `*.osm.pbf`

Install
```bash
sudo apt update
sudo apt install osmium-tool
```
Run merge

```bash
osmium merge \
  maps/greater-mekong-routing-sources/*.osm.pbf \
  -o maps/indochina-latest.osm.pbf \
  --overwrite \
  -v
```

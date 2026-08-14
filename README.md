# SmartRoutePP

FastAPI road routing for Phnom Penh with cached A* and Dijkstra search, nearest-point
lookup, map rendering, and optional custom GraphML overlays.

## Run

```bash
python -m pip install -r requirements.txt
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM migrate
python main.py
```

Open <http://127.0.0.1:8000>. The graph defaults to
`maps/cambodia/phnom_penh/base/my_phnom_penh.graphml`, so the command works from
any directory.

Configuration:

- Copy `.env.example` to `.env`; environment variables override values from the file.
- `DB_CONNECTION=sqlite|mysql` selects the Tortoise database backend. MySQL also
  uses `DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD`.
- `SMARTROUTE_GRAPH=/path/base.graphml` selects another base map.
- `SMARTROUTE_CUSTOM_GRAPHS=/path/one.graphml,/path/two.graphml` composes custom
  map overlays into the base graph at startup.
- `SMARTROUTE_MAP_REGION=cambodia/phnom_penh` loads a graph registered in the
  SQLite-backed regional map catalog.

Useful APIs include `/route`, `/location/nearest`, `/map/summary`, `/closest-node`,
and `/full_temp_route`. `/route` uses A* by default; pass `algorithm=dijkstra` for
the classic algorithm.

The planner can import official Google Maps directions URLs through
`POST /route/import/google-maps`. It imports the ordered origin, waypoints, and
destination, then calculates a new route using the local SmartRoute graph. The
result page's **Copy route** action creates a standard Google Maps directions URL
that can also be pasted back into SmartRoute. Google route geometry itself is not
copied or scraped.

Regional graphs live under `maps/<country>/<province>/`. GraphML is the stable base
map; `maps/maps.db` stores only incremental data such as places, custom roads,
closures, revision history, and image BLOBs. This means small edits do not require
downloading the province map again.

Database access uses Tortoise ORM models in `services/map_models.py`. Application
queries are asynchronous QuerySets (`filter`, `order_by`, `update_or_create`) rather
than handwritten SQL, while retaining the existing SQLite tables and data.

### Database migrations

Reversible migrations live in `database/migrations/` and are ordered as
`0001_initial.py`, `0002_<change>.py`, and so on. Use the same `.env` configuration
as the application:

```bash
# Generate a migration after changing services/map_models.py
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM makemigrations -n add_place_type models

# Preview, apply, inspect, or roll back
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM migrate --dry-run
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM migrate
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM history
# Roll back everything after 0001_initial (keeps the initial schema)
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM downgrade models 0001_initial

# Roll back the initial migration too (drops every map table)
.venv/bin/python -m tortoise -c services.settings.TORTOISE_ORM downgrade models
```

Review generated migrations before applying them. A downgrade reverses every
operation after the named target. Omitting the target rolls back the initial
migration too, dropping all map tables and their data.

Incremental APIs include:

- `POST /maps/{country}/{province}/places` (searchable immediately)
- `POST /maps/{country}/{province}/custom-routes`
- `POST /maps/{country}/{province}/closures`
- `POST /maps/{country}/{province}/images`

Custom routes and closures are composed over the base graph at startup, so restart
the service after either changes. The original GraphML file is never modified.

Leaflet, its marker/control images, the application stylesheet, and Manrope fonts
are served locally from `static/`. OpenStreetMap raster tiles remain a live map-data
service and require network access unless a local tile server is configured later.

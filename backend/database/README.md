# Database migrations

SmartRoutePP uses Tortoise ORM's native reversible migrations. Migration files are
kept in `database/migrations` and use ordered names such as `0001_initial.py` and
`0002_add_place_type.py`.

Each generated operation contains both its forward schema state and enough state
for Tortoise to reverse it. Always run `migrate --dry-run` or `downgrade --dry-run`
before changing a shared database, and back up production data before dropping a
table or column.

The application does not create production tables automatically. Apply pending
migrations during deployment before starting the API.

The `artisan` helper provides shorter Laravel-style commands around Tortoise:

```bash
python artisan migrate --dry-run
python artisan migrate
python artisan migrate:status
python artisan migrate:rollback --dry-run
python artisan migrate:rollback
python artisan make:migration add_example_field
```

It uses the current virtual-environment Python executable and always resolves
configuration relative to the backend directory. The original `python -m
tortoise` commands remain available.

Common map-data operations are available through the same runner:

```bash
# Local PBF to province GraphML
python artisan map:convert-pbf --workers 2

# Online OSMnx/Overpass road download
python artisan map:download --regions siem_reap battambang --workers 2

# Online Overpass POIs into map_places
python artisan places:fetch --regions siem_reap --workers 2

# Local PBF layers into osm_features
python artisan buildings:seed --regions siem_reap --workers 2
python artisan places:seed --regions siem_reap --workers 2
python artisan features:seed --types pois landuse natural --regions siem_reap
python artisan db:seed --workers 2
```

All region arguments are optional and default to Cambodia's 25 provinces.
Feature seeds use conflict-aware batch upserts, so they are safe to rerun after
replacing `maps/cambodia-latest.osm.pbf` with a newer extract.

Migration `0002_add_osm_features` creates the portable `osm_features` table and
a PostgreSQL GIN index for OSM tags. When the PostGIS server extension is
available, it additionally enables PostGIS and creates a generated SRID 4326
`geometry` column plus GiST spatial index. The application writes GeoJSON to
`geometry_json`; Postgres materializes the spatial column automatically.

Migration `0002_add_osm_features` stores the two supported feature-name values
directly on `osm_features`: `name`, `name_base`, and the ISO code in
`base_language`. For Cambodia the local code is `km`; it is data, not a fixed
schema column such as `name_km`. The `translated` flag records whether
`name_base` was machine-generated. No `localized_texts` table is created.

Migration `0004_add_commerce_foundation` makes `map_places` reusable by OSM,
merchants, and administrators. It adds optional OSM-feature and 3D-place links,
then creates businesses, shop branches, storefronts, products, variants,
inventory, and URL-based place media. PBF refreshes continue to own
`osm_features`; merchant content remains in the commerce tables.

# Laravel-style backend structure

## Status

The backend is being restructured to a Laravel-style layout. **Auth and
commerce are fully migrated**; map catalog and routing still live in the old
`api/` layout and are reachable through a back-compat shim.

## Target layout

```text
backend/
├── config/
│   ├── settings.py          # env-backed Settings dataclass
│   └── database.py          # TORTOISE_ORM
├── database/
│   └── migrations/          # native tortoise.migrations (unchanged)
├── app/
│   ├── models/              # Tortoise models, split by domain
│   ├── http/
│   │   ├── controllers/     # BaseController + per-domain controllers
│   │   ├── middleware/       (empty -- nothing extracted yet)
│   │   └── requests/        # Pydantic Form Requests
│   ├── routes/              # api.py mounts auth.py, commerce.py, ...
│   ├── services/            # BaseService + per-domain domain services
│   ├── routing/             # road-graph engine: registry, builder, PBF, pathfinding
│   ├── clients/             # external I/O (GraphHopper, NBC, Overpass, OSM)
│   └── support/             # pure helpers, no domain or request knowledge
├── services/map_models.py   # shim -- pinned by migration 0001 (see below)
├── test/                    # all tests (pyproject sets pythonpath + testpaths)
└── main.py                  # app assembly + lifespan only
```

## Decisions

### Migrations stay native, not Aerich

The original proposal specified Aerich. This backend already uses
tortoise-orm 1.1's **built-in** `tortoise.migrations` with nine applied
migrations and a `tortoise_migrations` recorder table in the live Postgres
database. Aerich is a separate tool with an incompatible file format and its
own `aerich` bookkeeping table, so adopting it would mean re-baselining
migration history against a database that already has it — real data-loss
risk, and it gains nothing the native system lacks. The `database/migrations/`
directory already matched the target layout; only `TORTOISE_ORM` moved.

### The Tortoise app label stays `"models"`

Every applied migration records `('models', '000X_...')` dependencies and
`'app': 'models'` options. Renaming the label would orphan that history on
any database that has already run it. Only the **module path** moved
(`services.map_models` → `app.models`); the label is unchanged.

Verified after the split:

- all 18 models discovered under the `models` label with identical table names
- `artisan migrate:heads` still resolves to `0009_add_exchange_rates`
- `artisan make:migration` reports **"No changes detected"** — the split is
  schema-neutral and generated no stray migration

### Model discovery uses the explicit `__models__` contract

`app/models/__init__.py` declares `__models__` rather than letting Tortoise
scan `dir()` (see `tortoise/apps.py::_discover_models`, which checks
`__models__` first). Registration stays deliberate: a new model file does
nothing until exported, and re-exported helpers can never be mistaken for
models.

## Base classes

The reference screenshots' actual architectural point is inheritance, not
directory shape:

- **`app/services/base_service.py`** — `BaseService` with a `model` attribute
  and async CRUD (`create`, `find`, `find_or_fail`, `all`, `values`, `update`,
  `delete`, …). The PHP `BaseService { public $model; }` equivalent. It is a
  thin wrapper over Tortoise's queryset API: the value is a consistent call
  surface and shared not-found semantics, not hiding the ORM. Queries the ORM
  expresses better are written directly in the subclass.
- **`app/http/controllers/base_controller.py`** — `BaseController` with
  `service_class` (the `public $service` equivalent) plus `ResponseMixin`,
  the Python stand-in for `use ResponseTrait`. PHP traits become mixin
  classes. `ResponseMixin.error()` centralises the domain-exception → HTTP
  mapping (`KeyError`→404, `IntegrityError`→409, `ValueError`→400) that
  `api/auth.py` and `api/commerce.py` were each re-implementing.

`conflict_message` is overridable per controller so a 409 says "An account
with this email already exists" rather than a generic string.

## Migrated: auth slice

| Before | After |
| --- | --- |
| `api/auth.py` (routes + validation + logic + error mapping) | split three ways ↓ |
| — | `app/http/requests/auth_requests.py` (`SignupRequest`, `LoginRequest`, `UserResource`) |
| — | `app/http/controllers/auth_controller.py` (`AuthController`) |
| `services/user_store.py` (`UserStore`) | `app/services/auth/user_service.py` (`UserService(BaseService[User])`) |
| `main.py` `include_router` calls | `app/routes/api.py` `register_routes(app)` |

`api/auth.py` and `services/user_store.py` are **deleted**, not shimmed —
the slice is fully migrated. `main.py` no longer builds `app.state.user_store`;
the controller owns its service.

Verified end-to-end over real HTTP (ASGI transport), not just imports:
signup → cookie set → `/me` → duplicate email 409 → wrong password 401 →
unknown account returns the *same* 401 (no account enumeration) → login →
logout → `/me` 401 → short password 422 from Form Request validation.

## The one remaining shim, and why it stays

`services/map_models.py` re-exports `app.models`. It cannot simply be
deleted: **`database/migrations/0001_initial.py` imports
`from services.map_models import default_travel_modes`**. Applied migrations
are historical records, so rewriting that import would edit a file that has
already run against live databases. Keeping a three-line shim is the cheaper
and safer trade. Everything else now imports `app.models` directly.

The `services/settings.py` lazy `TORTOISE_ORM` re-export is **gone** — with
both modules under `config/`, the indirection bought nothing, so callers
import `config.database` directly.

### `config/__init__.py` deliberately exports nothing

Re-exporting the `settings` *instance* there shadows the `config.settings`
*submodule*, silently changing what `from config import settings` returns.
That broke `test_settings.py` (which calls module-level `_database_url()`)
during this reorganisation and is easy to reintroduce.

## Migrated: commerce slice

`api/commerce.py` (367 lines) is **deleted**, split into:

| New file | Contents |
| --- | --- |
| `app/http/requests/commerce_requests.py` | the 10 Pydantic schemas |
| `app/http/controllers/commerce_controller.py` | all 16 endpoints' logic |
| `app/services/commerce/business_service.py` | businesses, branches, storefronts |
| `app/services/commerce/product_service.py` | products, variants, spreadsheet import |
| `app/services/commerce/inventory_service.py` | per-branch stock |
| `app/services/commerce/exchange_rate_service.py` | NBC currency rates |

Its private `store()` and `_error()` helpers are gone, replaced by
`BaseController.state()` and `ResponseMixin.error()`.

## `map_store.py`: 757 → 514 lines

The commerce and currency methods (lines 457-693) moved out to the services
above and were **deleted** from `MapStore`, not left behind a delegating
facade — every caller was migrated. `validate_slug` moved to
`app/support/slug.py` and is shared rather than duplicated.

What remains in `MapStore` is genuinely one domain: the map registry and
places (regions, revisions, imagery, OSM features, 3D assets, viewport
queries, custom routes, closures). It is still large and still worth
splitting into `MapService` / `PlaceService`, but it is no longer a
cross-domain God object.

## Fixed: N+1 query in `list_products`

The old implementation looped over products and issued one variant query per
product — a 40-item catalog cost 42 queries. It now issues a single variant
query grouped in memory: **3 queries flat, independent of catalog size**
(verified by counting `execute_query`/`execute_query_dict` calls).

## Naming and placement standard

Modules were placed by *what they are*, and renamed where the filename
disagreed with the contents:

| Old | New | Why |
| --- | --- | --- |
| `services/route_finder.py` | `app/routing/router_engine.py` | held `RouterEngine` |
| `services/place_cache.py` | `app/support/tile_cache.py` | held `TileCache` |
| `services/map_store.py` (`MapStore`) | `app/services/map/map_service.py` (`MapService`) | it is a domain service |
| `services/auth.py` | `app/support/security.py` | crypto primitives, not a service; `auth` collided with the auth controller/routes |
| `services/database_overlays.py` | `app/routing/overlays.py` | routing-engine internal |
| `services/{graphhopper,nbc_exchange,osm_places}.py`, `libs/overpass.py` | `app/clients/` | external I/O |
| `services/{google_maps,product_import}.py`, `libs/{translation,cambodia}.py` | `app/support/` | pure helpers |
| `services/settings.py`, `database/config.py` | `config/` | configuration |

The rule: `app/services/` is for domain services extending `BaseService`,
grouped by feature when a domain has more than one service (`auth/`,
`commerce/`, `map/`, and `assistant/`); shared `BaseService` remains at the
services root;
`app/clients/` performs external I/O; `app/routing/` is engine internals;
`app/support/` is pure functions with no domain or request knowledge. The
old `libs/` package is gone.

Routes were split per domain — `app/routes/api.py` is now a 28-line
aggregator that only mounts `auth.py`, `commerce.py`, and the two
not-yet-migrated legacy routers.

## `main.py`: 311 → 82 lines

The entry point was doing four jobs: app assembly, PBF graph construction,
graph caching, and lifespan wiring. Only the first and last belong there.

| Moved out | To | Why |
| --- | --- | --- |
| `load_region_graph_from_pbf`, `_empty_graph` | `app/routing/pbf.py` | PBF → graph construction |
| `build_graph_services`, `get_graph_data` | `app/routing/graph_builder.py` | was defined in `api/graph_routes.py` and imported *by the entry point* — an inverted dependency |
| `load_graph`, `load_region_graph_object`, `load_region_graph`, `graph_services_for_coordinates` | `app/routing/registry.py` (`GraphRegistry`) | see below |
| map-region parsing | `resolve_map_region()` | testable in isolation |

`GraphRegistry` exists because five parallel caches (`graph_objects`,
`graph_services`, `graph_spatial_indexes`, `bounded_graph_services`,
`graph_load_lock`) lived on `app.state`, always changed together, and were
only ever touched by those four functions — each of which took `app` as its
first argument. That is a class. `app.state` now holds one `graph_registry`
instead of five caches plus a lock.

Removed along the way:

- `_reset_local_graph_state()` — **dead code**: defined, never called, while
  its five-line body was pasted three times inside `load_graph`. The three
  copies collapsed into one `return None` path, since every caller treated
  "GraphHopper active", "PBF missing", and "conversion failed" identically.
- Two magic numbers named: `MAX_BOUNDED_SERVICES = 24`,
  `BACKBONE_DISTANCE_METRES = 50_000`.

### A pre-existing failing test is now fixed

`test_load_graph_skips_local_graph_when_graphhopper_is_active` had been
failing with `FrozenInstanceError` — it monkeypatched `settings`, which is a
frozen dataclass. The behaviour was untestable as written. `GraphRegistry`
takes `graphhopper_enabled` as a constructor argument, so it is now tested
directly, alongside two new cases (missing PBF, `resolve_map_region`
parsing). **The suite is green for the first time: 81 passed, 0 failed.**

## Remaining work

1. **Map catalog** (`api/map_catalog.py`, 342 lines) → controller. It still
   carries its own `store()` helper and ten repeated
   `HTTPException(404, str(exc))` blocks that `ResponseMixin.error()` replaces.
2. **Routing** (`api/graph_routes.py`, 567 lines) — largest, and the only one
   coupled to `app.state` graph objects; it may keep a thinner controller.
3. **Split `MapStore`** into `MapService` + `PlaceService`.
4. Delete the two shims; decide whether `libs/` moves under `app/support/`
   (it holds no business logic, so either is defensible).

Nothing above is required for the app to run today — the structure is
incrementally adoptable, which is why the shims exist.

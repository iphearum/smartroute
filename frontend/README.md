# SmartRoute web

Next.js App Router frontend for the existing FastAPI routing and place-data API.

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

Run FastAPI at `http://127.0.0.1:8000` and open the frontend at
`http://127.0.0.1:3000`. Change `FASTAPI_URL` when the backend uses another URL.

## Structure

- `features/*/domain`: framework-independent types and rules.
- `features/*/api`: adapters that translate backend transport into domain data.
- `features/*/store`: serializable client state; no Leaflet or HTTP objects.
- `features/*/hooks`: asynchronous workflows and feature orchestration.
- `features/*/components`: UI and framework adapters.
- `shared`: reusable infrastructure with no feature-specific policy.

Dependencies flow inward toward domain types. MapLibre and basemap selection
are isolated in `MapCanvas`, FastAPI URLs are isolated in API
adapters, and components communicate through the store and hooks. This keeps
either adapter replaceable and features testable.

The default browser basemap is the CARTO Voyager online raster used by the
`development` branch. This mode does not register the PMTiles protocol or
request the local archive, complex-text plugin, or vector glyphs. Set
`NEXT_PUBLIC_MAP_BASEMAP_MODE=hybrid` at build time to restore the retained
local Cambodia PMTiles basemap with conditional CARTO world fallback. Build or
refresh `backend/maps/cambodia.pmtiles` with
`backend/scripts/build_pmtiles.sh` after updating the Cambodia PBF.

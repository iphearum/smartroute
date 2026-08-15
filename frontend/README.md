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

Dependencies flow inward toward domain types. Leaflet is isolated in `MapCanvas`,
FastAPI URLs are isolated in API adapters, and components communicate through the
store and hooks. This keeps either adapter replaceable and features testable.

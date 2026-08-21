# Shop management frontend design

## Status and scope

This document defines how the frontend shop-management UI (`/shops`,
`/shops/manage`) maps onto the backend. All sections in the shop-admin shell
now use persisted backend data; this document records the contracts and the
remaining platform boundaries.

Two boundaries already exist and this design does not relitigate them:

- `docs/place-commerce-foundation.md` defines `businesses`, `shop_branches`,
  `storefronts`, `products`, `product_variants`, and `inventory_items`, with a
  working trusted-administration API under `/commerce/*`
  (`backend/api/commerce.py`, `backend/services/map_store.py`). No auth or
  ownership check exists on these routes yet.
- That same document's "Current boundary" section excludes public checkout,
  payments, delivery assignment, reviews, and merchant moderation. The
  merchant POS order ledger, staff, and payroll-run tables are now implemented
  for the authenticated shop-management workspace.

The supported shop-admin surface is now persisted end to end:

| Section | Backing | Status |
| --- | --- | --- |
| Claim business / branch | `POST /commerce/businesses`, `POST /commerce/businesses/{id}/branches` | Real |
| Edit business name | `PATCH /commerce/businesses/{id}` | Real |
| Manage shop (products) | `POST/GET/PATCH .../products`, `POST/PATCH /commerce/.../variants` | Real |
| Bulk import (CSV/XLSX) | `POST .../products/import[/preview]` | Real |
| Stock | `GET`/`PUT /commerce/branches/{id}/inventory[/{variant_id}]` | Real |
| Dashboard (sales, orders) | `GET /commerce/businesses/{id}/dashboard` | Real |
| POS | `POST /commerce/businesses/{id}/orders` | Real |
| Payroll | staff and payroll endpoints under `/commerce/businesses/{id}` | Real |
| Other info | `PATCH /commerce/branches/{id}` using branch fields and metadata | Real |
| Place lifecycle and branch schedules | `PATCH /commerce/places/{id}` and `/commerce/branches/{id}/schedules` | Real |

The old mock files remain as fixture/reference data for visual development;
the production panels no longer import them.

## Backend additions in this change

The original version of this document flagged three gaps blocking a real
Manage-shop/Stock experience. All three are now closed:

- `PATCH /commerce/businesses/{id}` — edit `display_name`, `legal_name`,
  `description`, `logo_url`, `status`. Unset fields are left untouched
  (`exclude_unset=True` on the request model); a field cannot be cleared to
  `null` through this endpoint, only overwritten with a new value — accepted
  as a scope cut, not a bug.
- `PATCH /commerce/products/{id}` and `PATCH /commerce/variants/{id}` — edit
  or archive a product (`status: "archived"`), edit variant price/title/
  active flag. Same unset-vs-null semantics as above. `compare_at_price`
  is still validated against `price` on update, matching the create-time rule.
- `GET /commerce/branches/{id}/inventory` — lists every `InventoryItem` for a
  branch, joined with `variant__sku`, `variant__title`, and
  `variant__product__name` so the Stock panel can render without a second
  round trip per row. The Stock panel now loads real quantities on mount
  instead of defaulting every field to empty.
- `GET /commerce/businesses/{id}/dashboard` — returns seven-day sales,
  recent orders, top sellers, and low-stock rows from persisted order and
  inventory data.
- `POST /commerce/businesses/{id}/orders` — creates a POS order transaction,
  snapshots order lines, calculates 10% tax, and decrements available branch
  inventory when a row exists.
- `GET/POST /commerce/businesses/{id}/staff` and
  `PATCH /commerce/staff/{id}` — manage active staff and weekly hours.
- `POST /commerce/businesses/{id}/payroll/runs` — records a paid payroll run
  from active staff hourly rates and weekly hours.
- `PATCH /commerce/branches/{id}` — persists phone, opening hours, pickup,
  delivery, payment methods, and shop preference metadata.

`backend/test_commerce.py` covers all four new store methods
(`update_business`, `update_product`, `update_product_variant`,
`list_branch_inventory`) against a temporary sqlite database — no live
Postgres/GraphHopper dependency, matching the existing `test_poi_themes.py`
pattern.

## Bulk product import (CSV / XLSX)

Merchants migrating from a spreadsheet, another POS, or a printed menu should
not have to add products one at a time. Import is a two-step flow so a
mis-mapped or partly-broken file is caught before it reaches the catalog.

- `services/product_import.py` — pure parse + validate, no database or HTTP
  access, so every rule below is unit tested (`test_product_import.py`, 13
  tests) against in-memory bytes.
  - **Flexible headers.** Column names are matched after lowercasing and
    stripping separators, against an alias table — `Product Name`,
    `product_name`, `item`, and `title` all resolve to `name`. Unrecognized
    columns are reported as ignored rather than failing the file.
  - **Required columns:** `name` and `price`. Missing either is a file-level
    error (nothing is imported). Everything else is optional.
  - **Value coercion.** `"$1,250.00"`, `"3,50"`, and `1250` all parse. This
    is deliberate: rejecting an import purely over spreadsheet formatting
    would be a bad experience, and the values are unambiguous.
  - **Row errors are collected, not raised.** One bad row does not lose the
    other 200. Per-row failures (missing name, non-numeric price, negative
    price, compare-at below price, duplicate SKU within the file) are
    returned with row numbers so the merchant can fix and re-upload.
  - **Limits:** 5MB and 2000 rows per file, enforced in the parser *and*
    again at the endpoint before the body is fully buffered.
  - `.xls` (pre-2007 binary) is rejected with an explicit "re-save as .xlsx"
    message rather than attempted — openpyxl only reads the OOXML family and
    would otherwise fail with a confusing low-level error.
- `POST /commerce/businesses/{id}/products/import/preview` — dry run.
  Returns the detected column mapping, ignored columns, valid row count,
  per-row errors, and the first 20 parsed rows. Writes nothing.
- `POST /commerce/businesses/{id}/products/import` — commits valid rows.
  Optional `branch_id` form field also sets per-branch inventory from a
  quantity column.
- `MapStore.import_products` runs in a single transaction. A row naming an
  existing product (case-insensitive) attaches another variant to it rather
  than creating a duplicate product, so re-importing a file with size
  variants behaves sensibly. SKU is globally unique in the schema, so a
  collision with an *already-stored* SKU is reported per-row in `skipped`
  rather than aborting the whole transaction.
- Frontend: `ProductImportDialog` (drag-and-drop or browse) shows the
  detected column mapping as chips, a preview table, a collapsible list of
  row errors, and an optional "also set branch stock" checkbox that appears
  only when a quantity column was actually detected and a branch exists. It
  also offers a downloadable CSV template so the expected shape is
  discoverable without reading this document.

Two supporting fixes were required and are worth noting because they were
latent bugs affecting more than import:

- `shared/api/http.ts` unconditionally set `Content-Type: application/json`
  whenever a body was present, which would corrupt any multipart upload
  (FormData must set its own boundary). It now skips that header for
  FormData bodies.
- `app/api/backend/[...path]/route.ts` only exported `GET` and `POST`, so
  every `PATCH`/`PUT` added in Phase 2 (business/product/variant edits,
  inventory writes) would have returned 405 in the browser despite working
  server-side. `PUT`, `PATCH`, and `DELETE` are now forwarded too.

## Currency: NBC exchange rates

Product prices (`product_variants.price`) stay in USD; Cambodian shops
commonly also show the KHR equivalent using the National Bank of Cambodia's
official daily rate. This mirrors a Laravel `nbc:fetch-exchange-rates`
artisan command the project owner already had — ported to this backend's
own `python artisan` runner rather than a one-off script, so it fits the
existing migration/seed/import command family.

- `services/nbc_exchange.py` — pure fetch (`requests`) + parse
  (`xml.etree.ElementTree`) of NBC's `exRate.php` XML feed, with no database
  access, so `test_nbc_exchange.py` covers malformed XML, non-numeric
  fields, and missing-currency rows without any network call.
- `ExchangeRate` model / `exchange_rates` table — one row per
  `(currency, effective_date, source)`; re-fetching the same day updates the
  existing row rather than duplicating it (`MapStore.upsert_exchange_rates`).
- `GET /commerce/exchange-rates/latest` — the most recent stored rate per
  currency; empty (not an error) until a fetch has run.
- `POST /commerce/exchange-rates/refresh` — fetches from NBC and upserts
  immediately. Same trusted-administration, no-rate-limit posture as every
  other `/commerce/*` write in this document's "Current boundary" — it
  additionally calls a third-party service on every request, so it needs
  rate limiting or auth before public exposure even sooner than the rest.
- `python artisan rates:fetch-nbc` (`scripts/fetch_nbc_exchange_rates.py`) —
  the scheduled path, meant for a daily cron/systemd timer/pm2 cron job
  rather than a user click, matching how the original Laravel command was
  meant to run on a schedule rather than on demand.
- Frontend: `useExchangeRates()` (`features/shops/hooks/use-exchange-rates.ts`)
  loads the latest rates and exposes `toKhr(usdAmount)`. Wired into
  **Manage shop** today — every product price shows a `≈ ៛X` KHR estimate
  next to the USD price, with a "Refresh" button calling the endpoint above.
  Not yet wired into POS or Stock; both are natural next spots once those
  sections need real currency conversion.

## Bootstrapping "my business"

`GET /commerce/businesses/mine` (`CommerceController.my_business`) resolves
the caller's business from the session cookie via
`AuthController.current_user_id(request)` and
`BusinessService.get_business_for_owner(owner_user_id)`, so the frontend
(`features/shops/hooks/use-my-business.ts`) no longer needs a client-side
`business_id` cache — it just calls that endpoint on mount and after
claiming a business. This also fixed a real bug: the old `window.localStorage`
cache was keyed per-browser-tab, not per-account, so signing into a
different account on the same browser without clearing storage could show
the previous account's shop. `owner_user_id` is still just a plain column
match (see its "not an authorization boundary yet" note below) — the write
APIs (`PATCH /commerce/businesses/{id}`, etc.) don't check it — but *reads*
through `/mine` are safe because the owner id comes from the verified
session, never from client input.

## Frontend architecture

```text
frontend/src/
  shared/ui/
    toast.tsx               -- global toast store + <ToastViewport/> (mounted in app/layout.tsx)
    skeleton.tsx             -- <SkeletonLine/>/<SkeletonRows/> loading placeholders
  features/shops/
    api/commerce-api.ts       -- thin wrapper over /commerce/* endpoints
    domain/commerce-types.ts  -- TS shapes matching map_store.py's .values() output
    domain/mock-shop-data.ts       -- retained visual fixtures; not used by production panels
    domain/mock-dashboard-data.ts  -- retained visual fixtures; not used by production panels
    hooks/use-my-business.ts      -- loads the session's business via GET .../mine
    hooks/use-exchange-rates.ts   -- latest NBC rates + refresh + toKhr()
    components/
      claim-business-flow.tsx -- /shops: search a place, create business + branch
      no-business-prompt.tsx  -- shown by real panels when no business is claimed
      ../admin/components/admin-shell.tsx -- shared responsive admin chrome and slots
      shop-admin-shell.tsx    -- shop navigation/content composition
      shop-location-panel.tsx -- live MapLibre branch map and editable location fields
      shop-platform-panel.tsx  -- reusable map mini-platform for shops and restaurants
      shop-platform-content.tsx -- isolated search, filters, and place result list
      manage-shop-panel.tsx   -- REAL: list/create/edit/archive products+variants
      product-import-dialog.tsx -- REAL: CSV/XLSX drag-drop, preview, commit
      stock-panel.tsx         -- REAL: read/write inventory per branch
      dashboard-overview.tsx  -- REAL: sales, orders, top sellers, low stock
      pos-panel.tsx           -- REAL: catalog order creation and stock decrement
      payroll-panel.tsx       -- REAL: staff records and payroll runs
      other-info-panel.tsx    -- REAL: branch hours, phone, methods, preferences
```

## Reusable map surface

Pages should use `features/map/components/map-view.tsx` instead of creating a
MapLibre instance or marker lifecycle themselves. `MapView` keeps the shared
basemap and liquid-glass controls consistent while allowing each screen to
configure its own behavior:

```tsx
<MapView
  center={{ latitude: 11.5564, longitude: 104.9282 }}
  zoom={16}
  markers={[{ id: "shop", latitude: 11.5564, longitude: 104.9282, label: "Shop" }]}
  showZoomControls
  showRecenterControl
  onMapClick={({ latitude, longitude }) => setDraftLocation({ latitude, longitude })}
>
  <div className="map-overlay">Page-specific status or actions</div>
</MapView>
```

Available options are `center`, `zoom`, `markers`, `mapLabel`,
`showZoomControls`, `showRecenterControl`, `onMapClick`, and `children` for
page-specific overlays. Coordinates exposed by this component are always
`latitude`/`longitude`; MapLibre's internal longitude/latitude ordering stays
inside the component.

The shop location screen edits the canonical place name, address, coordinates,
and lifecycle state separately from the merchant branch profile. It also owns
dated closure schedules for holidays, maintenance, emergencies, and other
special events. A schedule is a reversible operational override; disabling or
marking a place moved/nonexistent changes map discoverability without deleting
its branch, order, media, or audit history.

`useMyBusiness` exposes `{ business, status, error, refresh, claim }`.
`status` is `"loading" | "none" | "ready" | "error"`. Every real panel reads
`business` from this hook (not from mock data) and renders `NoBusinessPrompt`
when `status !== "ready"`.

`toast.success/error/info(message)` can be called from anywhere (it is a
module-level Zustand store, not a hook) and renders in the single
`<ToastViewport/>` mounted once in `app/layout.tsx` — auto-dismissing after
4s, individually dismissible, `role="status" aria-live="polite"` so screen
readers announce new toasts without interrupting the current task.

### Admin layout composition

The dashboard, shop list, profile, and shop-management screens share
`features/admin/components/admin-shell.tsx`. It owns the responsive shell
(desktop sidebar, tablet icon rail, mobile bottom navigation, sticky header,
content area, optional notice, and footer) and exposes navigation, header,
notice, and content as inputs. `AppShell` supplies route-backed navigation for
the top-level admin pages; `ShopAdminShell` supplies local section navigation
and renders each shop panel through the same content slot. This is the
frontend equivalent of a Blade layout yielding named sections: shell chrome is
defined once, while feature components retain ownership of their data and
behavior.

New admin screens should consume `AdminShell` rather than duplicating sidebar,
header, or bottom-navigation markup. The desktop presentation uses a compact top navigation
with a search affordance and profile action; the mobile bottom navigation
remains the responsive fallback. The desktop navigation reuses the shared
`desktop-rail liquid-card liquid-dock` primitive already used by the map
workspace, keeping active and hover behavior consistent across the app.
The search input performs client-side filtering of the available admin
sections and restores the full navigation when cleared.
The visible brand link always returns to the public map (`/`) from the
top-level admin pages; the nested shop-management shell returns to `/shops`.

Admin styling consumes the shared semantic theme through scoped `--admin-*`
roles in `(admin)/admin.css`. Navigation, forms, KPI states, charts, inventory
states, and availability badges must use those roles instead of introducing
page-specific colors. Changing the global palette or adding a `[data-theme]`
override therefore updates the admin shell and its recurring feature states
without duplicating selectors across dashboard, shops, profile, or manage
screens.

`ShopLocationPanel` is the management boundary for physical shop location
data. It reuses `useMaplibreMap` and the project basemap configuration rather
than creating a separate map engine. The marker is derived from the branch's
canonical place coordinates; editable merchant fields are saved through
`PATCH /commerce/branches/{id}` while the place itself remains the canonical
map location.

`AdminShell` renders the reusable `AppShellFooter` by default. It is semantic,
participates in the content flow, remains visible after short pages without
overlapping content, and provides a direct link back to the public map. A
nested shell may pass `footer={null}` when its own workspace already provides
the complete navigation surface.

## Map shop mini-platform

The public map keeps one MapLibre workspace and exposes a compact **Shops**
liquid-glass action. `ShopPlatformPanel` opens in the same draggable
`place-detail-shell` family used by POI details. It searches the existing place
API, filters shared POI data into restaurant and shop/store groups, and opens a
selected result in the normal place-detail flow. Commerce POI cards also
provide a direct Shop action, so users do not need to leave the map or create a
second map instance.

Both the place detail panel and shop mini-platform use the shared
`resizable-liquid-window` behavior: drag the window header to move it, resize it
from any edge or corner on desktop, or use maximize/restore to fit the available
viewport. Mobile screens disable manual resizing and use a bounded full-width
panel so the controls remain reachable. Both windows commit their geometry as
viewport `left/top/width/height`, never as a transform offset, and the window
touched last renders on top.

`docs/map-floating-windows.md` is the reference for that behavior: the shared
hooks, the eight-direction resize handles, the stacking band, and the
`smartroute-window-session` record that restores open windows, geometry,
maximized state and stacking order after a reload. The mini-platform falls back
to the trigger anchor when no saved frame exists.

The draggable **Shops** trigger button is a control rather than a window and
still uses `usePersistentWindowPosition`, which stores versioned
`{ version, x, y }` records under a component-specific key — for the trigger,
offsets inside its safe-area zone.

## Product experience

1. A signed-in user with no claimed business sees `/shops` render
   `ClaimBusinessFlow`: search for an existing place (reuses
   `usePlaceSearch`/`PlaceResults`, the same search already used by route
   planning), name the business, submit. This calls `createBusiness` then
   `createBranch` with the chosen place's ID, caches the returned business
   ID, and refreshes.
2. Once claimed, `/shops` shows a real summary card (business name, branch
   place name, verification status) and a link into `/shops/manage`.
   `/dashboard` and the shop-admin Dashboard also show the branch on a live
   MapLibre map with coordinates, recenter control, and editable branch name,
   phone, opening hours, pickup, and delivery settings.
3. `/shops/manage` → **Manage shop** lists real products (`GET
   /commerce/businesses/{id}/products`) with their variants, and a form to
   create a product + its first variant (name, category, price → `POST
   products` then `POST products/{id}/variants`).
4. `/shops/manage` → **Stock** loads real quantities for every variant across
   the business's products against the business's first branch (single-branch
   assumption, documented — multi-branch selection is future work), edits are
   disabled until the typed value differs from the loaded one, and saving
   PUTs only that row.
5. Editing: **Manage shop** rows expand into an inline edit form (name,
   price) and an archive/restore toggle; `/shops` header supports renaming
   the business inline. Every mutation shows a toast on success or failure —
   no more silent failures or inline-only error text that scrolls out of view.
6. Dashboard/POS/Payroll/Other info stay reachable from the same shell and
   use persisted backend data. Public checkout, payment settlement, delivery
   assignment, and merchant moderation remain outside this workspace.

## Functional requirements

Real sections (Claim business, Manage shop, Stock) must, today:

- **FR1** — A signed-in user with no claimed business can search any place
  already on the map and turn it into a claimed business + branch in one
  flow, with field-level validation preventing submission until a place and
  a non-empty name are chosen.
- **FR2** — A claimed business's products are listed with their first
  variant's price and status; the list supports client-side search by name
  once more than 4 products exist (no backend pagination yet — see NFR3).
- **FR3** — A product and its first variant can be created, edited (name,
  price), and archived/restored without a page reload; the in-memory list
  updates from the mutation response rather than always refetching.
- **FR4** — Stock quantities are loaded from the server on mount (not
  defaulted to zero) and saved per-row; the save action is disabled when the
  typed value matches the already-saved value, preventing redundant writes.
- **FR5** — Every create/update/error surfaces a toast in addition to any
  inline message, so feedback is visible even if the triggering form has
  scrolled out of view.
- **FR6** — POS creates a persisted order from active catalog variants and
  decrements available stock when inventory exists for the selected branch.
- **FR7** — Any real panel rendered before a business is claimed shows
  `NoBusinessPrompt` with a link back to `/shops`, never a crash or a blank
  panel.

## Non-functional requirements

- **NFR1 (Responsiveness)** — Every panel in this feature works down to a
  360px-wide phone viewport and up through a 1440px+ desktop, using the
  existing three-tier shell (phone bottom nav / tablet icon rail / desktop
  labeled sidebar). Tables that cannot reflow (`stock-table`,
  `payroll-table`) scroll horizontally inside their own container rather
  than forcing the page to scroll sideways.
- **NFR2 (Perceived performance)** — Any network fetch longer than a frame
  shows a skeleton (`SkeletonRows`) instead of layout-shifting text like
  "Loading…"; buttons that trigger a mutation disable themselves and show a
  busy label (`"Saving…"`) for the duration of the request so a user cannot
  double-submit.
- **NFR3 (Known scale limit)** — `GET /commerce/businesses/{id}/products`
  and `GET /commerce/branches/{id}/inventory` are unpaginated. Client-side
  search in Manage Shop is a stopgap for small catalogs; a business with
  hundreds of products needs real backend pagination before this UI holds
  up. Documented here rather than silently degrading.
- **NFR4 (Accessibility)** — All icon-only buttons carry `aria-label`;
  status/quantity changes are announced via the toast system's
  `aria-live="polite"` region rather than relying on sighted-only color
  changes; form inputs keep visible placeholder/label text, not
  color-as-the-only-signal.
- **NFR5 (Data integrity)** — All validation that exists server-side
  (`compare_at_price >= price`, non-negative quantities, unique SKU/slug) is
  not re-implemented differently on the client; the client performs only
  cheap presence/type checks before submit and surfaces the server's
  rejection message verbatim through `ApiError`/toast otherwise.
- **NFR6 (Testability)** — Every new backend store method has a unit test
  against a disposable sqlite database (`test_commerce.py`); no test
  requires the live Postgres/GraphHopper stack.
- **NFR7 (Authorization boundary honesty)** — Nothing in this feature
  implies a security boundary that does not exist. The claimed-business
  cache is documented as client-side convenience; the UI does not present
  "Edit shop" or "Add item" as owner-restricted actions because the backend
  does not restrict them yet.

## Delivery plan

### Phase 1 (done)

- `commerce-api.ts`, `commerce-types.ts`, `useMyBusiness`.
- `ClaimBusinessFlow` replacing the old "coming soon" stub on `/shops`.
- Real `ManageShopPanel` (list + create product/variant), real `StockPanel`
  (declare quantity per variant, single branch).
- Dashboard, POS, Payroll, and Other Info now use persisted backend contracts.

### Phase 2 (done)

- `PATCH /commerce/businesses/{id}`, `PATCH /commerce/products/{id}`,
  `PATCH /commerce/variants/{id}`, `GET /commerce/branches/{id}/inventory`.
- Inline edit/archive in Manage Shop; real read-then-write Stock panel;
  inline business rename on `/shops`.
- Shared toast system (`shared/ui/toast.tsx`) and skeleton loaders
  (`shared/ui/skeleton.tsx`) wired into every real panel.
- `backend/test_commerce.py` covering the four new store methods.

### Phase 3 (backend work required first)

- Pagination on `GET .../products` and `GET .../inventory` (NFR3).
- Multi-branch selection in Stock once a business can have more than one
  active branch worth managing independently.

### Phase 4 (platform work required)

- Payment, delivery, and customer identity state around the now-real merchant
  POS order ledger.
- Merchant auth and ownership checks before any of this is safe to expose
  publicly (`place-commerce-foundation.md`, "Next phases" #1).

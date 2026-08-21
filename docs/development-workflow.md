# Development workflow

## Documentation-first feature changes

Before implementing or changing a feature, review related files in `docs/` and use them as implementation context. After changing code, update the documents affected by behavior, API, configuration, architecture, setup, limitations, or workflow changes.

The repository skill `.codex/skills/docs-first-feature` formalizes this workflow. Its helper can rank relevant documents before work begins:

```bash
python .codex/skills/docs-first-feature/scripts/docs_context.py review \
  --query "route calculation performance"
```

After implementation and testing, verify that implementation changes include a documentation update:

```bash
python .codex/skills/docs-first-feature/scripts/docs_context.py verify --base HEAD
```

Use `--docs-dir <directory>` when a repository stores documentation outside `docs/`, and use `--base <revision>` to validate a branch or commit range.

## Frontend production builds

The frontend pins Node.js 22 through `frontend/.nvmrc` and the `engines` field in
`frontend/package.json`. Activate that version before building; Bun does not
enforce the package engine when it launches a script:

```bash
cd frontend
nvm use
bun run build
```

The webpack build worker remains enabled, but Next.js worker threads stay
disabled because they have intermittently terminated with `SIGSEGV` on the
development host. Static generation still uses `NEXT_BUILD_CPUS` process
workers. Local `.env.local` overrides `.env`; set `NEXT_BUILD_CPUS=1` for the
lowest-concurrency diagnostic fallback on a constrained or unstable host.

## Frontend visual conventions

The map workspace uses a restrained liquid-glass surface language for floating UI. Its shared recipe is a translucent 62% surface (70% for popovers), 28px background blur with moderate saturation, a restrained diagonal sheen, a soft one-pixel specular rim, inner highlights, and a broad low-contrast green-tinted shadow. The lower opacity and stronger diffusion allow map colors to bleed into the surface as soft fields while remaining opaque enough for interface text. Theme values—including surface, sheen, backdrop filter, active and hover colors, borders, radii, and layered shadows—live in the `--liquid-*` custom properties in `frontend/src/app/globals.css`. Browsers without backdrop-filter support receive a nearly opaque fallback surface.

Use `LiquidCard` from `frontend/src/shared/ui/liquid.tsx` for standard surfaces, popovers, and pills. Use `LiquidSwitch` for compact selectable tab groups; the four-item bottom dock is its reference implementation. The dock is a quiet 60px outer capsule with evenly spaced tabs, 20px line icons, subdued inactive labels, and a flat near-circular active surface without its own border or shadow. The active fill uses the reference-style pale `--dock-active-background`, while icon, label, and hover color consume the theme's `--liquid-active-color`. Keep these dock overrides scoped below `.liquid-dock` so route-mode switches retain their own sizing. The planner menu control toggles the dock while shifting the planner and filter row to their collapsed offsets. Place data opens from the dock instead of a separate map overlay.

Public global CSS is split by ownership: design tokens, shared liquid primitives,
MapLibre integration, and window primitives remain in `app/globals.css`; route
feature rules live in `features/routes/routes.css`; cross-feature mobile sheet
adaptations live in `app/mobile-surfaces.css`; admin/shop-owner rules remain in
`app/(admin)/admin.css`. Feature styles are imported once from the root layout,
so components do not import global CSS and the cascade remains explicit.

The color system has a raw `--palette-*` layer and a semantic `--color-*` layer.
Components consume semantic roles for text, surfaces, borders, focus, brand, and
status colors; the `--liquid-*` variables are the glass-theme API. Existing
`--brand`/`--ink`/`--muted` aliases are compatibility names only. A future theme
should override semantic and liquid variables under `[data-theme="..."]` rather
than changing feature selectors. Raw colors remain acceptable only for
MapLibre/external-library data or documented illustration-specific effects.
Existing Tailwind palette utilities are covered by a semantic compatibility
bridge at the end of `app/globals.css`; this keeps older views themeable while
they move to feature-owned classes. New JSX must not add palette utility colors.
The audit intentionally leaves MapLibre paint configuration, manifest metadata,
POI category accents, and fixed illustration SVG fills as local integration or
visual data rather than UI theme roles.

The route planner uses the same primitives: a `LiquidCard` popover contains a pill-shaped `LiquidSwitch` for travel modes, softly separated point cards, and liquid secondary actions. Active mode and point states use the shared active surface instead of underline tabs or stark white focus cards. Preserve route calculation, endpoint editing, search, geolocation, and swapping behavior when changing this presentation. Opening Directions registers the `route-planner` sheet in the shared bottom-sheet state with its base title; the shared `BottomSheet` renders the `DraggableLiquidSheet` chrome and keeps the planner mounted while its content remains feature-owned. On desktop, the planner is a constrained liquid window: only its dedicated header handle starts horizontal/vertical dragging, so inputs and actions remain interactive; its JSON position is persisted under `smartroute-window-position:route-planner-window` and clamped when the viewport changes.

The combined car-and-motorbike mode uses one purpose-built, low-detail SVG with
a car, transition arrow, and motorbike on a shared viewBox. Keep this reusable
icon readable at the route switch's 26-by-19-pixel size; do not overlap the two
full vehicle icons or depend on an external image.

Use `DraggableLiquidSheet` from `frontend/src/shared/ui/liquid.tsx` when a dense card must become a mobile bottom sheet. It uses `framer-motion` for `AnimatePresence`, spring-based edge-aware enter/exit motion, handle-only vertical dragging, velocity-aware swipe dismissal, and reduced-motion support. It remains a normal liquid popover above 820px; on mobile it adds a dismissible translucent overlay, half and full snap positions, Escape dismissal, and keyboard-accessible snap controls. Keep dragging restricted to the handle so form fields and scrolling inside the card remain usable. Desktop popovers move from the nearest top edge, mobile sheets move from the nearest bottom edge, and the overlay fades in sync without blurring the map. Its owner must establish a stacking context above MapLibre's control and marker layers so zoom, attribution, markers, and other map-native controls cannot render through the overlay or card during the entire exit transition.

Map-native overlays that cannot render React components, including route-time labels, must consume the same `--liquid-*` tokens for their surface, pointer, active state, border, and shadow.

MapLibre zoom and attribution controls also consume the shared liquid CSS variables. Their bottom offset is driven by the base `--floating-controls-bottom` value and responsive `.has-bottom-nav` overrides. At 1180px and below, the dock is centered to avoid left-edge map controls and floating controls reserve its bottom slot only while navigation is visible; when navigation collapses, they transition back to the map edge. Keep the mobile override after the compact-desktop override so its equal-specificity `78px` value wins over `88px`. Above 1180px, the dock aligns with the left-side planner and right-side map controls remain at the viewport edge because they cannot overlap. Map attribution is configured in `map-canvas.tsx`, uses a single always-expanded pill without the compact info toggle, and must retain visible OpenStreetMap and CARTO links. POI previews use a compact horizontal liquid card with framed media, a category marker, real place metadata, a local save control, and the route action; do not fabricate ratings, prices, or amenities when source data is absent. The MapLibre popup pointer and preview wrapper share one solid liquid surface and border so their join is visually seamless.

POI previews follow the `development` branch reference: a 360-pixel content
width, 132-pixel minimum height and media column, four-pixel grid gap, and
single-line ellipsis title. On viewports up to 380 pixels the media column
shrinks to 104 pixels and the popup keeps a 12-pixel edge inset. Missing address
or opening-hours metadata does not collapse the card into a different shape.
The footer remains aligned without squeezing its source or route action. Use a
20-pixel MapLibre popup offset for the 28-pixel POI marker, leaving six pixels of
breathing room between the marker edge and pointer for bottom, corner, and side
anchors. For MapLibre's four corner anchors, square only the corner joined to the
pointer so the triangular head connects cleanly; preserve the 24-pixel radius on
the other corners. Keep the MapLibre marker root absolutely positioned and free
of CSS transform transitions; hover scaling belongs on an inner visual element
so POIs remain geographically anchored during pan and zoom.

The right-side map action group provides map-layer settings, current-location, focus-selected-route, and reset-to-north/default-view actions. It uses the shared liquid surface and sits below the search and category stack on mobile, including the top safe-area inset. The focus-route action is disabled until a route exists and fits the selected route plus connectors with planner-aware left padding; it does not invoke the browser Fullscreen API. The layer settings popover uses the same liquid surface and offers named presets plus individual accessible switches; changes apply directly to the single MapLibre instance and persist through the application-shell store. Keep its rendering in the reusable `MapLayerSettings` component, disclosure and preset interaction in `useMapLayerSettings`, and persistence in the shared store so the action group remains composition-only. Current-location actions require HTTPS, use a 20-second high-accuracy request with a short-lived cached-position allowance, and place a persistent green `Your location` marker with two staggered, expanding GPS waves plus the reported-accuracy map halo before centering the map; subsequent requests move the existing marker and replace the accuracy geometry. The CSS waves are non-interactive, use no external media, and are hidden for `prefers-reduced-motion`. Permission denial, unavailable Location Services, insecure context, and timeout failures must be shown to the user rather than silently ignored.

Vertical map button stacks use the shared `MapControlGroup` and
`MapControlButton` primitives from `frontend/src/shared/ui/map-controls.tsx`.
The top-right action stack and bottom-right zoom-in/zoom-out stack share their
44-pixel capsule, 42-pixel button, divider, hover, focus, active, disabled, and
icon treatment. Do not also mount MapLibre's native navigation control.

The bottom navigation and map guidance pill are mutually exclusive state surfaces. The `map-footer` guidance pill is temporarily hidden in CSS while the bottom workspace stack is simplified; keep its markup intact so it can be restored without rebuilding the content. When restored, the dock must be shown while navigation is expanded and the guidance pill must occupy the same responsive anchor only when navigation is collapsed.

Current-location requests remain single-flight until the browser callback
completes. New MapLibre location markers receive coordinates before attachment,
and the camera stops an active transition before flying to the reported point.

## Responsive workspace composition

The map remains the primary full-screen canvas and interface surfaces form a responsive HUD grid above it. On wide screens, the route search and category strip share the top row. The category strip is not an enclosing toolbar: each category is an independent liquid pill directly above the map, without duplicate product branding or location status. Below 900px, the horizontally scrollable strip stacks beneath the search surface. Route search results and directions replace content below the search rather than creating a separate competing column. A single full-size MapLibre map owns interaction, the default CARTO Voyager online basemap, optional PMTiles hybrid mode, WebGL route rendering, markers, and right-edge controls. Online mode must not register or request PMTiles; enable the retained hybrid implementation with `NEXT_PUBLIC_MAP_BASEMAP_MODE=hybrid`. Do not add a second synchronized map instance; camera synchronization adds duplicate work to every pan and zoom frame.

The root document has no painted background or overscroll surface, and the workspace is fixed to all four viewport edges instead of relying on dynamic viewport height. This keeps the map flush with iOS standalone-mode edges and short mobile viewports instead of exposing a page-colored band. Mobile safe areas are enabled with `viewport-fit=cover`; top controls add `safe-area-inset-top`, while the dock and adjacent MapLibre controls add `safe-area-inset-bottom` so they remain usable without shortening the map canvas.

The map workspace rail exposes real user actions: Explore is the default map
view, Locate requests browser location, Place data opens the place-data surface,
Directions opens the route planner, and Map tools contains Clear route, Focus
route, and Reset map. Focus is disabled when no route exists; clearing a route
opens the themed in-app alert dialog in the shared draggable liquid sheet, using
the same inset rounded mobile shell as the route planner and a feature-owned
confirmation child, and requires explicit confirmation before dispatching the
clear command. Keep these actions routed through the existing
map command events so the rail, assistant menu, and right-side controls share
one behavior owner.

## Progressive web app

The frontend publishes `/manifest.webmanifest` from `frontend/src/app/manifest.ts`, registers `frontend/public/sw.js` from the root layout in production, and provides 192px, 512px, and Apple touch icons under `frontend/public/icons/`. Installed launches use standalone display mode and a translucent iOS status bar so the map remains the primary full-screen canvas. Development mode unregisters existing workers and clears `psarai-shell-*` caches because Turbopack can reuse chunk URLs; a cache-first development chunk can otherwise combine stale client code with fresh server HTML and cause hydration failures. In production, static assets use network-first delivery with cached offline fallback, and changing cache behavior requires incrementing `CACHE_NAME` so old entries are removed during activation. The local PMTiles archive and CARTO tiles remain outside Cache Storage. Online mode uses normal browser HTTP caching for CARTO and makes no PMTiles request. Hybrid mode uses HTTP range and in-memory caching for PMTiles and requests CARTO only when the local viewport rule does not cover the view.

For the production host, `deploy/nginx/psarai.com.conf` is the reverse-proxy
template: HTTPS serves Next.js on `127.0.0.1:3100`, `/api/backend/*` remains
same-origin through Next.js, and `/ws/assistant` upgrades directly to FastAPI
on `127.0.0.1:8100`. Install it under `/etc/nginx/sites-available`, link it
into `sites-enabled`, run `nginx -t`, and reload Nginx after confirming the
Let's Encrypt certificate paths.

## Shared application state

`frontend/src/app/layout.tsx` is the root composition owner and mounts `AppShellProvider` from `frontend/src/shared/state/app-shell-context.tsx`. The provider creates a scoped Zustand vanilla store for cross-feature UI state: navigation selection, dock collapse, POI filters, language preference, map-layer visibility, and Place Data modal visibility. Language and map-layer preferences persist in browser local storage. Components consume individual state slices through selector calls such as `useAppShell((state) => state.language)`; do not subscribe to the entire store, duplicate shared state locally, or coordinate it through window events. In particular, never read `localStorage` or branch on `window` during render: the server and first client render must use the same store defaults, then the provider hydrates persisted preferences after mount. The scoped provider prevents state leakage between layout trees, and the layout remains a server component so Next.js metadata exports continue to work.

The same store owns the active shared bottom sheet as `{ id, title }`; use the
`BottomSheet` wrapper from `shared/ui/bottom-sheet.tsx` for sheet chrome and
open or close it through the store instead of duplicating local open state.

Reusable client preferences use `useLocalStore` from
`frontend/src/shared/hooks/use-local-store.ts`. It keeps the supplied default for
the server and hydration snapshots, validates stored JSON after mount, shares
updates between hook consumers, and handles browser `storage` events. Feature
stores remain the runtime source consumed by UI components; hydrate them from
the hook after mount rather than reading local storage during render.

## UI translations

User-facing interface strings are catalog data, not backend map-data
translations. The English source catalog is
`frontend/public/lang/en.json`; locale files such as `km.json` keep the same
key structure. Components use `useI18n()` and provide the English string as a
safe first-render fallback. The loader reads `/lang/{locale}.json`, caches it,
and falls back to English if a locale file is unavailable.

Add new UI strings to `en.json` first, then mirror the key in every supported
locale. Do not translate tool names, enum values, coordinates, CSS classes, or
API payloads. To generate a locale from the English catalog with the existing
failure-tolerant translation service, run:

```bash
cd backend
.venv/bin/python scripts/translate_ui_catalog.py --target km --force
```

Review generated translations before shipping them. The script preserves
nested keys, never overwrites the English source, and supports future locales
through another `--target` value.

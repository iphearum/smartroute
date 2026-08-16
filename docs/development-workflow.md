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

## Frontend visual conventions

The map workspace uses a restrained liquid-glass surface language for floating UI. Its shared recipe is a translucent 62% surface (70% for popovers), 28px background blur with moderate saturation, a restrained diagonal sheen, a soft one-pixel specular rim, inner highlights, and a broad low-contrast green-tinted shadow. The lower opacity and stronger diffusion allow map colors to bleed into the surface as soft fields while remaining opaque enough for interface text. Theme values—including surface, sheen, backdrop filter, active and hover colors, borders, radii, and layered shadows—live in the `--liquid-*` custom properties in `frontend/src/app/globals.css`. Browsers without backdrop-filter support receive a nearly opaque fallback surface.

Use `LiquidCard` from `frontend/src/shared/ui/liquid.tsx` for standard surfaces, popovers, and pills. Use `LiquidSwitch` for compact selectable tab groups; the four-item bottom dock is its reference implementation. The dock is a quiet 60px outer capsule with evenly spaced tabs, 20px line icons, subdued inactive labels, and a flat near-circular active surface without its own border or shadow. The active fill uses the reference-style pale `--dock-active-background`, while icon, label, and hover color consume the theme's `--liquid-active-color`. Keep these dock overrides scoped below `.liquid-dock` so route-mode switches retain their own sizing. The planner menu control toggles the dock while shifting the planner and filter row to their collapsed offsets. Place data opens from the dock instead of a separate map overlay.

The expanded route planner uses the same primitives: a `LiquidCard` popover contains a pill-shaped `LiquidSwitch` for travel modes, softly separated point cards, and liquid secondary actions. Active mode and point states use the shared active surface instead of underline tabs or stark white focus cards. Preserve route calculation, endpoint editing, search, geolocation, and swapping behavior when changing this presentation.

Use `DraggableLiquidSheet` from `frontend/src/shared/ui/liquid.tsx` when a dense card must become a mobile bottom sheet. It uses `framer-motion` for `AnimatePresence`, spring-based edge-aware enter/exit motion, handle-only vertical dragging, velocity-aware swipe dismissal, and reduced-motion support. It remains a normal liquid popover above 820px; on mobile it adds a dismissible glass overlay, half and full snap positions, Escape dismissal, and keyboard-accessible snap controls. Keep dragging restricted to the handle so form fields and scrolling inside the card remain usable. Desktop popovers move from the nearest top edge, mobile sheets move from the nearest bottom edge, and the overlay fades in sync. Its owner must establish a stacking context above Leaflet's `1000` control layer so zoom, attribution, markers, and other map-native controls cannot render through the overlay or card during the entire exit transition.

Map-native overlays that cannot render React components, including route-time labels, must consume the same `--liquid-*` tokens for their surface, pointer, active state, border, and shadow.

Leaflet zoom and attribution controls also consume the shared liquid CSS variables. Their bottom offset is driven by the base `--floating-controls-bottom` value and responsive `.has-bottom-nav` overrides. At 1180px and below, the dock is centered to avoid left-edge map controls and floating controls reserve its bottom slot only while navigation is visible; when navigation collapses, they transition back to the map edge. Keep the mobile override after the compact-desktop override so its equal-specificity `78px` value wins over `88px`. Above 1180px, the dock aligns with the left-side planner and right-side map controls remain at the viewport edge because they cannot overlap. Map attribution is configured in `map-canvas.tsx` and displayed as `PsarAI Platform. (Cambodia)` without Leaflet's default prefix. POI previews use a compact horizontal liquid card with framed media, a category marker, real place metadata, a local save control, and the route action; do not fabricate ratings, prices, or amenities when source data is absent. The Leaflet popup pointer and preview wrapper share one solid liquid surface and border so their join is visually seamless.

The bottom navigation and map guidance pill are mutually exclusive state surfaces. The `map-footer` guidance pill is temporarily hidden in CSS while the bottom workspace stack is simplified; keep its markup intact so it can be restored without rebuilding the content. When restored, the dock must be shown while navigation is expanded and the guidance pill must occupy the same responsive anchor only when navigation is collapsed.

## Responsive workspace composition

The map remains the primary full-screen canvas and interface surfaces form a responsive HUD grid above it. On wide screens, the route search and category strip share the top row. The category strip is not an enclosing toolbar: each category is an independent liquid pill directly above the map, without duplicate product branding or location status. Below 900px, the horizontally scrollable strip stacks beneath the search surface. Route search results and directions replace content below the search rather than creating a separate competing column. Leaflet controls own the right edge, while navigation owns the bottom slot.

## Shared application state

`frontend/src/app/layout.tsx` is the root composition owner and mounts `AppShellProvider` from `frontend/src/shared/state/app-shell-context.tsx`. The provider creates a scoped Zustand vanilla store for cross-feature UI state: navigation selection, dock collapse, POI filters, language preference, and Place Data modal visibility. Components consume individual state slices through selector calls such as `useAppShell((state) => state.language)`; do not subscribe to the entire store, duplicate shared state locally, or coordinate it through window events. The scoped provider prevents state leakage between layout trees, and the layout remains a server component so Next.js metadata exports continue to work.

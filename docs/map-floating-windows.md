# Map floating windows

## Scope

The public map hosts three floating windows that share one behavior contract:

| Window | Component | Session id |
| --- | --- | --- |
| Place details | `features/places/components/place-detail-panel.tsx` | `place-detail-window` |
| Shop mini-platform | `features/shops/components/shop-platform-panel.tsx` | `shop-platform-window` |
| Route planner sheet | `features/routes/components/route-panel.tsx` | `route-planner-window` |

The shared pieces live in `shared/`:

```text
shared/hooks/use-window-session.ts   persisted geometry, open/maximized, stacking order
shared/hooks/use-window-frame.ts     pointer drag + eight-direction resize on top of the session
shared/ui/window-resize-handles.tsx  the eight edge and corner hit targets
app/globals.css                      .resizable-liquid-window, .liquid-window-scroll, .liquid-window-resize-*
```

## Positioning contract

**A window's position is layout, never a transform.** Geometry is committed as
`left` / `top` / `width` / `height`; nothing writes a `translate` that the
committed value would have to agree with.

This rule exists because breaking it caused a real bug. The shop mini-platform
used to drag with framer-motion (`drag` + `dragControls`), which moves an
element with a CSS transform, and then committed the result as `left`/`top` on
`onDragEnd`. framer-motion never clears its drag transform, so on release the
window received the new `left`/`top` **plus** the leftover translate and jumped
by the drag distance a second time:

```text
style: transform: translateX(-833px) translateY(210px); left: 685px; top: 227px;
painted at: x = -148, y = 438        <-- the reported "jump after releasing"
```

The same conflict left a stale `translateY(-13px)` on the window after opening,
because the entrance animation and the drag both wrote the `y` motion value.

Two further details follow from the rule:

- A gesture reads its origin from `offsetLeft` / `offsetTop` / `offsetWidth` /
  `offsetHeight`, not `getBoundingClientRect()`, so grabbing a window while its
  entrance spring is still running does not bake the animation offset into the
  stored position.
- Live gesture values stay in component state; the session record is written
  once, on pointer release.

The route planner is the documented exception: its sheet still moves with
framer-motion motion values, so its stored `x`/`y` are translate offsets rather
than viewport coordinates. It is not resizable, and its `expanded` state is not
restored because the sheet's content depends on the in-memory route store.

## Dragging

The window moves from its whole title area, not only the pill: the drag props go
on `.place-detail-draghandle` **and** on the block below it — the photo
(`.place-detail-media`) for place details, the heading
(`.shop-platform-heading`) for the shop mini-platform. The pill strip alone is
15px tall and loses its top 6px to the resize band, which leaves a target too
small to hit reliably.

Because a drag region covers interactive children, a gesture starting on a
`button`, `a`, `input`, `select`, `textarea`, `[role="button"]` or
`[contenteditable]` is ignored, so the maximize, close and save controls inside
the region still behave like buttons.

Dragging is clamped so the window stays fully inside the viewport with a 12px
margin. A window taller than the viewport therefore stops at the top margin
instead of being draggable off the bottom edge.

## Resizing

`resize: both` is gone. The native grip only offered the bottom-right corner,
so the window is now resized from **any edge or corner**: `n`, `s`, `e`, `w`,
`ne`, `nw`, `se`, `sw`, rendered by `WindowResizeHandles`.

- Dragging `w` or `n` moves the origin as well as the size, so the opposite
  edge stays pinned.
- Size is clamped to `300 x 220` minimum and to the viewport (12px margin).
- The bottom-right handle keeps a small drawn grip so the affordance the native
  resizer used to provide is still visible.
- Handles are hidden while a window is maximized, and below 640px where windows
  are full-width by design.
- `.liquid-window-resize` sits at `z-index: 20`, above the drag handle's
  `z-index: 10`. The drag strip spans the full width of the window top, so a
  lower value leaves the top edge and both top corners draggable but not
  resizable. The `n`/`s` bands are 6px so the top band stops short of the drag
  handle's pill, which is `pointer-events: none` decoration.

Two layout constraints make this work:

- `.resizable-liquid-window` is `overflow: visible` and lays its children out as
  a flex column. It must not clip, or the 28px rounded corners would swallow the
  corner handles — `document.elementFromPoint` returns the map canvas for a
  point inside the corner arc of a clipped shell.
- Clipping and scrolling move to an inner `.liquid-window-scroll` element
  (`flex: 1 1 auto; min-height: 0; overflow: auto`), so window content scrolls
  inside a resized frame while the drag handle and the resize handles stay put.

### The scroll area follows the window height

A window that carries an explicit height gets `data-sized="true"`, which drops
the content cap on its scroll area:

```css
.resizable-liquid-window[data-sized="true"] .liquid-window-scroll {
  max-height: none;
}
```

Without it a scroll area keeps the cap that sizes the *default* window and stops
growing with the frame. The shop mini-platform showed this: its result list caps
at `min(52vh, 430px)` so the unsized window opens compact, but in an 820px tall
window the list stayed 430px and left 240px of dead space below it. The cap
still applies while the window is unsized, so default windows are unchanged.

A window taller than its content still shows empty space below that content —
that is the frame being larger than what fills it, not a layout fault.

## Window chrome

**One shared, pinned control row.** `.window-controls` is a direct child of
the shell — a sibling of the drag handle and resize handles, not nested inside
the photo or the heading — positioned `top: 14px; right: 14px` with an 8px gap
between its 32px circular buttons, at `z-index: 30` (above the drag handle's
10 and the resize handles' 20). Both windows render it identically:

```tsx
<div className="window-controls">
  <button className="place-detail-save">…</button>       {/* place details only */}
  <button className="place-detail-window-toggle">…</button>
  <button className="place-detail-close">…</button>
</div>
```

This replaced two earlier, inconsistent approaches and fixed two real bugs
along the way:

- The controls used to live *inside* `.place-detail-media`, which sits inside
  `.liquid-window-scroll`. Scrolling the card's body scrolled the photo — and
  the maximize/close buttons on it — out of view, with no way to get them back
  short of scrolling up again. Pinning the row outside the scroll wrapper (as
  a direct shell child) fixes that for both windows.
- The two windows computed their top-right inset from different reference
  points — place details from the photo's own `top-2 right-2`, the shop
  platform from flex `space-between` inside a padded heading — so the rows sat
  at visibly different heights next to each other. Anchoring both to the shell
  itself makes the inset identical by construction, not by tuning two numbers
  to match.

**Reserve space in layout, don't fake it with absolute positioning over
flexible content.** Because `.window-controls` is `position: absolute`, it
takes no space in the heading's flow — so `.shop-platform-heading` carries an
explicit `padding-right: 100px` (72px control width + 14px inset + a little
room) to keep its title wrapping before it reaches under the pinned row,
instead of running underneath it. This is the same failure mode documented
below it once already: sizing a flex sibling by its absolute-positioned
neighbor's *presence* rather than its *reserved space* is what caused the
original title/button overlap bug. Place details doesn't need the same
padding — its title sits in `.place-detail-body`, well below the 168px photo,
so there's no horizontal collision to guard against.

The reflection you see across the top-left of every window is
`--liquid-sheen`, a diagonal gradient set by `.liquid-popover`. Watch for the
`background` shorthand elsewhere in the cascade: `.place-detail-shell` used to
set `background: var(--liquid-popover-background)`, and since the shorthand
resets every background sub-property it was quietly zeroing out
`background-image` — and with it the sheen — on both windows that share the
class. Use `background-color` for a solid fill when a `background-image` is
meant to keep showing through from another rule.

## Stacking order

The window touched last renders on top. `useWindowSession` keeps a monotonic
`order` per window and ranks the open windows by it; `zIndex` is
`1100 + rank * 10`, so the values stay inside a fixed band (1100–1120 for three
windows) instead of climbing with every click. Closing a window frees its slot
and the remaining windows compact back down.

Each window raises itself on `onPointerDownCapture`, so clicking a button, an
input or the drag handle inside it also brings it forward. Neighbouring bands:
POI marker hover uses `1000`, toasts use `2000`.

## Minimum size and the chrome it has to fit

`useWindowFrame`'s `minWidth`/`minHeight` (default `300`/`220`) are a resize
floor, not a promise that everything above them fits. The shop mini-platform's
chrome — drag strip, heading, search box, filter tabs — needs about 212px
before the results list gets a single pixel, so it passes its own
`minHeight: 280`, leaving a usable sliver of list at the smallest size instead
of a window that is all chrome.

Two more pieces keep a small window from spilling past its own rounded
corners instead of just looking cramped:

- `.shop-platform-results` no longer carries a `min-height: 100px` floor. A
  flex child's default minimum is its content size, not zero — an explicit
  floor like that stops it shrinking with the window, and past a small enough
  height the list pushed below the bottom of the glass card instead of
  scrolling inside it.
- `useWindowFrame` clamps a **restored** width/height up to `minWidth`/
  `minHeight`, not only a size produced by a live resize gesture. A session
  saved before `minHeight` was raised — or one written by a future window that
  changes its own floor — would otherwise restore below the current minimum on
  reload with nothing to catch it.

## Session persistence

One record under `localStorage["smartroute-window-session"]` holds the whole
desktop:

```jsonc
{
  "version": 3,
  "windows": {
    "place-detail-window": {
      "x": 770, "y": 114,        // 0/0 means "not moved yet": CSS anchoring applies
      "width": 336, "height": 292, // 0 means "not resized yet"
      "open": true,
      "maximized": false,
      "order": 3,                // higher = closer to the front
      "payload": { /* the Place the card is showing */ }
    }
  }
}
```

Reloading the page restores which windows were open, where they were, how big
they were, whether they were maximized, and the order they were stacked in.
Place details also store the `Place` they were showing, so the card comes back
with its content instead of an empty shell; the payload is validated on restore
and ignored if it no longer looks like a place. A record with a different
`version`, or one that fails validation, is dropped and the windows fall back to
their CSS anchored defaults.

The store hydrates on first subscription rather than during render, so the
server render and the first client render agree. Restore effects must wait for
the `hydrated` flag before writing — the route planner briefly sees `open:
false` during that window, and marking itself open too early would push it to
the top of the stack on every reload.

`usePersistentWindowPosition` (`{ version, x, y }` under
`smartroute-window-position:<key>`) still backs the draggable **Shops** trigger
button, which is a control rather than a window.

## Limitations

- Maximize uses a fixed `min(760px, ...)` frame; it does not remember a
  per-window maximized size.
- There is no minimize-to-dock state. `open: false` is the only collapsed form,
  and it keeps the geometry for the next open.
- Below 640px, resizing is disabled and windows use the bounded full-width
  layout.

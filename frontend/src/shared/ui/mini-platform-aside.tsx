"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useWindowFrame } from "@/shared/hooks/use-window-frame";
import { Icon, type IconName } from "./icon";

const MIN_WIDTH = 300,
  MAX_WIDTH = 640;

const clampWidth = (value: number) =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, value));

/**
 * One launcher on the collapsed rail. The chrome lives here so every rail
 * button — the aside's own and each one a `MiniPlatformDock` loops out — is the
 * same size and glass treatment by construction rather than by copied classes.
 */
export function MiniPlatformRailButton({
  label,
  icon,
  onClick,
  ariaLabel,
  title,
}: {
  label: string;
  icon: IconName;
  onClick: () => void;
  ariaLabel: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="mini-platform-rail-button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
    >
      <span className="mini-platform-rail-label">{label}</span>
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

export function MiniPlatformAside({
  windowId,
  open: controlledOpen,
  title,
  eyebrow = "MINI PLATFORM",
  ariaLabel,
  collapsedLabel = "OPEN",
  collapsedIcon = "chevron-left",
  width = 400,
  minHeight = 360,
  onOpenChange,
  onWidthChange,
  panelKey,
  status,
  toolbar,
  children,
  headerActions,
  collapsedActions,
  showCollapsedButton = true,
  placementStyle,
}: {
  windowId: string;
  open?: boolean;
  title: ReactNode;
  eyebrow?: ReactNode;
  ariaLabel: string;
  collapsedLabel?: string;
  collapsedIcon?: IconName;
  width?: number;
  minHeight?: number;
  onOpenChange?: (open: boolean) => void;
  onWidthChange?: (width: number) => void;
  /** Stable key used to animate panel-specific header content on tab changes. */
  panelKey?: string;
  status?: ReactNode;
  /** Full-width row directly under the header, e.g. a centered tab strip. */
  toolbar?: ReactNode;
  children: ReactNode;
  headerActions?: ReactNode;
  collapsedActions?: ReactNode;
  showCollapsedButton?: boolean;
  placementStyle?: CSSProperties;
}) {
  /** Live edge-resize gesture: the panel's right edge stays pinned where it was. */
  const resizing = useRef<{ pointerId: number; right: number } | null>(null);
  const [internalWidth, setInternalWidth] = useState(width);
  const reduceMotion = useReducedMotion();
  const displayWidth = onWidthChange ? width : internalWidth;
  // The aside is docked, not free floating: the map viewport reserves its width
  // on the right, and `MapActionControls` offsets itself by the same value. A
  // committed x/y would set `right: auto` and slide the panel out from under
  // that reservation, so the frame is locked and only `width` is ever owned
  // here. Stacking, open state and the session record still come from the hook.
  const { windowRef, entry, zIndex, update, setOpen, bringToFront } =
    useWindowFrame(windowId, { minWidth: MIN_WIDTH, minHeight, locked: true });
  const open = controlledOpen ?? entry.open;

  const applyWidth = useCallback(
    (next: number) => {
      if (onWidthChange) onWidthChange(next);
      else setInternalWidth(next);
    },
    [onWidthChange],
  );

  // Refs keep the pointer listeners registered once: re-subscribing on every
  // width change would drop the gesture mid-drag.
  const latest = useRef({ applyWidth, update });
  latest.current = { applyWidth, update };
  /** Last width the live gesture produced, read when the pointer is released. */
  const committedWidth = useRef(displayWidth);
  if (!resizing.current) committedWidth.current = displayWidth;

  useEffect(() => {
    if (controlledOpen !== undefined) setOpen(controlledOpen);
  }, [controlledOpen, setOpen]);

  // `onOpenChange` is usually an inline handler, so it changes identity on every
  // parent render. Firing on the open value alone keeps this to real changes,
  // and the void return keeps React from treating a handler's result as cleanup.
  const openChangeRef = useRef(onOpenChange);
  openChangeRef.current = onOpenChange;
  useEffect(() => {
    openChangeRef.current?.(open);
  }, [open]);

  // A record written before the aside was docked can carry an x/y/height that
  // nothing reads any more. Clearing it keeps the stored window honest. This is
  // idempotent and self terminating: the write lands once, then the guard holds.
  useEffect(() => {
    if (entry.x === 0 && entry.y === 0 && entry.height === 0) return;
    update({ x: 0, y: 0, height: 0 });
  }, [entry.x, entry.y, entry.height, update]);

  // The stored session arrives after the first render, so this waits for a real
  // width instead of burning its guard on the pre hydration zero.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || entry.width <= 0) return;
    restored.current = true;
    latest.current.applyWidth(clampWidth(entry.width));
  }, [entry.width]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const gesture = resizing.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      // Measure from the panel's own right edge rather than the viewport's, so
      // a `placementStyle` that insets the dock cannot skew the width.
      const nextWidth = clampWidth(gesture.right - event.clientX);
      committedWidth.current = nextWidth;
      latest.current.applyWidth(nextWidth);
    };
    const stop = (event: PointerEvent) => {
      const gesture = resizing.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      resizing.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // Commit so a reload restores what the gesture just painted. The width
      // comes from the gesture rather than from render state, which a
      // continuous pointermove may not have flushed yet.
      latest.current.update({ width: committedWidth.current });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    // Without these a cancelled gesture leaves the panel resizing on a bare
    // cursor with no button held.
    window.addEventListener("pointercancel", stop);
    window.addEventListener("lostpointercapture", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("lostpointercapture", stop);
    };
  }, []);

  const nudgeWidth = (delta: number) => {
    const nextWidth = clampWidth(displayWidth + delta);
    applyWidth(nextWidth);
    update({ width: nextWidth });
  };

  return (
    <>
      {/* `showCollapsedButton` gates only the built-in launcher, never the rail
          itself: a caller that supplies its own launchers through
          `collapsedActions` still needs somewhere to put them. */}
      {!open && (showCollapsedButton || collapsedActions) && (
        <div className="mini-platform-rail">
          {showCollapsedButton && (
            <MiniPlatformRailButton
              label={collapsedLabel}
              icon={collapsedIcon}
              ariaLabel={`Open ${ariaLabel}`}
              onClick={() => {
                setOpen(true);
                onOpenChange?.(true);
              }}
            />
          )}
          {collapsedActions}
        </div>
      )}
      <div
        className="assistant-aside-layer pointer-events-none fixed inset-0"
        style={{ zIndex }}
      >
        <AnimatePresence>
          {open && (
            <motion.aside
              ref={windowRef}
              className="assistant-aside pointer-events-auto absolute inset-y-0 right-0 flex w-[min(400px,100vw)] flex-col overflow-hidden"
              style={{
                ...placementStyle,
                width: `min(${displayWidth}px, 100vw)`,
              }}
              onPointerDownCapture={bringToFront}
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -10 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              role="dialog"
              aria-label={ariaLabel}
            >
              <div
                className="assistant-aside-resize liquid-window-resize"
                role="separator"
                aria-label={`Resize ${ariaLabel}`}
                aria-orientation="vertical"
                aria-valuemin={MIN_WIDTH}
                aria-valuemax={MAX_WIDTH}
                aria-valuenow={displayWidth}
                tabIndex={0}
                onPointerDown={(event) => {
                  const panel = windowRef.current;
                  if (!panel || event.button !== 0) return;
                  event.preventDefault();
                  resizing.current = {
                    pointerId: event.pointerId,
                    // offsetLeft/offsetWidth are layout values: unlike
                    // getBoundingClientRect they ignore the entrance transform
                    // that may still be running. The offset parent is the
                    // `fixed inset-0` layer, so this is already viewport space.
                    right: panel.offsetLeft + panel.offsetWidth,
                  };
                  document.body.style.cursor = "ew-resize";
                  document.body.style.userSelect = "none";
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  event.preventDefault();
                  nudgeWidth(event.key === "ArrowLeft" ? 20 : -20);
                }}
              />
              <header className="assistant-aside-header">
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={panelKey ?? "aside-panel"}
                    className="assistant-aside-header-content"
                    initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduceMotion ? undefined : { opacity: 0, x: -6 }}
                    transition={
                      reduceMotion
                        ? { duration: 0 }
                        : { duration: 0.16, ease: "easeOut" }
                    }
                  >
                    <div className="min-w-0">
                      <span className="shop-platform-eyebrow">{eyebrow}</span>
                      <h2>{title}</h2>
                    </div>
                    {headerActions}
                  </motion.div>
                </AnimatePresence>
                <button
                  type="button"
                  className="assistant-aside-close"
                  onClick={() => {
                    setOpen(false);
                    onOpenChange?.(false);
                  }}
                  aria-label={`Collapse ${ariaLabel}`}
                >
                  <Icon name="chevron-right" className="h-4 w-4" />
                </button>
              </header>
              {(toolbar || status) && (
                <div className="assistant-aside-meta">
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={panelKey ?? "aside-status"}
                      className="assistant-aside-status-content"
                      initial={reduceMotion ? false : { opacity: 0, y: -3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: 3 }}
                      transition={
                        reduceMotion
                          ? { duration: 0 }
                          : { duration: 0.14, ease: "easeOut" }
                      }
                    >
                      {status}
                    </motion.div>
                  </AnimatePresence>
                  {toolbar}
                </div>
              )}
              {children}
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

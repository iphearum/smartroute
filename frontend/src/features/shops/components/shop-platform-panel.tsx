"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Place } from "@/features/routes/domain/types";
import { routesApi } from "@/features/routes/api/routes-api";
import { Icon } from "@/shared/ui/icon";
import { useWindowFrame } from "@/shared/hooks/use-window-frame";
import { WindowResizeHandles } from "@/shared/ui/window-resize-handles";
import { isShopPlace } from "../lib/shop-place";
import {
  ShopPlatformContent,
  type ShopFilter,
} from "./shop-platform-content";

type AnchorRect = { left: number; top: number; width: number; height: number };

export function ShopPlatformPanel() {
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<ShopFilter>("all"),
    [places, setPlaces] = useState<Place[]>([]),
    [loading, setLoading] = useState(false),
    [anchor, setAnchor] = useState<AnchorRect | null>(null),
    boundsRef = useRef<HTMLDivElement>(null);
  const {
    windowRef,
    entry,
    zIndex,
    frameStyle,
    sized,
    dragHandleProps,
    resizeHandleProps,
    update,
    setOpen,
    bringToFront,
  } = useWindowFrame("shop-platform-window", { minHeight: 280 });
  const open = entry.open,
    maximized = entry.maximized;

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<Place | { anchor?: AnchorRect }>)
        .detail;
      const place = detail && "latitude" in detail ? detail : null;
      setOpen(true);
      setAnchor(detail && "anchor" in detail ? detail.anchor || null : null);
      update({ maximized: false });
      if (place && isShopPlace(place)) setPlaces([place]);
    };
    window.addEventListener("smartroute:open-shop-platform", show);
    return () =>
      window.removeEventListener("smartroute:open-shop-platform", show);
  }, [setOpen, update]);

  useEffect(() => {
    if (!open) return;
    const value = query.trim();
    let cancelled = false;
    setLoading(true);
    const request =
      value.length >= 2
        ? routesApi.search(value, 18).then((response) => response.results)
        : routesApi.places(120);
    request
      .then((items) => {
        if (!cancelled) setPlaces(items.filter(isShopPlace));
      })
      .catch(() => {
        if (!cancelled) setPlaces([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, query]);

  const openPlace = (place: Place) => {
    window.dispatchEvent(
      new CustomEvent("smartroute:open-place-detail", { detail: place }),
    );
    setOpen(false);
  };
  const anchoredStyle =
    anchor && !maximized
      ? (() => {
          const width = 380;
          const height = Math.min(window.innerHeight - 24, 560);
          const left = Math.max(
            12,
            Math.min(
              anchor.left + anchor.width - width,
              window.innerWidth - width - 12,
            ),
          );
          const below = anchor.top + anchor.height + 12;
          const top =
            below + height <= window.innerHeight - 12
              ? below
              : Math.max(12, anchor.top - height - 12);
          return { left, top, right: "auto" };
        })()
      : undefined;
  const compactViewport =
    typeof window !== "undefined" && window.innerWidth <= 640;
  const windowStyle =
    !maximized && !compactViewport
      ? (frameStyle ?? anchoredStyle)
      : anchoredStyle;

  return (
    <div
      ref={boundsRef}
      className="place-detail-bounds pointer-events-none fixed inset-0"
      style={{ zIndex }}
    >
      <AnimatePresence>
        {open && (
          <motion.section
            className="place-detail-shell resizable-liquid-window shop-platform-shell liquid-card liquid-popover pointer-events-auto absolute top-3.5 right-3.5 w-[380px] overflow-hidden rounded-[28px]"
            style={
              maximized
                ? {
                    width: "min(760px, calc(100vw - 24px))",
                    height: "min(760px, calc(100dvh - 24px))",
                    left: "auto",
                    top: 12,
                    right: 12,
                  }
                : windowStyle
            }
            onPointerDownCapture={bringToFront}
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            data-sized={
              maximized || (sized && !compactViewport) ? "true" : undefined
            }
            role="dialog"
            aria-label="Shop platform"
            ref={windowRef}
          >
            <WindowResizeHandles
              handleProps={resizeHandleProps}
              hidden={maximized || compactViewport}
            />
            <div
              className="place-detail-draghandle"
              {...dragHandleProps}
              aria-hidden="true"
            >
              <span />
            </div>
            <div className="window-controls">
              <button
                type="button"
                className="shop-platform-window-toggle"
                onClick={() => update({ maximized: !maximized })}
                aria-label={
                  maximized ? "Restore shop platform" : "Maximize shop platform"
                }
              >
                <Icon
                  name={maximized ? "minimize" : "maximize"}
                  className="h-4 w-4"
                />
              </button>
              <button
                type="button"
                className="place-detail-close"
                onClick={() => setOpen(false)}
                aria-label="Close shop platform"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="shop-platform-heading" {...dragHandleProps}>
              <span className="shop-platform-eyebrow">MINI PLATFORM</span>
              <h2>Shops, restaurants & stores</h2>
              <p>Explore places on the map and open their details.</p>
            </div>
            <ShopPlatformContent
              query={query}
              onQueryChange={setQuery}
              filter={filter}
              onFilterChange={setFilter}
              places={places}
              loading={loading}
              onPlaceSelect={openPlace}
            />
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

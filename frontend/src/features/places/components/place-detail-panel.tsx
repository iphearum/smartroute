"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { useRouteStore } from "@/features/routes/store/route-store";
import type { Place } from "@/features/routes/domain/types";
import { Icon } from "@/shared/ui/icon";
import { useWindowFrame } from "@/shared/hooks/use-window-frame";
import { WindowResizeHandles } from "@/shared/ui/window-resize-handles";
import { usePoiThemes } from "../hooks/use-poi-themes";
import { poiImageUrl } from "./poi-preview-card";
import { isShopPlace } from "@/features/shops/lib/shop-place";

const infoRows: {
  key: string;
  label: string;
  icon: "pin" | "phone" | "globe" | "clock";
  href?: (value: string) => string;
}[] = [
  { key: "phone", label: "Phone", icon: "phone", href: (v) => `tel:${v}` },
  { key: "website", label: "Website", icon: "globe" },
  { key: "opening_hours", label: "Open hours", icon: "clock" },
];

function isPlace(value: unknown): value is Place {
  if (!value || typeof value !== "object") return false;
  const place = value as Partial<Place>;
  return (
    typeof place.name === "string" &&
    Number.isFinite(place.latitude) &&
    Number.isFinite(place.longitude)
  );
}

export function PlaceDetailPanel() {
  const [place, setPlace] = useState<Place | null>(null),
    [saved, setSaved] = useState(false);
  const { classify, iconMarkup } = usePoiThemes();
  const { calculatePoint } = useRouteCalculation();
  const boundsRef = useRef<HTMLDivElement>(null);
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
  } = useWindowFrame("place-detail-window", { locked: false });
  const maximized = entry.maximized;

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<Place>).detail;
      setPlace(detail);
      setSaved(false);
      setOpen(true, detail);
      update({ maximized: false });
    };
    window.addEventListener("smartroute:open-place-detail", open);
    return () =>
      window.removeEventListener("smartroute:open-place-detail", open);
  }, [setOpen, update]);

  // Restore the window the session was left in: the place itself is stored so
  // the card can come back without another map interaction.
  useEffect(() => {
    setPlace((current) => {
      if (current || !entry.open || !isPlace(entry.payload)) return current;
      return entry.payload;
    });
  }, [entry.open, entry.payload]);

  const close = () => {
    setPlace(null);
    setOpen(false);
  };

  const metadata = place?.metadata || {},
    theme = place ? classify(place) : null,
    image = place ? poiImageUrl(metadata) : null,
    website =
      typeof metadata.website === "string" ? metadata.website : undefined,
    phone = typeof metadata.phone === "string" ? metadata.phone : undefined,
    hours =
      typeof metadata.opening_hours === "string"
        ? metadata.opening_hours
        : undefined;
  const values: Record<string, string | undefined> = {
    phone,
    website,
    opening_hours: hours,
  };
  const rows = infoRows.filter((row) => values[row.key]);
  const windowStyle = maximized
    ? {
        width: "min(760px, calc(100vw - 24px))",
        height: "min(760px, calc(100dvh - 24px))",
        left: "auto",
        top: 12,
        right: 12,
      }
    : frameStyle;

  return (
    <div
      ref={boundsRef}
      className="place-detail-bounds pointer-events-none fixed inset-0"
      style={{ zIndex }}
    >
      <AnimatePresence>
        {place && (
          <motion.section
            className={`place-detail-shell resizable-liquid-window liquid-card liquid-popover pointer-events-auto absolute top-3.5 right-3.5 w-[340px] overflow-hidden rounded-[28px] ${theme ? `poi-${theme.key}` : ""}`}
            style={windowStyle}
            onPointerDownCapture={bringToFront}
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            ref={windowRef}
            data-sized={maximized || sized ? "true" : undefined}
            role="dialog"
            aria-modal="false"
            aria-label="Place details"
          >
            <WindowResizeHandles
              handleProps={resizeHandleProps}
              hidden={maximized}
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
                onClick={() => setSaved((current) => !current)}
                aria-pressed={saved}
                aria-label={
                  saved
                    ? `Remove ${place.name} from saved places`
                    : `Save ${place.name}`
                }
                className="place-detail-save"
              >
                <Icon name="heart" className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="place-detail-window-toggle"
                onClick={() => update({ maximized: !maximized })}
                aria-label={
                  maximized ? "Restore place details" : "Maximize place details"
                }
              >
                <Icon
                  name={maximized ? "minimize" : "maximize"}
                  className="h-4 w-4"
                />
              </button>
              <button
                onClick={close}
                className="place-detail-close"
                aria-label="Close details"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="liquid-window-scroll">
              <div className="place-detail-media" {...dragHandleProps}>
                {image ? (
                  <img
                    src={image}
                    alt={`Photo of ${place.name}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="place-detail-image"
                  />
                ) : (
                  <div
                    className="place-detail-fallback"
                    dangerouslySetInnerHTML={{
                      __html: theme ? iconMarkup(theme) : "",
                    }}
                  />
                )}
              </div>
              <div className="place-detail-body">
                <h2 className="place-detail-title">{place.name}</h2>
                <p className="place-detail-category">
                  {(place.category || theme?.label || "Place").replaceAll(
                    "_",
                    " ",
                  )}
                </p>
                {isShopPlace(place) && (
                  <button
                    type="button"
                    className="place-detail-platform-button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("smartroute:open-shop-platform", {
                          detail: place,
                        }),
                      );
                      close();
                    }}
                  >
                    <Icon name="box" className="h-3.5 w-3.5" /> Open in shop
                    platform
                  </button>
                )}

                <p className="place-detail-heading">Overview</p>
                <p className="place-detail-overview">
                  {place.address
                    ? `Located at ${place.address}.`
                    : `A ${(place.category || theme?.label || "place").replaceAll("_", " ")} on the map.`}
                </p>

                <p className="place-detail-heading">Information</p>
                <dl className="place-detail-info">
                  {place.address && (
                    <div className="place-detail-info-row">
                      <dt>
                        <Icon name="pin" className="h-4 w-4" />
                      </dt>
                      <dd>{place.address}</dd>
                    </div>
                  )}
                  {rows.map((row) => {
                    const value = values[row.key]!;
                    return (
                      <div className="place-detail-info-row" key={row.key}>
                        <dt>
                          <Icon name={row.icon} className="h-4 w-4" />
                        </dt>
                        <dd>
                          {row.href ? (
                            <a href={row.href(value)}>{value}</a>
                          ) : (
                            value
                          )}
                        </dd>
                      </div>
                    );
                  })}
                  {!place.address && !rows.length && (
                    <p className="place-detail-empty">
                      No further details for this place yet.
                    </p>
                  )}
                </dl>

                <p className="place-detail-heading">Reviews</p>
                <p className="place-detail-empty">No reviews yet.</p>

                <button
                  className="place-detail-add"
                  onClick={() => {
                    const activePoint = useRouteStore.getState().activePoint;
                    void calculatePoint(
                      activePoint,
                      [place.latitude, place.longitude],
                      place,
                    );
                    close();
                  }}
                >
                  ＋ Add stop
                </button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

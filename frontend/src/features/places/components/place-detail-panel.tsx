"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { useRouteStore } from "@/features/routes/store/route-store";
import type { Place } from "@/features/routes/domain/types";
import { Icon } from "@/shared/ui/icon";
import { usePoiThemes } from "../hooks/use-poi-themes";
import { poiImageUrl } from "./poi-preview-card";

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

export function PlaceDetailPanel() {
  const [place, setPlace] = useState<Place | null>(null),
    [saved, setSaved] = useState(false);
  const { classify, iconMarkup } = usePoiThemes();
  const { calculatePoint } = useRouteCalculation();
  const dragControls = useDragControls();
  const boundsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const open = (event: Event) => {
      setPlace((event as CustomEvent<Place>).detail);
      setSaved(false);
    };
    window.addEventListener("smartroute:open-place-detail", open);
    return () =>
      window.removeEventListener("smartroute:open-place-detail", open);
  }, []);

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

  return (
    <div
      ref={boundsRef}
      className="place-detail-bounds pointer-events-none fixed inset-0 z-[1200]"
    >
      <AnimatePresence>
        {place && (
          <motion.section
            className={`place-detail-shell liquid-card liquid-popover pointer-events-auto absolute top-3.5 right-3.5 w-[340px] overflow-hidden rounded-[28px] ${theme ? `poi-${theme.key}` : ""}`}
            drag
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={boundsRef}
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            role="dialog"
            aria-modal="false"
            aria-label="Place details"
          >
            <div
              className="place-detail-draghandle"
              onPointerDown={(event) => dragControls.start(event)}
              aria-hidden="true"
            >
              <span />
            </div>
            <div className="place-detail-media">
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
              <button
                onClick={() => setPlace(null)}
                className="place-detail-close"
                aria-label="Close details"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
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
            </div>
            <div className="place-detail-body">
              <h2 className="place-detail-title">{place.name}</h2>
              <p className="place-detail-category">
                {(place.category || theme?.label || "Place").replaceAll(
                  "_",
                  " ",
                )}
              </p>

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
                  setPlace(null);
                }}
              >
                ＋ Add stop
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

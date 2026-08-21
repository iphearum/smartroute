"use client";

import { useRouteStore } from "@/features/routes/store/route-store";
import { useI18n } from "@/features/i18n/use-i18n";
import { Icon } from "@/shared/ui/icon";

const formatDistance = (metres: number) =>
  metres >= 1000
    ? `${(metres / 1000).toFixed(1)} km`
    : `${Math.max(0, Math.round(metres))} m`;

export function AssistantContextBar() {
  const t = useI18n();
  const points = useRouteStore((state) => state.points);
  const status = useRouteStore((state) => state.status);
  const route = useRouteStore((state) => state.routes[state.selectedRoute]);
  const stopCount = points.filter(Boolean).length;
  const routeReady = status === "ready" && Boolean(route);

  if (!stopCount && !route) return null;

  const dispatch = (name: string) =>
    window.dispatchEvent(new CustomEvent(name));

  return (
    <section
      className="assistant-context-bar"
      aria-label={t("assistant.context", "Map context")}
      aria-live="polite"
    >
      <span className="assistant-context-icon" aria-hidden="true">
        <Icon name="directions" className="h-4 w-4" />
      </span>
      <div className="assistant-context-copy">
        <strong>
          {routeReady
            ? t("assistant.routeActive", "Route active")
            : status === "calculating"
              ? t("assistant.routeCalculating", "Calculating route…")
              : stopCount
                ? t("assistant.routePlanning", "Planning route")
                : t("assistant.ready", "Ready to explore")}
        </strong>
        {routeReady ? (
          <span>
            {stopCount} {t("assistant.stops", "stops")} ·{" "}
            {formatDistance(route.length)} ·{" "}
            {Math.max(1, Math.round(route.duration / 60))}{" "}
            {t("assistant.minutes", "min")}
          </span>
        ) : stopCount ? (
          <span>
            {stopCount} {t("assistant.stopsAdded", "stops added")}
          </span>
        ) : null}
      </div>
      {routeReady && (
        <div className="assistant-context-actions">
          <button
            type="button"
            onClick={() => dispatch("smartroute:focus-selected-route")}
          >
            <Icon name="maximize" className="h-3.5 w-3.5" />
            {t("assistant.focus", "Focus")}
          </button>
          <button
            type="button"
            onClick={() => dispatch("smartroute:clear-route-points")}
          >
            {t("assistant.clear", "Clear")}
          </button>
        </div>
      )}
    </section>
  );
}

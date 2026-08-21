"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { useAppShell } from "@/shared/state/app-shell-context";
import { Icon } from "@/shared/ui/icon";
import { BottomSheet } from "@/shared/ui/bottom-sheet";

type MapTool = "clear" | "focus" | "reset";

export function MapToolsMenu({
  hasRoute,
  hasPoints,
  onAction,
  onClearRequested,
}: {
  hasRoute: boolean;
  hasPoints: boolean;
  onAction: (tool: MapTool) => void;
  onClearRequested?: () => void;
}) {
  const t = useI18n();
  const openBottomSheet = useAppShell((state) => state.openBottomSheet);
  const tools: Array<{
    id: MapTool;
    icon: "close" | "maximize" | "locate";
    label: string;
    disabled?: boolean;
  }> = [
    {
      id: "clear",
      icon: "close",
      label: t("map.tools.clearRoute", "Clear route"),
      disabled: !hasPoints,
    },
    {
      id: "focus",
      icon: "maximize",
      label: t("map.tools.focusRoute", "Focus route"),
      disabled: !hasRoute,
    },
    {
      id: "reset",
      icon: "locate",
      label: t("map.tools.resetView", "Reset map view"),
    },
  ];

  return (
    <>
      <div className="map-tools-menu liquid-popover" role="menu">
        <p className="map-tools-menu-title">
          {t("map.tools.title", "Map tools")}
        </p>
        {tools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            role="menuitem"
            disabled={tool.disabled}
            onClick={() => {
              if (tool.id === "clear") {
                onClearRequested?.();
                openBottomSheet({
                  id: "clear-route-confirmation",
                  title: t("map.tools.confirmTitle", "Clear route?"),
                });
                return;
              }
              onAction(tool.id);
            }}
          >
            <Icon name={tool.icon} className="h-4 w-4" />
            <span>{tool.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function ClearRouteBottomSheet({ onConfirm }: { onConfirm: () => void }) {
  const t = useI18n();
  const closeBottomSheet = useAppShell((state) => state.closeBottomSheet);

  return (
    <BottomSheet
      id="clear-route-confirmation"
      title={t("map.tools.confirmTitle", "Clear route?")}
      role="alertdialog"
      ariaLabelledBy="map-clear-confirmation-title"
      ariaDescribedBy="map-clear-confirmation-description"
      className="map-clear-confirmation"
    >
      <section
        className="map-clear-confirmation-content"
        aria-labelledby="map-clear-confirmation-title"
        aria-describedby="map-clear-confirmation-description"
      >
        <div className="map-clear-confirmation-icon">
          <Icon name="alert" className="h-5 w-5" />
        </div>
        <div className="map-clear-confirmation-copy">
          <h2 id="map-clear-confirmation-title">
            {t("map.tools.confirmTitle", "Clear route?")}
          </h2>
          <p id="map-clear-confirmation-description">
            {t(
              "map.tools.confirmDescription",
              "This will remove all route points and directions.",
            )}
          </p>
        </div>
        <div className="map-clear-confirmation-actions flex-col">
          <button
            type="button"
            className="map-clear-confirmation-confirm"
            onClick={() => {
              closeBottomSheet("clear-route-confirmation");
              onConfirm();
            }}
          >
            {t("map.tools.confirmAction", "Clear route")}
          </button>
          <button
            type="button"
            className="map-clear-confirmation-cancel"
            onClick={() => closeBottomSheet("clear-route-confirmation")}
          >
            {t("common.cancel", "Cancel")}
          </button>
        </div>
      </section>
    </BottomSheet>
  );
}

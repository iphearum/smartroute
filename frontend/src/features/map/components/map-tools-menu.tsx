"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { Icon } from "@/shared/ui/icon";

type MapTool = "clear" | "focus" | "reset";

export function MapToolsMenu({
  hasRoute,
  hasPoints,
  onAction,
}: {
  hasRoute: boolean;
  hasPoints: boolean;
  onAction: (tool: MapTool) => void;
}) {
  const t = useI18n();
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
            if (
              tool.id === "clear" &&
              !window.confirm(
                t("map.tools.confirmClear", "Clear the current route?"),
              )
            )
              return;
            onAction(tool.id);
          }}
        >
          <Icon name={tool.icon} className="h-4 w-4" />
          <span>{tool.label}</span>
        </button>
      ))}
    </div>
  );
}

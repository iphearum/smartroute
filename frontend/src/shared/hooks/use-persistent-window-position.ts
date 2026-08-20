"use client";

import { useCallback } from "react";
import { useLocalStore } from "./use-local-store";

export type WindowPosition = {
  version: 1;
  x: number;
  y: number;
};

const DEFAULT_POSITION: WindowPosition = { version: 1, x: 0, y: 0 };

function isWindowPosition(value: unknown): value is WindowPosition {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<WindowPosition>;
  return item.version === 1 && Number.isFinite(item.x) && Number.isFinite(item.y);
}

export function usePersistentWindowPosition(key: string) {
  const validate = useCallback(isWindowPosition, []);
  const [position, setPosition] = useLocalStore(
    `smartroute-window-position:${key}`,
    DEFAULT_POSITION,
    validate,
  );
  return [position, setPosition] as const;
}

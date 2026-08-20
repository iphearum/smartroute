"use client";

import { useCallback, useSyncExternalStore } from "react";

export type WindowSessionEntry = {
  /** Left/top for pointer positioned windows, translate offset for framer ones. */
  x: number;
  y: number;
  /** 0 means "not resized yet": the window keeps its CSS size. */
  width: number;
  height: number;
  open: boolean;
  maximized: boolean;
  /** Monotonic touch counter; the highest value renders on top. */
  order: number;
  /** Optional payload a window needs to restore its content (e.g. a place). */
  payload?: unknown;
};

type SessionRecord = {
  version: 3;
  windows: Record<string, WindowSessionEntry>;
};

const STORAGE_KEY = "smartroute-window-session",
  BASE_Z_INDEX = 1100,
  Z_STEP = 10;

export const EMPTY_ENTRY: WindowSessionEntry = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  open: false,
  maximized: false,
  order: 0,
};

const EMPTY_RECORD: SessionRecord = { version: 3, windows: {} };

let record: SessionRecord = EMPTY_RECORD,
  loaded = false;
const listeners = new Set<() => void>();

function isEntry(value: unknown): value is WindowSessionEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<WindowSessionEntry>;
  return (
    Number.isFinite(entry.x) &&
    Number.isFinite(entry.y) &&
    Number.isFinite(entry.width) &&
    Number.isFinite(entry.height) &&
    Number.isFinite(entry.order) &&
    typeof entry.open === "boolean" &&
    typeof entry.maximized === "boolean"
  );
}

function isSessionRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const parsed = value as Partial<SessionRecord>;
  if (parsed.version !== 3 || !parsed.windows) return false;
  return Object.values(parsed.windows).every(isEntry);
}

function publish(next: SessionRecord) {
  record = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((listener) => listener());
}

/**
 * Restores the stored session on the first subscription. Subscriptions happen
 * after the first render, so the server and the initial client render both see
 * the empty record and hydration stays stable.
 */
function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (raw && !isSessionRecord(parsed)) localStorage.removeItem(STORAGE_KEY);
    else if (isSessionRecord(parsed)) record = parsed;
  } catch {}
  // Always hand out a fresh identity so subscribers re-render and observe
  // `hydrated`, even when there was nothing stored to restore.
  record = { ...record };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  load();
  return () => {
    listeners.delete(listener);
  };
}

function entryOf(id: string) {
  return record.windows[id] ?? EMPTY_ENTRY;
}

function writeEntry(id: string, patch: Partial<WindowSessionEntry>) {
  const current = entryOf(id),
    next = { ...current, ...patch };
  if (
    (Object.keys(patch) as (keyof WindowSessionEntry)[]).every(
      (key) => current[key] === next[key],
    )
  )
    return;
  publish({ ...record, windows: { ...record.windows, [id]: next } });
}

function topOrder() {
  return Object.values(record.windows).reduce(
    (highest, entry) => Math.max(highest, entry.order),
    0,
  );
}

/**
 * One shared, persisted record of every floating window: geometry, open and
 * maximized state, and the stacking order. Reloading the page restores it.
 */
export function useWindowSession(id: string) {
  const session = useSyncExternalStore(
    subscribe,
    () => record,
    () => EMPTY_RECORD,
  );
  const entry = session.windows[id] ?? EMPTY_ENTRY;

  const update = useCallback(
    (patch: Partial<WindowSessionEntry>) => writeEntry(id, patch),
    [id],
  );
  const bringToFront = useCallback(() => {
    if (entryOf(id).order === topOrder() && entryOf(id).order > 0) return;
    writeEntry(id, { order: topOrder() + 1 });
  }, [id]);
  const setOpen = useCallback(
    (open: boolean, payload?: unknown) => {
      writeEntry(id, {
        open,
        ...(payload === undefined ? {} : { payload }),
        ...(open ? { order: topOrder() + 1 } : {}),
      });
    },
    [id],
  );

  // Stacking is ranked inside the open windows so the z-indexes stay in a
  // fixed band instead of climbing with every touch.
  const rank = Object.entries(session.windows)
    .filter(([, item]) => item.open)
    .sort((first, second) => first[1].order - second[1].order)
    .findIndex(([key]) => key === id);

  return {
    entry,
    /** False until the stored session has been read; guards restore effects. */
    hydrated: loaded,
    update,
    setOpen,
    bringToFront,
    zIndex: BASE_Z_INDEX + Math.max(rank, 0) * Z_STEP,
    focused:
      rank >= 0 &&
      rank ===
        Object.values(session.windows).filter((item) => item.open).length - 1,
  };
}

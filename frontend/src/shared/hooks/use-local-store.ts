"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";

type Entry = {
  raw: string | null;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

function entryFor(key: string) {
  let entry = entries.get(key);
  if (!entry) {
    entry = { raw: null, listeners: new Set() };
    entries.set(key, entry);
  }
  return entry;
}

function publish(key: string, raw: string) {
  const entry = entryFor(key);
  if (entry.raw === raw) return;
  entry.raw = raw;
  entry.listeners.forEach((listener) => listener());
}

export function useLocalStore<T>(
  key: string,
  defaultValue: T,
  validate: (value: unknown) => value is T,
): [T, Dispatch<SetStateAction<T>>] {
  const defaultRaw = useMemo(
    () => JSON.stringify(defaultValue),
    [defaultValue],
  );
  const subscribe = useCallback(
    (listener: () => void) => {
      const entry = entryFor(key);
      entry.listeners.add(listener);
      const receiveStorage = (event: StorageEvent) => {
        if (event.storageArea === localStorage && event.key === key)
          publish(key, event.newValue ?? defaultRaw);
      };
      window.addEventListener("storage", receiveStorage);
      return () => {
        entry.listeners.delete(listener);
        window.removeEventListener("storage", receiveStorage);
      };
    },
    [defaultRaw, key],
  );
  const getSnapshot = useCallback(
    () => entryFor(key).raw ?? defaultRaw,
    [defaultRaw, key],
  );
  const raw = useSyncExternalStore(subscribe, getSnapshot, () => defaultRaw);

  useEffect(() => {
    let nextRaw = defaultRaw;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed: unknown = JSON.parse(stored);
        if (validate(parsed)) nextRaw = stored;
        else localStorage.setItem(key, defaultRaw);
      } else localStorage.setItem(key, defaultRaw);
    } catch {
      try {
        localStorage.setItem(key, defaultRaw);
      } catch {}
    }
    publish(key, nextRaw);
  }, [defaultRaw, key, validate]);

  const value = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(raw);
      return validate(parsed) ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  }, [defaultValue, raw, validate]);

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const currentRaw = entryFor(key).raw ?? defaultRaw;
      let current = defaultValue;
      try {
        const parsed: unknown = JSON.parse(currentRaw);
        if (validate(parsed)) current = parsed;
      } catch {}
      const value =
          typeof next === "function"
            ? (next as (previous: T) => T)(current)
            : next,
        nextRaw = JSON.stringify(value);
      try {
        localStorage.setItem(key, nextRaw);
      } catch {}
      publish(key, nextRaw);
    },
    [defaultRaw, defaultValue, key, validate],
  );

  return [value, setValue];
}

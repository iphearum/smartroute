"use client";

import { useEffect, useState } from "react";
import { useAppShell } from "@/shared/state/app-shell-context";

type Messages = Record<string, unknown>;
const cache = new Map<string, Messages>();

function lookup(messages: Messages, key: string): unknown {
  return key.split(".").reduce<unknown>((value, part) => {
    return value && typeof value === "object"
      ? (value as Messages)[part]
      : undefined;
  }, messages);
}

export function useI18n() {
  const language = useAppShell((state) => state.language);
  const [messages, setMessages] = useState<Messages>(
    () => cache.get("en") ?? {},
  );

  useEffect(() => {
    let cancelled = false;
    const cached = cache.get(language);
    if (cached) {
      setMessages(cached);
      return;
    }
    fetch(`/lang/${language}.json`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((value: Messages) => {
        cache.set(language, value);
        if (!cancelled) setMessages(value);
      })
      .catch(() => {
        if (!cancelled && language !== "en") {
          setMessages(cache.get("en") ?? {});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  return (key: string, fallback = key) => {
    const value = lookup(messages, key);
    return typeof value === "string" ? value : fallback;
  };
}

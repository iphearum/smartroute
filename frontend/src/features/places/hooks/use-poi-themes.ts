"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Place } from "@/features/routes/domain/types";
import { poiThemesApi } from "../api/poi-themes-api";
import { FALLBACK_POI_THEMES, iconMarkup, type PoiTheme } from "../domain/poi-theme";

function classifyValue(place: Place) {
  return `${String(place.metadata?.category_group || "")} ${place.category || ""}`.toLowerCase();
}

export function usePoiThemes() {
  const [themes, setThemes] = useState<PoiTheme[]>(FALLBACK_POI_THEMES);

  useEffect(() => {
    let active = true;
    poiThemesApi
      .list()
      .then((rows) => {
        if (active && rows.length) setThemes(rows);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const compiled = useMemo(
    () =>
      themes.map((theme) => ({
        theme,
        regex: theme.keywords.length ? new RegExp(theme.keywords.join("|")) : null,
      })),
    [themes],
  );
  // "place" is the catch-all (empty keywords, so it never wins the regex
  // loop below) -- looked up by key rather than array position since its
  // match_order doesn't have to be last (new themes can be appended after
  // it without becoming the accidental fallback).
  const fallbackTheme =
    themes.find((theme) => theme.key === "place") ?? themes[themes.length - 1];
  const priorityByKey = useMemo(
    () => new Map(themes.map((theme) => [theme.key, theme.priority])),
    [themes],
  );

  const classify = useCallback(
    (place: Place): PoiTheme => {
      const value = classifyValue(place);
      for (const { theme, regex } of compiled) {
        if (regex?.test(value)) return theme;
      }
      return fallbackTheme;
    },
    [compiled, fallbackTheme],
  );

  const priorityFor = useCallback(
    (key: string) => priorityByKey.get(key) ?? themes.length,
    [priorityByKey, themes.length],
  );

  return { themes, classify, priorityFor, iconMarkup };
}

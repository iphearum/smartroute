"use client";
import { useCallback, useEffect, useState } from "react";
import type { Place } from "@/features/routes/domain/types";
const key = "smartroute.recentPlaces.v2";
export function useRecentPlaces() {
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setPlaces(JSON.parse(localStorage.getItem(key) ?? "[]"));
      } catch {}
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const remember = useCallback(
    (place: Place) =>
      setPlaces((current) => {
        const next = [
          place,
          ...current.filter((item) => item.name !== place.name),
        ].slice(0, 5);
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      }),
    [],
  );
  return { places, remember };
}

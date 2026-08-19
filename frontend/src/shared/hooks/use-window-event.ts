"use client";
import { useEffect, type DependencyList } from "react";

export function useWindowEvent(
  type: string,
  handler: (event: Event) => void,
  deps: DependencyList = [],
) {
  useEffect(() => {
    window.addEventListener(type, handler);
    return () => window.removeEventListener(type, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

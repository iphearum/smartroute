"use client";
import { useEffect, useRef } from "react";

// Keeps a ref pointing at the latest value, for long-lived effects/callbacks
// that need a fresh value without being recreated (and re-running their
// effect) every time that value's identity changes.
export function useLatestRef<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

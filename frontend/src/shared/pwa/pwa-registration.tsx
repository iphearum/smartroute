"use client";

import { useEffect } from "react";

export function PwaRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(
            registrations.map((registration) => registration.unregister()),
          ),
        );
      if ("caches" in window)
        void caches
          .keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("psarai-shell-"))
                .map((key) => caches.delete(key)),
            ),
          );
      return;
    }

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The application remains usable online if registration is unavailable.
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

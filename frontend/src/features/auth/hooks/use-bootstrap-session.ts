"use client";
import { useEffect } from "react";
import { useAuthStore } from "../store/auth-store";

export function useBootstrapSession() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
}

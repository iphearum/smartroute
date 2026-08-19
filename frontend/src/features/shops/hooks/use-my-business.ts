"use client";
import { useCallback, useEffect, useState } from "react";
import { commerceApi } from "../api/commerce-api";
import type { Business } from "../domain/commerce-types";

// There is no GET /commerce/businesses?owner_user_id= endpoint yet (see
// docs/shop-management-design.md), so "my business" is whatever ID this
// browser tab last created or claimed -- a convenience cache, not an
// authorization boundary.
const STORAGE_KEY = "smartroute-business-id";

export type MyBusinessStatus = "loading" | "none" | "ready" | "error";

export function useMyBusiness() {
  const [business, setBusiness] = useState<Business | null>(null),
    [status, setStatus] = useState<MyBusinessStatus>("loading"),
    [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const stored =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setBusiness(null);
      setStatus("none");
      return;
    }
    setStatus("loading");
    try {
      const data = await commerceApi.getBusiness(Number(stored));
      setBusiness(data);
      setStatus("ready");
      setError(null);
    } catch (err) {
      window.localStorage.removeItem(STORAGE_KEY);
      setBusiness(null);
      setStatus("none");
      setError(err instanceof Error ? err.message : "Failed to load business");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const claim = useCallback(
    async (businessId: number) => {
      window.localStorage.setItem(STORAGE_KEY, String(businessId));
      await load();
    },
    [load],
  );

  return { business, status, error, refresh: load, claim };
}

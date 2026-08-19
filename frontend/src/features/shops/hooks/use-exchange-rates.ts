"use client";
import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/shared/api/http";
import { commerceApi } from "../api/commerce-api";
import type { ExchangeRateRow } from "../domain/commerce-types";

export function useExchangeRates() {
  const [rates, setRates] = useState<ExchangeRateRow[]>([]),
    [loading, setLoading] = useState(true),
    [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRates(await commerceApi.latestExchangeRates());
    } catch {
      setRates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await commerceApi.refreshExchangeRates();
      await load();
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : "Could not refresh exchange rates";
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const usd = rates.find((rate) => rate.currency === "USD") ?? null;
  const toKhr = (usdAmount: number) =>
    usd ? Math.round(usdAmount * usd.average_rate) : null;

  return { rates, usd, toKhr, loading, refreshing, refresh };
}

"use client";
import { useCallback } from "react";
import { routesApi } from "../api/routes-api";
import type { Coordinate } from "../domain/types";
import { useRouteStore } from "../store/route-store";
export function useRouteCalculation() {
  const setCalculation = useRouteStore((s) => s.setCalculation),
    setStatus = useRouteStore((s) => s.setStatus);
  return useCallback(
    async (coordinates: Coordinate[]) => {
      setStatus("calculating");
      try {
        const { mode, traffic } = useRouteStore.getState(),
          data = await routesApi.calculate(coordinates, mode, traffic);
        setCalculation(data.routes);
      } catch (error) {
        setStatus(
          "error",
          error instanceof Error ? error.message : "Route calculation failed",
        );
      }
    },
    [setCalculation, setStatus],
  );
}

"use client";
import { useCallback } from "react";
import { routesApi } from "../api/routes-api";
import { isNegligibleMove } from "../domain/geo";
import type {
  Coordinate,
  Place,
  RouteOption,
  TrafficProfile,
  TravelMode,
} from "../domain/types";
import { useRouteStore, type LegState } from "../store/route-store";

type LegParams = {
  mode: TravelMode;
  traffic: TrafficProfile;
  allowDestinationAccess: boolean;
};

function mergeGeometry(
  a: RouteOption["geometry"],
  b: RouteOption["geometry"],
) {
  if (!a.length) return [...b];
  if (!b.length) return [...a];
  const last = a[a.length - 1],
    first = b[0];
  return last[0] === first[0] && last[1] === first[1]
    ? [...a, ...b.slice(1)]
    : [...a, ...b];
}

function mergeLegs(legs: LegState[]): RouteOption[] {
  if (legs.length === 0) return [];
  if (legs.length === 1) return legs[0].routes;
  if (legs.some((leg) => leg.status !== "ready" || !leg.routes.length))
    return [];
  const picks = legs.map((leg) => leg.routes[leg.selectedIndex] ?? leg.routes[0]);
  return [
    picks.reduce<RouteOption>(
      (merged, leg) => ({
        rank: 1,
        recommended: true,
        recommendation_reason: "Combined multi-stop route",
        duration: merged.duration + leg.duration,
        length: merged.length + leg.length,
        geometry: mergeGeometry(merged.geometry, leg.geometry),
        connectors: [...(merged.connectors || []), ...(leg.connectors || [])],
        segments: [...(merged.segments || []), ...(leg.segments || [])],
        steps: [...(merged.steps || []), ...(leg.steps || [])],
      }),
      {
        rank: 1,
        recommended: true,
        duration: 0,
        length: 0,
        geometry: [],
        connectors: [],
        segments: [],
        steps: [],
      },
    ),
  ];
}

export function useRouteCalculation() {
  const setStatus = useRouteStore((s) => s.setStatus),
    setLeg = useRouteStore((s) => s.setLeg),
    spliceLegs = useRouteStore((s) => s.spliceLegs);

  const publish = useCallback(() => {
    const { legs } = useRouteStore.getState();
    if (legs.some((leg) => leg.status === "calculating")) {
      setStatus("calculating");
      return;
    }
    const failed = legs.find((leg) => leg.status === "error");
    if (failed) {
      useRouteStore.setState({ routes: [], selectedRoute: 0 });
      setStatus("error", failed.error || "Route calculation failed");
      return;
    }
    useRouteStore.getState().setCalculation(mergeLegs(legs));
  }, [setStatus]);

  const requestLeg = useCallback(
    async (
      index: number,
      from: Coordinate,
      to: Coordinate,
      params: LegParams,
    ) => {
      setLeg(index, { status: "calculating", error: null });
      publish();
      try {
        const data = await routesApi.calculate(
          [from, to],
          params.mode,
          params.traffic,
          params.allowDestinationAccess,
        );
        setLeg(index, {
          status: "ready",
          routes: data.routes,
          selectedIndex: 0,
          error: null,
        });
      } catch (error) {
        setLeg(index, {
          status: "error",
          routes: [],
          error:
            error instanceof Error ? error.message : "Route calculation failed",
        });
      }
      publish();
    },
    [setLeg, publish],
  );

  const calculateAll = useCallback(
    async (coordinates: Coordinate[]) => {
      const legCount = coordinates.length - 1;
      if (legCount < 1) return;
      const { mode, traffic, allowDestinationAccess } =
        useRouteStore.getState();
      useRouteStore.setState({
        legs: Array.from({ length: legCount }, () => ({
          status: "calculating" as const,
          routes: [],
          selectedIndex: 0,
          error: null,
        })),
      });
      setStatus("calculating");
      await Promise.all(
        Array.from({ length: legCount }, (_, index) =>
          requestLeg(index, coordinates[index], coordinates[index + 1], {
            mode,
            traffic,
            allowDestinationAccess,
          }),
        ),
      );
    },
    [requestLeg, setStatus],
  );

  const calculatePoint = useCallback(
    async (index: number, coordinate: Coordinate, place?: Place) => {
      const state = useRouteStore.getState();
      if (isNegligibleMove(state.coordinates[index] ?? null, coordinate))
        return false;
      if (place) state.setPoint(index, place);
      else state.setCoordinate(index, coordinate);
      const coordinates = state.coordinates.map((item, i) =>
        i === index ? coordinate : item,
      );
      if (coordinates.some((item) => item === null)) return true;
      const ready = coordinates as Coordinate[],
        { mode, traffic, allowDestinationAccess } = state,
        affected = [index - 1, index].filter(
          (i) => i >= 0 && i < ready.length - 1,
        );
      if (!affected.length) return true;
      setStatus("calculating");
      await Promise.all(
        affected.map((legIndex) =>
          requestLeg(legIndex, ready[legIndex], ready[legIndex + 1], {
            mode,
            traffic,
            allowDestinationAccess,
          }),
        ),
      );
      return true;
    },
    [requestLeg, setStatus],
  );

  const removePoint = useCallback(
    async (index: number) => {
      const state = useRouteStore.getState(),
        before = state.coordinates[index - 1],
        after = state.coordinates[index + 1];
      state.removeDestination(index);
      if (!before || !after) {
        publish();
        return;
      }
      spliceLegs(index - 1, 0, {
        status: "calculating",
        routes: [],
        selectedIndex: 0,
        error: null,
      });
      setStatus("calculating");
      const { mode, traffic, allowDestinationAccess } =
        useRouteStore.getState();
      await requestLeg(index - 1, before, after, {
        mode,
        traffic,
        allowDestinationAccess,
      });
    },
    [requestLeg, spliceLegs, publish, setStatus],
  );

  return { calculateAll, calculatePoint, removePoint };
}

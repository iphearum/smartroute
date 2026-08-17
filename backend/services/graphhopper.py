"""Client and response adapter for the self-hosted GraphHopper routing service."""

from __future__ import annotations

import math
from typing import Any

import requests


MODE_PROFILES = {
    "car": "car",
    "motorbike": "motorbike",
    "bike": "bike",
    "walk": "foot",
}

ROUTING_ALGORITHM = "astarbi"

SIGN_TYPES = {
    -7: "slight-left",
    -3: "turn-left",
    -2: "turn-left",
    -1: "slight-left",
    0: "continue",
    1: "slight-right",
    2: "turn-right",
    3: "turn-right",
    4: "arrive",
    5: "continue",
    6: "continue",
    7: "slight-right",
}


class GraphHopperError(RuntimeError):
    """Raised when the local GraphHopper service cannot calculate a route."""


class GraphHopperClient:
    def __init__(self, base_url: str, timeout_seconds: float = 30):
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def info(self) -> dict[str, Any]:
        return self._get("/info")

    def nearest(self, latitude: float, longitude: float,
                mode: str = "motorbike") -> dict[str, Any]:
        try:
            profile = MODE_PROFILES[mode]
        except KeyError as exc:
            raise ValueError("Mode must be car, motorbike, bike, or walk") from exc
        payload = self._get("/nearest", params={
            "point": f"{latitude},{longitude}", "profile": profile,
        })
        coordinates = payload.get("coordinates") or []
        if len(coordinates) < 2:
            raise GraphHopperError("GraphHopper returned no nearby routable road")
        snapped_longitude, snapped_latitude = map(float, coordinates[:2])
        return {
            "node_id": None,
            "name": f"{snapped_latitude:.5f}, {snapped_longitude:.5f}",
            "province": "Cambodia",
            "latitude": snapped_latitude,
            "longitude": snapped_longitude,
            "distance": float(payload.get("distance", 0)),
        }

    def route(self, coordinates: list[tuple[float, float]], mode: str = "motorbike",
              traffic: str = "normal", limit: int = 3) -> dict[str, Any]:
        if len(coordinates) < 2:
            raise ValueError("At least two route coordinates are required")
        if mode == "combind":
            return self._combind_routes(coordinates, traffic, limit)
        try:
            profile = MODE_PROFILES[mode]
        except KeyError as exc:
            raise ValueError("Mode must be car, motorbike, bike, walk, or combind") from exc
        if traffic not in {"normal", "heavy"}:
            raise ValueError("Traffic must be normal or heavy")

        routes = self._profile_routes(coordinates, mode, traffic, limit=1)
        return self._response(coordinates, routes, mode)

    def _profile_routes(self, coordinates: list[tuple[float, float]], mode: str,
                        traffic: str, limit: int = 1, alternatives: bool = False):
        profile = MODE_PROFILES[mode]

        params: list[tuple[str, str]] = [
            ("profile", profile),
            ("points_encoded", "false"),
            ("instructions", "true"),
            ("calc_points", "true"),
            ("locale", "en"),
        ]
        params.extend(("point", f"{latitude},{longitude}") for latitude, longitude in coordinates)
        requested_limit = max(1, min(int(limit), 3)) if alternatives else 1
        if alternatives and len(coordinates) == 2:
            params.extend([
                ("algorithm", "alternative_route"),
                ("alternative_route.max_paths", str(requested_limit)),
            ])
        else:
            # GraphHopper alternatives do not support via points, so ordered
            # multi-stop requests retain their A*-optimal profile route.
            requested_limit = 1
            params.append(("algorithm", ROUTING_ALGORITHM))

        payload = self._get("/route", params=params)
        paths = payload.get("paths") or []
        if not paths:
            raise GraphHopperError("GraphHopper returned no connected route")
        return [
            self._route_option(path, rank, mode, traffic)
            for rank, path in enumerate(paths[:requested_limit], start=1)
        ]

    def _combind_routes(self, coordinates: list[tuple[float, float]],
                        traffic: str, limit: int) -> dict[str, Any]:
        """Merge car and motorbike candidates by normalized time and distance."""
        if traffic not in {"normal", "heavy"}:
            raise ValueError("Traffic must be normal or heavy")
        candidate_limit = 3
        candidates = [
            *self._profile_routes(
                coordinates, "car", traffic, candidate_limit, alternatives=True
            ),
            *self._profile_routes(
                coordinates, "motorbike", traffic, candidate_limit, alternatives=True
            ),
        ]
        if not candidates:
            raise GraphHopperError("GraphHopper returned no combined route candidates")

        fastest = min(candidates, key=lambda route: route["duration"])
        shortest = min(candidates, key=lambda route: route["length"])
        fastest_duration = max(float(fastest["duration"]), 1.0)
        shortest_length = max(float(shortest["length"]), 1.0)
        for route in candidates:
            route["combined_score"] = (
                0.6 * float(route["duration"]) / fastest_duration
                + 0.4 * float(route["length"]) / shortest_length
            )
            route["source_mode"] = route["mode"]

        balanced = min(candidates, key=lambda route: route["combined_score"])
        ordered = []
        for candidate in [
            balanced,
            fastest,
            shortest,
            *sorted(candidates, key=lambda route: route["combined_score"]),
        ]:
            if candidate not in ordered:
                ordered.append(candidate)
        selected = ordered[:max(1, min(int(limit), 3))]
        for rank, route in enumerate(selected, start=1):
            route.update(
                rank=rank,
                recommended=rank == 1,
                duration_difference=max(0.0, route["duration"] - fastest["duration"]),
            )
            if rank == 1:
                route["recommendation_reason"] = (
                    "Best combined balance of travel time and distance"
                )
            elif route is fastest:
                route["recommendation_reason"] = f'Fastest {route["mode"]} route'
            elif route is shortest:
                route["recommendation_reason"] = f'Shortest {route["mode"]} route'
            else:
                route["recommendation_reason"] = (
                    f'Balanced {route["mode"]} alternative'
                )
        return self._response(coordinates, selected, "combind")

    @staticmethod
    def _response(coordinates, routes, requested_mode):
        return {
            "routes": routes,
            "recommended_rank": 1,
            # Node IDs belong to the retired GraphML implementation. Coordinate
            # indexes preserve the useful leg ordering without exposing fake IDs.
            "route_legs": [[index, index + 1] for index in range(len(coordinates) - 1)],
            "provider": "graphhopper",
            "requested_mode": requested_mode,
        }

    def _get(self, path: str, params=None) -> dict[str, Any]:
        try:
            response = requests.get(
                f"{self.base_url}{path}", params=params, timeout=self.timeout_seconds
            )
        except requests.RequestException as exc:
            raise GraphHopperError(
                f"GraphHopper is unavailable at {self.base_url}: {exc}"
            ) from exc
        try:
            payload = response.json()
        except ValueError as exc:
            raise GraphHopperError(
                f"GraphHopper returned HTTP {response.status_code} without JSON"
            ) from exc
        if not response.ok:
            message = payload.get("message") if isinstance(payload, dict) else None
            raise GraphHopperError(message or f"GraphHopper returned HTTP {response.status_code}")
        return payload

    @classmethod
    def _route_option(cls, path: dict[str, Any], rank: int, mode: str,
                      traffic: str) -> dict[str, Any]:
        geometry = path.get("points") or []
        if isinstance(geometry, dict):
            geometry = geometry.get("coordinates") or []
        geometry = [[float(point[0]), float(point[1])] for point in geometry]
        traffic_factor = 1.0
        if traffic == "heavy":
            traffic_factor = 1.35 if mode == "car" else 1.2 if mode == "motorbike" else 1.0
        duration = float(path.get("time", 0)) / 1000 * traffic_factor
        steps = [cls._instruction(item, geometry, traffic_factor)
                 for item in path.get("instructions") or []]
        return {
            "rank": rank,
            "recommended": rank == 1,
            "recommendation_reason": (
                "Fastest GraphHopper route with an estimated heavy-traffic delay"
                if traffic == "heavy" and mode in {"car", "motorbike"}
                else "Fastest route calculated by GraphHopper"
            ) if rank == 1 else "GraphHopper alternative route",
            "duration": duration,
            "duration_difference": 0.0,
            "length": float(path.get("distance", 0)),
            "geometry": geometry,
            "segments": [{"type": "road", "geometry": geometry}],
            "connectors": cls._connectors(path, geometry),
            "steps": steps,
            "mode": mode,
            "traffic": traffic,
        }

    @staticmethod
    def _instruction(item: dict[str, Any], geometry: list[list[float]],
                     traffic_factor: float) -> dict[str, Any]:
        interval = item.get("interval") or [0, 0]
        index = max(0, min(int(interval[0]), len(geometry) - 1)) if geometry else 0
        coordinate = geometry[index] if geometry else [0.0, 0.0]
        sign = int(item.get("sign", 0))
        maneuver = "depart" if index == 0 and sign == 0 else SIGN_TYPES.get(sign, "continue")
        return {
            "type": maneuver,
            "instruction": item.get("text") or "Continue",
            "street_name": item.get("street_name") or None,
            "distance": float(item.get("distance", 0)),
            "duration": float(item.get("time", 0)) / 1000 * traffic_factor,
            "coordinate": coordinate,
        }

    @staticmethod
    def _connectors(path: dict[str, Any], geometry: list[list[float]]) -> list:
        # GraphHopper geometry begins/ends at its snapped waypoints, so there are
        # no inferred straight road segments to render as if they were mapped.
        return []


def haversine_metres(first: tuple[float, float], second: tuple[float, float]) -> float:
    """Small public helper retained for callers/tests that compare snapped points."""
    lat1, lon1 = map(math.radians, first)
    lat2, lon2 = map(math.radians, second)
    value = math.sin((lat2 - lat1) / 2) ** 2 + (
        math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    )
    return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))

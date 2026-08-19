"""GraphHopper HTTP adapter preserving SmartRoute's coordinate-route contract."""

from __future__ import annotations

from typing import Any

import requests


MODE_PROFILES = {
    "car": "car",
    "motorbike": "motorcycle",
    "bike": "bike",
    "walk": "foot",
}

DESTINATION_ACCESS_PROFILES = {
    "car": "car_destination_access",
    "motorbike": "motorcycle_destination_access",
}

# Applied to duration when traffic="heavy"; modes without an entry are unaffected
# (e.g. bike/walk durations don't vary with road congestion).
HEAVY_TRAFFIC_FACTORS = {
    "car": 1.35,
    "motorbike": 1.2,
}

MANEUVER_TYPES = {
    -8: "u-turn",
    -7: "slight-left",
    -3: "turn-left",
    -2: "turn-left",
    -1: "slight-left",
    0: "continue",
    1: "slight-right",
    2: "turn-right",
    3: "turn-right",
    4: "arrive",
    5: "arrive",
    6: "continue",
    -98: "u-turn",
}


class GraphHopperError(RuntimeError):
    """Raised when GraphHopper cannot produce a usable route."""


class GraphHopperClient:
    def __init__(self, base_url: str, timeout: float = 15):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def route(
        self,
        coordinates: list[tuple[float, float]],
        mode: str,
        limit: int = 3,
        allow_destination_access: bool = False,
        traffic: str = "normal",
    ):
        """Calculate an LM route and translate it to SmartRoute's response schema."""
        profile = MODE_PROFILES.get(mode)
        if profile is None:
            raise GraphHopperError(f"Unsupported GraphHopper travel mode: {mode}")
        if allow_destination_access:
            profile = DESTINATION_ACCESS_PROFILES.get(mode, profile)
        payload: dict[str, Any] = {
            # SmartRoute receives [latitude, longitude]; GraphHopper expects [longitude, latitude].
            "points": [[longitude, latitude] for latitude, longitude in coordinates],
            "profile": profile,
            "points_encoded": False,
            "instructions": True,
            "locale": "en",
            "algorithm": "alternative_route" if limit > 1 and len(coordinates) == 2 else "astarbi",
        }
        params = {"ch.disable": "true"}
        try:
            response = requests.post(
                f"{self.base_url}/route", params=params, json=payload, timeout=self.timeout
            )
        except requests.RequestException as exc:
            raise GraphHopperError(f"GraphHopper is unavailable: {exc}") from exc
        if not response.ok:
            try:
                detail = response.json().get("message")
            except (ValueError, AttributeError):
                detail = None
            raise GraphHopperError(detail or f"GraphHopper returned HTTP {response.status_code}")
        try:
            paths = response.json()["paths"]
        except (ValueError, KeyError, TypeError) as exc:
            raise GraphHopperError("GraphHopper returned an invalid route response") from exc
        if not paths:
            raise GraphHopperError("GraphHopper found no route")

        traffic_factor = HEAVY_TRAFFIC_FACTORS.get(mode, 1.0) if traffic == "heavy" else 1.0
        routes = [
            self._normalize_path(path, rank, traffic_factor)
            for rank, path in enumerate(paths[:limit], 1)
        ]
        return {
            "routes": routes,
            "recommended_rank": 1,
            # GraphHopper owns snapping internally, so unstable graph node IDs are not exposed.
            "route_legs": [],
            "province": "cambodia",
            "routing_engine": "graphhopper-lm",
        }

    def route_combined(
        self,
        coordinates: list[tuple[float, float]],
        allow_destination_access: bool = False,
        traffic: str = "normal",
    ):
        """Suggest up to three direct routes using exactly two profile requests."""
        if len(coordinates) != 2:
            raise GraphHopperError("Combined routing currently supports exactly two points")
        car_routes = self.route(coordinates, "car", 3, allow_destination_access, traffic)["routes"]
        options = [self._direct_suggestion(route, "car") for route in car_routes]
        try:
            motorcycle_routes = self.route(
                coordinates, "motorbike", 3, allow_destination_access, traffic
            )["routes"]
        except GraphHopperError:
            motorcycle_routes = []
        options.extend(
            self._direct_suggestion(route, "motorbike")
            for route in motorcycle_routes
        )
        return self._rank_suggestions(options)

    @staticmethod
    def _direct_suggestion(route: dict[str, Any], mode: str):
        """Copy a direct route and make its vehicle explicit for combined-mode rendering."""
        suggestion = dict(route)
        suggestion["segments"] = [{
            "type": "road",
            "mode": mode,
            "geometry": route["geometry"],
        }]
        suggestion["transfers"] = []
        return suggestion

    @staticmethod
    def _rank_suggestions(options: list[dict[str, Any]]):
        """Rank Suggested routes by distance, using duration only to break ties."""
        options.sort(key=lambda route: (route["length"], route["duration"]))
        options = options[:3]
        for rank, option in enumerate(options, 1):
            modes = [segment.get("mode") for segment in option.get("segments", [])]
            route_kind = f"direct {modes[0]} route" if modes else "route"
            option.update({
                "rank": rank,
                "recommended": rank == 1,
                "recommendation_reason": (
                    f"Shortest available {route_kind}"
                    if rank == 1
                    else f"Alternative {route_kind}"
                ),
            })
        return {
            "routes": options,
            "recommended_rank": 1,
            "route_legs": [],
            "province": "cambodia",
            "routing_engine": "graphhopper-lm-combined",
        }

    @staticmethod
    def _normalize_path(path: dict[str, Any], rank: int, traffic_factor: float = 1.0):
        geometry = path.get("points", {}).get("coordinates") or []
        instructions = path.get("instructions") or []
        steps = []
        for instruction in instructions:
            interval = instruction.get("interval") or [0]
            coordinate_index = min(max(int(interval[0]), 0), max(len(geometry) - 1, 0))
            coordinate = geometry[coordinate_index] if geometry else [0.0, 0.0]
            sign = int(instruction.get("sign", 0))
            steps.append({
                "type": MANEUVER_TYPES.get(sign, "continue"),
                "instruction": instruction.get("text") or "Continue",
                "street_name": instruction.get("street_name") or None,
                "distance": float(instruction.get("distance") or 0),
                "duration": float(instruction.get("time") or 0) / 1000 * traffic_factor,
                "coordinate": coordinate,
            })
        return {
            "rank": rank,
            "recommended": rank == 1,
            "recommendation_reason": (
                "Fastest route calculated by GraphHopper LM"
                if rank == 1 else "GraphHopper alternative route"
            ),
            "duration": float(path.get("time") or 0) / 1000 * traffic_factor,
            "length": float(path.get("distance") or 0),
            "geometry": geometry,
            "segments": [{"type": "road", "geometry": geometry}],
            "connectors": [],
            "steps": steps,
        }

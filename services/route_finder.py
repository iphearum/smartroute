"""Small, dependency-free shortest-path engine for node-link graphs."""

from __future__ import annotations

import heapq
import math
import re
from functools import lru_cache
from typing import Any


class RouterEngine:
    """Build routing indexes once and reuse them for every request."""

    def __init__(self, graph_data: dict[str, Any]):
        self.graph_data = graph_data
        self.nodes = {node["id"]: node for node in graph_data.get("nodes", [])}
        self.node_labels: dict[Any, str] = {}
        self.adj = self.build_adjacency_list()
        minimum_ratio = math.inf
        for edge in graph_data.get("links", []):
            road_name = self._clean_name(edge.get("name"))
            if road_name:
                self.node_labels.setdefault(edge["source"], road_name)
                self.node_labels.setdefault(edge["target"], road_name)
            if edge["source"] in self.nodes and edge["target"] in self.nodes:
                straight = self._geodesic(edge["source"], edge["target"])
                if straight > 0:
                    minimum_ratio = min(minimum_ratio, self._weight(edge) / straight)
        # Scaling keeps the heuristic admissible even for synthetic/custom weights.
        self.heuristic_scale = 0.0 if minimum_ratio == math.inf else minimum_ratio
        self.edges: dict[tuple[Any, Any], dict[str, Any]] = {}
        directed = graph_data.get("directed", True)
        for edge in graph_data.get("links", []):
            key = (edge["source"], edge["target"])
            if key not in self.edges or self._weight(edge) < self._weight(self.edges[key]):
                self.edges[key] = edge
            if not directed:
                self.edges.setdefault((edge["target"], edge["source"]), edge)

    @staticmethod
    def _weight(edge: dict[str, Any]) -> float:
        try:
            weight = float(edge.get("length", 1.0))
        except (TypeError, ValueError):
            weight = 1.0
        if weight < 0 or not math.isfinite(weight):
            raise ValueError("Edge lengths must be finite and non-negative")
        return weight

    @staticmethod
    def _clean_name(value):
        if isinstance(value, (list, tuple)):
            value = next((item for item in value if item), None)
        if value is None:
            return None
        value = str(value).strip()
        return value or None

    def location_name(self, node_id):
        """Return the best local label available in the OSM graph."""
        node = self.nodes.get(node_id)
        if node is None:
            return "Unknown location"
        name = self._clean_name(node.get("name")) or self.node_labels.get(node_id)
        if name:
            return name
        try:
            return f'{float(node["y"]):.5f}, {float(node["x"]):.5f}'
        except (KeyError, TypeError, ValueError):
            return "Unnamed location"

    @lru_cache(maxsize=512)
    def search_locations(self, query: str, limit: int = 8):
        """Search locally available OSM place and road names."""
        needle = query.strip().casefold()
        if len(needle) < 2:
            return []
        matches, seen = [], set()
        for node_id, node in self.nodes.items():
            name = self._clean_name(node.get("name")) or self.node_labels.get(node_id)
            if not name or needle not in name.casefold() or name.casefold() in seen:
                continue
            seen.add(name.casefold())
            matches.append({
                "node_id": node_id,
                "name": name,
                "latitude": float(node["y"]),
                "longitude": float(node["x"]),
            })
            if len(matches) >= max(1, min(limit, 20)):
                break
        return matches

    @staticmethod
    def _road_class(edge):
        value = edge.get("highway", "residential")
        if isinstance(value, (list, tuple)):
            value = value[0] if value else "residential"
        return str(value)

    def _edge_allowed(self, edge, mode):
        modes = edge.get("modes")
        if isinstance(modes, str):
            modes = [item.strip() for item in modes.split(",")]
        if modes and mode not in modes:
            return False
        road = self._road_class(edge)
        access = str(edge.get("access", "")).casefold()
        if access in {"private", "no"}:
            return False
        if mode in {"walk", "bike"} and road in {"motorway", "motorway_link"}:
            return False
        if mode in {"car", "motorbike"} and road in {
            "footway", "pedestrian", "path", "steps", "cycleway", "bridleway",
        }:
            return False
        if mode == "bike" and str(edge.get("bicycle", "")).casefold() == "no":
            return False
        if mode == "walk" and str(edge.get("foot", "")).casefold() == "no":
            return False
        return True

    @staticmethod
    def _max_speed(edge, fallback):
        value = edge.get("maxspeed")
        if isinstance(value, (list, tuple)):
            value = value[0] if value else None
        if value:
            match = re.search(r"\d+(?:\.\d+)?", str(value))
            if match:
                speed = float(match.group())
                if "mph" in str(value).lower():
                    speed *= 1.60934
                return max(5.0, speed)
        return fallback

    def _travel_seconds(self, edge, mode, traffic):
        road = self._road_class(edge)
        defaults = {
            "motorway": 70, "trunk": 55, "primary": 42, "secondary": 35,
            "tertiary": 30, "residential": 22, "service": 15,
        }
        if mode == "walk":
            speed = 5.0
        elif mode == "bike":
            speed = 15.0 if road not in {"motorway", "trunk"} else 10.0
        elif mode == "motorbike":
            speed = min(self._max_speed(edge, defaults.get(road, 24)), 45.0)
        elif mode == "car":
            speed = self._max_speed(edge, defaults.get(road, 22))
        else:
            raise ValueError("Mode must be car, motorbike, bike, or walk")

        factor = 1.0
        if traffic == "heavy" and mode in {"car", "motorbike"}:
            car_factors = {"motorway": 2.4, "trunk": 2.2, "primary": 2.0, "secondary": 1.7,
                           "tertiary": 1.45, "residential": 1.2, "service": 1.1}
            factor = car_factors.get(road, 1.25)
            if mode == "motorbike":
                factor = 1 + (factor - 1) * 0.58
        elif traffic not in {"normal", "heavy"}:
            raise ValueError("Traffic must be normal or heavy")
        return self._weight(edge) / (speed * 1000 / 3600) * factor

    @lru_cache(maxsize=16)
    def _mode_adjacency(self, mode, traffic):
        adjacency = {node_id: [] for node_id in self.nodes}
        directed = self.graph_data.get("directed", True)
        for edge in self.graph_data.get("links", []):
            if not self._edge_allowed(edge, mode):
                continue
            cost = self._travel_seconds(edge, mode, traffic)
            adjacency.setdefault(edge["source"], []).append((edge["target"], cost, edge))
            adjacency.setdefault(edge["target"], [])
            if not directed:
                adjacency[edge["target"]].append((edge["source"], cost, edge))
        return adjacency

    def _mode_search(self, start, target, mode, traffic, banned_edges=frozenset()):
        adjacency = self._mode_adjacency(mode, traffic)
        distances, previous = {start: 0.0}, {}
        heap = [(0.0, start)]
        while heap:
            current_cost, current = heapq.heappop(heap)
            if current_cost != distances.get(current):
                continue
            if current == target:
                break
            for neighbor, cost, _ in adjacency.get(current, ()):
                if (current, neighbor) in banned_edges:
                    continue
                candidate = current_cost + cost
                if candidate < distances.get(neighbor, math.inf):
                    distances[neighbor] = candidate
                    previous[neighbor] = current
                    heapq.heappush(heap, (candidate, neighbor))
        path = self.reconstruct_path(previous, start, target)
        return path, distances[target]

    def route_options(self, start_id, end_id, mode="motorbike", traffic="normal", limit=3):
        """Return a fastest route plus distinct detours suitable for congestion."""
        if start_id not in self.nodes or end_id not in self.nodes:
            raise ValueError("Start or destination node not found in graph")
        best_path, best_duration = self._mode_search(start_id, end_id, mode, traffic)
        candidates = {(tuple(best_path), best_duration)}
        path_edges = list(zip(best_path, best_path[1:]))
        # A representative sample bounds worst-case work on long routes.
        stride = max(1, math.ceil(len(path_edges) / 24))
        requested_limit = max(1, min(limit, 5))
        if requested_limit > 1:
            for edge in path_edges[::stride]:
                try:
                    path, duration = self._mode_search(start_id, end_id, mode, traffic, frozenset({edge}))
                except ValueError:
                    continue
                if duration <= best_duration * 2.0:
                    candidates.add((tuple(path), duration))
        ordered = sorted(candidates, key=lambda item: item[1])[:requested_limit]
        options = []
        for index, (path, duration) in enumerate(ordered):
            geometry = self.get_path_geometry(path)
            length = sum(self._weight(self.edges[(u, v)]) for u, v in zip(path, path[1:]))
            options.append({
                "rank": index + 1,
                "recommended": index == 0,
                "path": list(path),
                "geometry": [list(point) for point in geometry],
                "length": length,
                "duration": duration,
                "duration_difference": max(0.0, duration - best_duration),
                "mode": mode,
                "traffic": traffic,
                "recommendation_reason": self._recommendation_reason(mode, traffic) if index == 0
                                         else "Alternative if conditions change",
                "start": {"node_id": start_id, "name": self.location_name(start_id)},
                "destination": {"node_id": end_id, "name": self.location_name(end_id)},
            })
        return options

    @staticmethod
    def _recommendation_reason(mode, traffic):
        if traffic == "heavy" and mode in {"car", "motorbike"}:
            return "Fastest route after adjusting for heavy traffic"
        return {
            "walk": "Fastest available walking route",
            "bike": "Fastest available bicycle route",
            "car": "Fastest available driving route",
            "motorbike": "Fastest available motorbike route",
        }.get(mode, "Fastest available route")

    def route_via_options(self, stop_ids, mode="motorbike", traffic="normal", limit=3):
        """Calculate an ordered multi-stop route and useful whole-route alternatives."""
        stop_ids = tuple(stop_ids)
        if len(stop_ids) < 2:
            raise ValueError("At least two stops are required")
        return self.route_legs_options(list(zip(stop_ids, stop_ids[1:])), mode, traffic, limit)

    def route_legs_options(self, legs, mode="motorbike", traffic="normal", limit=3):
        """Calculate alternatives while preserving independently snapped leg endpoints."""
        legs = tuple((int(start), int(end)) for start, end in legs)
        if not legs:
            raise ValueError("At least one route leg is required")
        leg_options = [
            self.route_options(start, end, mode, traffic, min(limit, 3))
            for start, end in legs
        ]

        combinations = [tuple(0 for _ in leg_options)]
        for leg_index, options in enumerate(leg_options):
            for option_index in range(1, len(options)):
                choice = [0 for _ in leg_options]
                choice[leg_index] = option_index
                combinations.append(tuple(choice))

        routes = []
        for choice in combinations:
            geometry, path, length, duration = [], [], 0.0, 0.0
            for leg_index, option_index in enumerate(choice):
                option = leg_options[leg_index][option_index]
                leg_geometry, leg_path = option["geometry"], option["path"]
                geometry.extend(leg_geometry[1:] if geometry and leg_geometry else leg_geometry)
                path.extend(leg_path[1:] if path and leg_path else leg_path)
                length += option["length"]
                duration += option["duration"]
            routes.append({
                "rank": 0,
                "recommended": False,
                "path": path,
                "geometry": geometry,
                "length": length,
                "duration": duration,
                "mode": mode,
                "traffic": traffic,
                "legs": [list(leg) for leg in legs],
            })
        routes.sort(key=lambda route: route["duration"])
        fastest_duration = routes[0]["duration"]
        for index, route in enumerate(routes[:max(1, min(limit, 5))]):
            route["rank"] = index + 1
            route["recommended"] = index == 0
            route["duration_difference"] = max(0.0, route["duration"] - fastest_duration)
            route["recommendation_reason"] = (
                self._recommendation_reason(mode, traffic)
                if index == 0 else "Alternative if conditions change"
            )
        return routes[:max(1, min(limit, 5))]

    def build_adjacency_list(self):
        adj = {node_id: [] for node_id in self.nodes}
        directed = self.graph_data.get("directed", True)
        for edge in self.graph_data.get("links", []):
            src, tgt = edge["source"], edge["target"]
            weight = self._weight(edge)
            adj.setdefault(src, []).append((tgt, weight))
            adj.setdefault(tgt, [])
            if not directed:
                adj[tgt].append((src, weight))
        return adj

    def dijkstra(self, start, target=None):
        if start not in self.nodes:
            raise ValueError(f"Start node {start} not found in graph")

        distances = {start: 0.0}
        previous = {}
        heap = [(0.0, start)]

        while heap:
            current_distance, current_node = heapq.heappop(heap)
            if current_distance != distances.get(current_node):
                continue
            if current_node == target:
                break
            for neighbor, weight in self.adj.get(current_node, ()):
                distance = current_distance + weight
                if distance < distances.get(neighbor, math.inf):
                    distances[neighbor] = distance
                    previous[neighbor] = current_node
                    heapq.heappush(heap, (distance, neighbor))
        return distances, previous

    def astar(self, start, target):
        """A* search using straight-line distance as an admissible heuristic."""
        if start not in self.nodes:
            raise ValueError(f"Start node {start} not found in graph")
        if target not in self.nodes:
            raise ValueError(f"End node {target} not found in graph")

        distances = {start: 0.0}
        previous = {}
        heap = [(self._heuristic(start, target), 0.0, start)]
        while heap:
            _, current_distance, current = heapq.heappop(heap)
            if current_distance != distances.get(current):
                continue
            if current == target:
                return distances, previous
            for neighbor, weight in self.adj.get(current, ()):
                candidate = current_distance + weight
                if candidate < distances.get(neighbor, math.inf):
                    distances[neighbor] = candidate
                    previous[neighbor] = current
                    score = candidate + self._heuristic(neighbor, target)
                    heapq.heappush(heap, (score, candidate, neighbor))
        return distances, previous

    def _heuristic(self, node_id, target_id):
        return self._geodesic(node_id, target_id) * self.heuristic_scale

    def _geodesic(self, node_id, target_id):
        first, second = self.nodes[node_id], self.nodes[target_id]
        lon1, lat1 = math.radians(float(first["x"])), math.radians(float(first["y"]))
        lon2, lat2 = math.radians(float(second["x"])), math.radians(float(second["y"]))
        dlon, dlat = lon2 - lon1, lat2 - lat1
        value = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
        return 6_371_000 * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))

    @staticmethod
    def reconstruct_path(previous, start, target):
        if start == target:
            return [start]
        if target not in previous:
            raise ValueError(f"No valid path from {start} to {target}")
        path = [target]
        while path[-1] != start:
            path.append(previous[path[-1]])
        path.reverse()
        return path

    def route(self, start_id, end_id, algorithm="astar"):
        path, geometry, length = self._cached_route(start_id, end_id, algorithm)
        return {
            "path": list(path),
            "geometry": [list(point) for point in geometry],
            "length": length,
            "start": {"node_id": start_id, "name": self.location_name(start_id)},
            "destination": {"node_id": end_id, "name": self.location_name(end_id)},
        }

    @lru_cache(maxsize=2048)
    def _cached_route(self, start_id, end_id, algorithm):
        if end_id not in self.nodes:
            raise ValueError(f"End node {end_id} not found in graph")
        if algorithm == "astar":
            distances, previous = self.astar(start_id, end_id)
        elif algorithm == "dijkstra":
            distances, previous = self.dijkstra(start_id, end_id)
        else:
            raise ValueError("Algorithm must be 'astar' or 'dijkstra'")
        path = self.reconstruct_path(previous, start_id, end_id)
        geometry = self.get_path_geometry(path)
        return tuple(path), tuple(tuple(point) for point in geometry), distances[end_id]

    def get_path_geometry(self, path):
        geometry = []
        for u, v in zip(path, path[1:]):
            edge = self.edges.get((u, v))
            if edge and edge.get("geometry"):
                coordinates = list(edge["geometry"])
                # OSM geometries are stored as (longitude, latitude).
                if edge["source"] != u:
                    coordinates.reverse()
                if geometry and coordinates and geometry[-1] == coordinates[0]:
                    coordinates = coordinates[1:]
                geometry.extend(coordinates)
                continue

            source, target = self.nodes.get(u), self.nodes.get(v)
            if source is None or target is None:
                raise ValueError(f"Missing node data for edge {u} -> {v}")
            coordinates = [[source["x"], source["y"]], [target["x"], target["y"]]]
            if geometry and geometry[-1] == coordinates[0]:
                coordinates = coordinates[1:]
            geometry.extend(coordinates)
        return geometry

"""Graph lookup helpers used by the HTTP API."""

from __future__ import annotations

import math
import heapq
from functools import lru_cache
from typing import Any

from shapely.geometry import LineString, Point


class GraphHelper:
    def __init__(self, graph: dict[str, Any]):
        if not isinstance(graph, dict):
            raise TypeError("Expected a node-link graph dictionary")
        self.graph = graph
        self.nodes = {node["id"]: node for node in graph.get("nodes", [])}
        self.temp_nodes: list[dict[str, Any]] = []
        self.temp_edges: list[dict[str, Any]] = []
        self._next_temp_id = min(min(self.nodes, default=0), 0) - 1

    def get_graph(self, include_temp=True):
        if not include_temp or not (self.temp_nodes or self.temp_edges):
            return self.graph
        # Copy only the containers; the large immutable node/edge records are shared.
        combined = dict(self.graph)
        combined["nodes"] = [*self.graph.get("nodes", []), *self.temp_nodes]
        combined["links"] = [*self.graph.get("links", []), *self.temp_edges]
        return combined

    def add_temp_point(self, lat: float, lon: float, connect=True, connection_distance=None):
        del connection_distance  # retained for API compatibility
        new_id = self._next_temp_id
        self._next_temp_id -= 1
        self.temp_nodes.append({"id": new_id, "x": lon, "y": lat, "temp": True})
        if connect:
            nearest = self.closest_node(lat, lon)
            if nearest is None:
                raise ValueError("Cannot connect a point to an empty graph")
            node = self.nodes[nearest]
            length = self._haversine(lon, lat, node["x"], node["y"])
            self.temp_edges.extend((
                {"source": new_id, "target": nearest, "length": length, "temp": True},
                {"source": nearest, "target": new_id, "length": length, "temp": True},
            ))
        return new_id

    def clear_temp_points(self):
        self.temp_nodes.clear()
        self.temp_edges.clear()

    def prepare_for_routing(self, source_lat, source_lon, target_lat, target_lon):
        self.clear_temp_points()
        return (
            self.add_temp_point(source_lat, source_lon),
            self.add_temp_point(target_lat, target_lon),
        )

    def get_point_from_osmid(self, osmid):
        for link in self.graph.get("links", []):
            if link.get("osmid") == osmid:
                return {"source": link.get("source"), "target": link.get("target")}
        return None

    def get_point_from_node_id(self, node_id: int):
        node = self.nodes.get(node_id)
        if node is None:
            return None
        return {"latitude": node.get("y"), "longitude": node.get("x")}

    def get_id_from_point(self, point: Point):
        return next((node_id for node_id, node in self.nodes.items()
                     if node.get("x") == point.x and node.get("y") == point.y), None)

    def is_point_on_edge(self, lat: float, lon: float, tolerance: float = 1e-5) -> bool:
        point = Point(lon, lat)
        for edge in self.graph.get("links", []):
            if edge.get("geometry"):
                line = LineString(edge["geometry"])
            else:
                source, target = self.nodes.get(edge.get("source")), self.nodes.get(edge.get("target"))
                if source is None or target is None:
                    continue
                line = LineString([(source["x"], source["y"]), (target["x"], target["y"])])
            if line.distance(point) <= tolerance:
                return True
        return False

    @lru_cache(maxsize=4096)
    def closest_node(self, lat: float, lon: float):
        candidates = self.closest_nodes(lat, lon, 1)
        return candidates[0][0] if candidates else None

    @lru_cache(maxsize=4096)
    def closest_nodes(self, lat: float, lon: float, limit: int = 5):
        """Return nearby node IDs with their straight-line snap distances."""
        if not -90 <= lat <= 90 or not -180 <= lon <= 180:
            raise ValueError("Invalid latitude or longitude")
        limit = max(1, min(int(limit), 12))
        nearest = heapq.nsmallest(
            limit,
            self.nodes.items(),
            key=lambda item: self._haversine(lon, lat, item[1]["x"], item[1]["y"]),
        )
        return tuple(
            (node_id, self._haversine(lon, lat, node["x"], node["y"]))
            for node_id, node in nearest
        )

    def distance_to_the_point(self, lat: float, lon: float):
        node_id = self.closest_node(lat, lon)
        if node_id is None:
            return None
        node = self.nodes[node_id]
        return {
            "node_id": node_id,
            "distance": self._haversine(lon, lat, node["x"], node["y"]),
        }

    @staticmethod
    def _haversine(lon1, lat1, lon2, lat2):
        radius = 6_371_000
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lambda = math.radians(lon2 - lon1)
        value = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
        return radius * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))

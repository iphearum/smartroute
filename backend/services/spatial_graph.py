"""Spatially indexed, kilometre-padded routing graph bounds."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

import math

from shapely.geometry import LineString, box
from shapely.strtree import STRtree


def route_bounds(coordinates: Iterable[tuple[float, float]], padding_km: float):
    """Return simple padded WGS84 bounds without constructing a route polygon."""
    points = [(float(lon), float(lat)) for lat, lon in coordinates]
    if not points:
        raise ValueError("Route bounds require at least one coordinate")
    center_lat = sum(point[1] for point in points) / len(points)
    latitude_padding = padding_km / 110.574
    longitude_padding = padding_km / max(1.0, 111.320 * math.cos(math.radians(center_lat)))
    return (
        min(point[0] for point in points) - longitude_padding,
        min(point[1] for point in points) - latitude_padding,
        max(point[0] for point in points) + longitude_padding,
        max(point[1] for point in points) + latitude_padding,
    )


@dataclass(frozen=True)
class IndexedEdge:
    key: tuple[Any, ...]
    geometry: LineString


class SpatialGraphIndex:
    """Build one immutable STRtree and derive edge-complete bounded subgraphs."""

    def __init__(self, graph):
        self.graph = graph
        self.edges: list[IndexedEdge] = []
        self.backbone_indices: list[int] = []
        geometries = []
        iterator = (
            graph.edges(keys=True, data=True)
            if graph.is_multigraph()
            else ((u, v, None, data) for u, v, data in graph.edges(data=True))
        )
        for source, target, edge_key, data in iterator:
            geometry = data.get("geometry")
            if not isinstance(geometry, LineString):
                source_node, target_node = graph.nodes[source], graph.nodes[target]
                geometry = LineString([
                    (float(source_node["x"]), float(source_node["y"])),
                    (float(target_node["x"]), float(target_node["y"])),
                ])
            key = (source, target, edge_key) if graph.is_multigraph() else (source, target)
            self.edges.append(IndexedEdge(key, geometry))
            geometries.append(geometry)
            highway = data.get("highway", "")
            if isinstance(highway, (list, tuple)):
                highway = highway[0] if highway else ""
            if str(highway).casefold() in {
                "motorway", "motorway_link", "trunk", "trunk_link",
                "primary", "primary_link",
            }:
                self.backbone_indices.append(len(self.edges) - 1)
        self.tree = STRtree(geometries) if geometries else None

    def bounds_subgraph(self, bounds, include_backbone: bool = False):
        if self.tree is None:
            raise ValueError("Cannot spatially filter an empty road graph")
        indices = {int(index) for index in self.tree.query(box(*bounds))}
        if include_backbone:
            indices.update(self.backbone_indices)
        edge_keys = [self.edges[int(index)].key for index in indices]
        if not edge_keys:
            raise ValueError("No road edges intersect the route bounds")
        # edge_subgraph retains both endpoints of boundary-crossing edges.
        result = self.graph.edge_subgraph(edge_keys).copy()
        result.graph.update(self.graph.graph)
        return result

"""Turn a NetworkX road graph into the trio the routing endpoints consume.

Lives here rather than in a route module: the application entry point builds
these at startup, and an entry point importing from `api/` would invert the
dependency direction.
"""

from __future__ import annotations

from networkx.readwrite import json_graph
from shapely.geometry import LineString

from app.routing.graph_helper import GraphHelper
from app.routing.router_engine import RouterEngine


def get_graph_data(graph):
    data = json_graph.node_link_data(graph, edges="links")
    for edge in data.get("links", []):
        if isinstance(edge.get("geometry"), LineString):
            edge["geometry"] = list(edge["geometry"].coords)
    return data


def build_graph_services(graph):
    data = get_graph_data(graph)
    return data, RouterEngine(data), GraphHelper(data)

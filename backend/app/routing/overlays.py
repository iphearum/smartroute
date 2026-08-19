"""Apply SQLite map changes (closures, custom routes) to loaded road networks."""

from __future__ import annotations

import math


def _distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (a[1], a[0], b[1], b[0]))
    h = math.sin((lat2-lat1)/2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2-lon1)/2) ** 2
    return 12_742_000 * math.asin(math.sqrt(h))


async def apply_database_overlays(graph, store, country: str, province: str):
    """Mutate a freshly loaded graph with active road closures and custom segments."""
    for closure in await store.list_closures(country, province, active_now=True):
        source, target, key = closure["source_node"], closure["target_node"], closure["edge_key"]
        if key is None:
            if graph.has_edge(source, target):
                graph.remove_edges_from([(source, target, k) for k in list(graph[source][target])])
        elif graph.has_edge(source, target, key):
            graph.remove_edge(source, target, key)

    base_nodes = [(node_id, (float(data["x"]), float(data["y"])))
                  for node_id, data in graph.nodes(data=True) if "x" in data and "y" in data]
    if not base_nodes:
        return graph
    for route in await store.list_custom_routes(country, province):
        points = [(float(lon), float(lat)) for lat, lon in route["coordinates"]]
        if len(points) < 2:
            continue
        node_ids = [-(route["id"] * 1_000_000 + index + 1) for index in range(len(points))]
        for node_id, (lon, lat) in zip(node_ids, points):
            graph.add_node(node_id, x=lon, y=lat, name=route["name"], custom=True)
        edge_data = {"highway": "custom", "name": route["name"], "modes": route["modes"], "custom": True}
        for index, (source, target) in enumerate(zip(node_ids, node_ids[1:])):
            data = {**edge_data, "length": _distance(points[index], points[index + 1])}
            graph.add_edge(source, target, **data)
            if route["bidirectional"]:
                graph.add_edge(target, source, **data)
        first_base = min(base_nodes, key=lambda item: _distance(item[1], points[0]))
        last_base = min(base_nodes, key=lambda item: _distance(item[1], points[-1]))
        first_data = {**edge_data, "length": _distance(first_base[1], points[0]), "connector": True}
        last_data = {**edge_data, "length": _distance(last_base[1], points[-1]), "connector": True}
        graph.add_edge(first_base[0], node_ids[0], **first_data)
        graph.add_edge(node_ids[-1], last_base[0], **last_data)
        if route["bidirectional"]:
            graph.add_edge(node_ids[0], first_base[0], **first_data)
            graph.add_edge(last_base[0], node_ids[-1], **last_data)
    return graph

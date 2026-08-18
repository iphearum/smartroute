import networkx as nx
from services.spatial_graph import SpatialGraphIndex, route_bounds


def test_bounds_subgraph_keeps_intersecting_edges_and_endpoints():
    graph = nx.MultiDiGraph()
    graph.add_node(1, x=104.90, y=11.55)
    graph.add_node(2, x=104.95, y=11.55)
    graph.add_node(3, x=105.00, y=11.55)
    graph.add_node(4, x=106.00, y=12.50)
    graph.add_node(5, x=106.10, y=12.50)
    graph.add_edge(1, 2, length=5_000)
    graph.add_edge(2, 3, length=5_000)
    graph.add_edge(4, 5, length=10_000)

    bounds = route_bounds([(11.55, 104.90), (11.55, 105.00)], 2)
    subset = SpatialGraphIndex(graph).bounds_subgraph(bounds)

    assert set(subset.nodes) == {1, 2, 3}
    assert subset.number_of_edges() == 2


def test_bounds_use_kilometre_padding():
    west, south, east, north = route_bounds([(11.55, 104.90), (11.55, 105.00)], 10)
    assert west < 104.90 and east > 105.00
    assert south < 11.55 and north > 11.55


def test_long_route_scope_keeps_national_road_outside_bounds():
    graph = nx.MultiDiGraph()
    graph.add_node(1, x=104.90, y=11.55)
    graph.add_node(2, x=105.00, y=11.55)
    graph.add_node(3, x=104.95, y=12.00)
    graph.add_node(4, x=105.05, y=12.00)
    graph.add_edge(1, 2, length=10_000, highway="residential")
    graph.add_edge(3, 4, length=10_000, highway="primary", ref="NR6")

    bounds = route_bounds([(11.55, 104.90), (11.55, 105.00)], 2)
    index = SpatialGraphIndex(graph)

    local = index.bounds_subgraph(bounds)
    long_distance = index.bounds_subgraph(bounds, include_backbone=True)
    assert set(local.nodes) == {1, 2}
    assert set(long_distance.nodes) == {1, 2, 3, 4}

import asyncio
import pytest
import networkx as nx

from services.graph_helper import GraphHelper
from services.route_finder import RouterEngine
from services.database_overlays import apply_database_overlays
from services.map_store import MapStore
from services.google_maps import parse_google_maps_place, parse_google_maps_route


@pytest.fixture
def graph_data():
    return {
        "directed": True,
        "nodes": [
            {"id": 1, "x": 104.0, "y": 11.0},
            {"id": 2, "x": 104.1, "y": 11.1},
            {"id": 3, "x": 104.2, "y": 11.2},
            {"id": 4, "x": 105.0, "y": 12.0},
        ],
        "links": [
            {"source": 1, "target": 2, "length": 5, "name": "Monivong Boulevard"},
            {"source": 1, "target": 3, "length": 20},
            {"source": 2, "target": 3, "length": 4},
        ],
    }


def test_shortest_route_includes_length_and_geometry(graph_data):
    result = RouterEngine(graph_data).route(1, 3)
    assert result["path"] == [1, 2, 3]
    assert result["length"] == 9
    assert result["geometry"][0] == [104.0, 11.0]
    assert result["geometry"][-1] == [104.2, 11.2]


def test_astar_and_dijkstra_return_same_route(graph_data):
    engine = RouterEngine(graph_data)
    assert engine.route(1, 3, "astar")["length"] == engine.route(1, 3, "dijkstra")["length"]


def test_route_exposes_human_readable_location_names(graph_data):
    result = RouterEngine(graph_data).route(1, 3)
    assert result["start"]["name"] == "Monivong Boulevard"
    assert result["destination"]["name"] != "Node 3"


def test_target_only_node_is_valid_but_unreachable(graph_data):
    with pytest.raises(ValueError, match="No valid path"):
        RouterEngine(graph_data).route(1, 4)


def test_temp_points_connect_without_copying_records(graph_data):
    helper = GraphHelper(graph_data)
    temp_id = helper.add_temp_point(11.01, 104.01)
    combined = helper.get_graph()
    assert temp_id < 0
    assert combined["nodes"][0] is graph_data["nodes"][0]
    assert len(combined["links"]) == len(graph_data["links"]) + 2


def test_missing_node_lookup_returns_none(graph_data):
    assert GraphHelper(graph_data).get_point_from_node_id(999) is None


def test_nearest_nodes_return_distance_order(graph_data):
    candidates = GraphHelper(graph_data).closest_nodes(11.01, 104.01, 3)
    assert len(candidates) == 3
    assert candidates[0][1] <= candidates[1][1] <= candidates[2][1]


def test_mode_routes_and_ordered_stops(graph_data):
    engine = RouterEngine(graph_data)
    options = engine.route_options(1, 3, mode="motorbike", traffic="normal", limit=2)
    assert options[0]["mode"] == "motorbike"
    assert options[0]["duration"] > 0
    assert options[0]["recommended"] is True
    assert options[0]["recommendation_reason"]
    assert all(not route["recommended"] for route in options[1:])
    immediate = engine.route_options(1, 3, mode="motorbike", traffic="normal", limit=1)
    assert len(immediate) == 1
    assert immediate[0]["recommended"] is True
    via = engine.route_via_options([1, 2, 3], mode="walk", traffic="normal", limit=2)
    assert via[0]["legs"] == [[1, 2], [2, 3]]
    assert via[0]["length"] == 9
    assert len(via[0]["leg_geometries"]) == 2
    assert via[0]["leg_geometries"][0][0] == [104.0, 11.0]


def test_local_location_search(graph_data):
    results = RouterEngine(graph_data).search_locations("Monivong")
    assert results[0]["name"] == "Monivong Boulevard"


def test_incremental_database_places_and_routes(tmp_path):
    async def scenario():
        store = MapStore(tmp_path / "maps")
        await store.initialize(generate_schemas=True)
        await store.register_map("cambodia", "phnom_penh", "Phnom Penh")
        await store.add_place("cambodia", "phnom_penh", "New Market", 11.56, 104.93,
                              category="market", address="Central Phnom Penh")
        assert (await store.search_places("cambodia", "phnom_penh", "market"))[0]["name"] == "New Market"
        assert (await store.search_places("cambodia", "phnom_penh", "central"))[0]["name"] == "New Market"
        await store.add_custom_route("cambodia", "phnom_penh", "Community Road",
                                     [[11.0, 104.0], [11.001, 104.001]], modes=["bike", "walk"])
        graph = nx.MultiDiGraph()
        graph.add_node(1, x=104.0, y=11.0)
        graph.add_node(2, x=104.002, y=11.002)
        graph.add_edge(1, 2, length=300)
        await apply_database_overlays(graph, store, "cambodia", "phnom_penh")
        custom_edges = [data for *_, data in graph.edges(data=True) if data.get("custom")]
        assert custom_edges
        assert all(data["modes"] == ["bike", "walk"] for data in custom_edges)
        await store.close()
    asyncio.run(scenario())


def test_incremental_database_closure_removes_edge(tmp_path):
    async def scenario():
        store = MapStore(tmp_path / "maps")
        await store.initialize(generate_schemas=True)
        await store.register_map("cambodia", "phnom_penh", "Phnom Penh")
        await store.add_closure("cambodia", "phnom_penh", 1, 2, reason="Road works")
        graph = nx.MultiDiGraph()
        graph.add_node(1, x=104.0, y=11.0)
        graph.add_node(2, x=104.1, y=11.1)
        graph.add_edge(1, 2, length=100)
        await apply_database_overlays(graph, store, "cambodia", "phnom_penh")
        assert not graph.has_edge(1, 2)
        await store.close()
    asyncio.run(scenario())


def test_custom_route_respects_travel_mode(graph_data):
    graph_data["links"][0]["modes"] = ["walk"]
    engine = RouterEngine(graph_data)
    assert engine._edge_allowed(graph_data["links"][0], "walk")
    assert not engine._edge_allowed(graph_data["links"][0], "car")


def test_google_maps_route_import_preserves_stop_order():
    result = parse_google_maps_route(
        "https://www.google.com/maps/dir/?api=1&origin=11.55%2C104.90"
        "&waypoints=11.56%2C104.91%7C11.57%2C104.92"
        "&destination=11.58%2C104.93&travelmode=two-wheeler"
    )
    assert result["mode"] == "motorbike"
    assert [stop["latitude"] for stop in result["stops"]] == [11.55, 11.56, 11.57, 11.58]


def test_google_maps_place_import_extracts_pin():
    result = parse_google_maps_place(
        "https://www.google.com/maps/search/?api=1&query=11.5564%2C104.9282"
    )
    assert result["location"]["latitude"] == 11.5564
    assert result["location"]["longitude"] == 104.9282

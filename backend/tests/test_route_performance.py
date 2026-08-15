from services.route_finder import RouterEngine


def graph():
    return {
        "directed": True,
        "nodes": [
            {"id": 1, "x": 104.90, "y": 11.50},
            {"id": 2, "x": 104.91, "y": 11.50},
            {"id": 3, "x": 104.90, "y": 11.51},
            {"id": 4, "x": 104.92, "y": 11.50},
        ],
        "links": [
            {"source": 1, "target": 2, "length": 1_000, "highway": "residential"},
            {"source": 2, "target": 4, "length": 1_000, "highway": "residential"},
            {"source": 1, "target": 3, "length": 1_500, "highway": "motorway", "maxspeed": "100"},
            {"source": 3, "target": 4, "length": 1_500, "highway": "motorway", "maxspeed": "100"},
        ],
    }


def test_profile_astar_optimizes_travel_time():
    engine = RouterEngine(graph())

    route = engine.route_options(1, 4, mode="car", limit=1)[0]

    assert route["path"] == [1, 3, 4]
    assert route["duration"] < 120


def test_profile_astar_respects_mode_access():
    engine = RouterEngine(graph())

    route = engine.route_options(1, 4, mode="walk", limit=1)[0]

    assert route["path"] == [1, 2, 4]


def test_recommended_route_is_cached():
    engine = RouterEngine(graph())

    first = engine.route_options(1, 4, mode="car", limit=1)
    second = engine.route_options(1, 4, mode="car", limit=1)

    assert first == second
    assert engine._cached_mode_search.cache_info().hits == 1


def test_alternative_searches_are_bounded(monkeypatch):
    engine = RouterEngine(graph())
    calls = 0
    original = engine._mode_search

    def counted(*args, **kwargs):
        nonlocal calls
        calls += 1
        return original(*args, **kwargs)

    monkeypatch.setattr(engine, "_mode_search", counted)
    engine.route_options(1, 4, mode="car", limit=3)

    # One fastest-path search plus no more than eight detour searches.
    assert calls <= 9

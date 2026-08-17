import pytest

from services.graphhopper import GraphHopperClient, GraphHopperError


class Response:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.ok = status_code < 400

    def json(self):
        return self.payload


def test_graphhopper_route_preserves_frontend_contract(monkeypatch):
    captured = {}

    def get(url, params=None, timeout=None):
        captured.update(url=url, params=params, timeout=timeout)
        return Response({"paths": [{
            "distance": 1250.5,
            "time": 120000,
            "points": {"type": "LineString", "coordinates": [
                [104.90, 11.55], [104.91, 11.56],
            ]},
            "instructions": [{
                "sign": 0, "text": "Continue on Street 1", "street_name": "Street 1",
                "distance": 1250.5, "time": 120000, "interval": [0, 1],
            }, {
                "sign": 4, "text": "Arrive at destination", "distance": 0,
                "time": 0, "interval": [1, 1],
            }],
        }]})

    monkeypatch.setattr("services.graphhopper.requests.get", get)
    result = GraphHopperClient("http://localhost:8989", 7).route(
        [(11.55, 104.90), (11.56, 104.91)], "motorbike", "normal"
    )

    route = result["routes"][0]
    assert captured["url"] == "http://localhost:8989/route"
    assert ("point", "11.55,104.9") in captured["params"]
    assert ("profile", "motorbike") in captured["params"]
    assert ("algorithm", "astarbi") in captured["params"]
    assert captured["timeout"] == 7
    assert result["provider"] == "graphhopper"
    assert result["route_legs"] == [[0, 1]]
    assert route["length"] == 1250.5
    assert route["duration"] == 120
    assert route["geometry"][-1] == [104.91, 11.56]
    assert route["steps"][0]["type"] == "depart"
    assert route["steps"][-1]["type"] == "arrive"


def test_graphhopper_error_uses_service_message(monkeypatch):
    monkeypatch.setattr(
        "services.graphhopper.requests.get",
        lambda *args, **kwargs: Response({"message": "Cannot find point 0"}, 400),
    )
    with pytest.raises(GraphHopperError, match="Cannot find point 0"):
        GraphHopperClient("http://localhost:8989").route([(11.5, 104.8), (11.6, 104.9)])


def test_heavy_traffic_adjusts_motorbike_eta(monkeypatch):
    monkeypatch.setattr(
        "services.graphhopper.requests.get",
        lambda *args, **kwargs: Response({"paths": [{
            "distance": 100, "time": 10000,
            "points": {"coordinates": [[104.8, 11.5], [104.9, 11.6]]},
        }]}),
    )
    route = GraphHopperClient("http://localhost:8989").route(
        [(11.5, 104.8), (11.6, 104.9)], traffic="heavy", limit=1
    )["routes"][0]
    assert route["duration"] == pytest.approx(12)


def test_multi_stop_route_uses_astar_without_alternatives(monkeypatch):
    captured = {}

    def get(url, params=None, timeout=None):
        captured["params"] = params
        return Response({"paths": [{
            "distance": 100, "time": 10000,
            "points": {"coordinates": [[104.8, 11.5], [104.9, 11.6]]},
        }]})

    monkeypatch.setattr("services.graphhopper.requests.get", get)
    result = GraphHopperClient("http://localhost:8989").route([
        (11.5, 104.8), (11.55, 104.85), (11.6, 104.9),
    ])
    assert ("algorithm", "astarbi") in captured["params"]
    assert not any(key.startswith("alternative_route.") for key, _ in captured["params"])
    assert result["route_legs"] == [[0, 1], [1, 2]]


def test_combind_merges_car_and_motorbike_into_three_ranked_routes(monkeypatch):
    calls = []

    def path(distance, time, offset):
        return {
            "distance": distance,
            "time": time,
            "points": {"coordinates": [
                [104.8, 11.5 + offset], [104.9, 11.6 + offset],
            ]},
        }

    def get(url, params=None, timeout=None):
        profile = dict(params)["profile"]
        calls.append(params)
        return Response({"paths": (
            [path(1000, 100_000, 0), path(700, 120_000, 0.001)]
            if profile == "car"
            else [path(900, 90_000, 0.002), path(600, 130_000, 0.003)]
        )})

    monkeypatch.setattr("services.graphhopper.requests.get", get)
    result = GraphHopperClient("http://localhost:8989").route(
        [(11.5, 104.8), (11.6, 104.9)], "combind"
    )

    assert len(calls) == 2
    assert {dict(params)["profile"] for params in calls} == {"car", "motorbike"}
    assert all(dict(params)["algorithm"] == "alternative_route" for params in calls)
    assert result["requested_mode"] == "combind"
    assert len(result["routes"]) == 3
    assert result["routes"][0]["recommended"] is True
    assert result["routes"][0]["recommendation_reason"].startswith("Best combined")
    assert {route["source_mode"] for route in result["routes"]} == {"car", "motorbike"}
    assert [route["rank"] for route in result["routes"]] == [1, 2, 3]

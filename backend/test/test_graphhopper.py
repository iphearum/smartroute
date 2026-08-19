from unittest.mock import Mock, patch

import pytest

from app.clients.graphhopper import GraphHopperClient, GraphHopperError


@patch("app.clients.graphhopper.requests.post")
def test_graphhopper_uses_lm_and_normalizes_route(mock_post):
    response = Mock(ok=True)
    response.json.return_value = {"paths": [{
        "distance": 1250.5,
        "time": 150000,
        "points": {"coordinates": [[104.9, 11.5], [104.91, 11.51]]},
        "instructions": [{
            "sign": 2, "text": "Turn right", "street_name": "Street 1",
            "distance": 300, "time": 30000, "interval": [1, 1],
        }],
    }]}
    mock_post.return_value = response

    result = GraphHopperClient("http://graphhopper:8989/").route(
        [(11.5, 104.9), (11.51, 104.91)], "motorbike"
    )

    _, kwargs = mock_post.call_args
    assert kwargs["params"] == {"ch.disable": "true"}
    assert kwargs["json"]["points"] == [[104.9, 11.5], [104.91, 11.51]]
    assert kwargs["json"]["profile"] == "motorcycle"
    assert result["routing_engine"] == "graphhopper-lm"
    assert result["routes"][0]["duration"] == 150
    assert result["routes"][0]["steps"][0]["type"] == "turn-right"


@patch("app.clients.graphhopper.requests.post")
def test_graphhopper_uses_explicit_destination_access_profile(mock_post):
    response = Mock(ok=True)
    response.json.return_value = {"paths": [{
        "distance": 10, "time": 1000,
        "points": {"coordinates": [[104.9, 11.5], [104.901, 11.501]]},
        "instructions": [],
    }]}
    mock_post.return_value = response

    GraphHopperClient("http://graphhopper:8989").route(
        [(11.5, 104.9), (11.501, 104.901)],
        "motorbike",
        allow_destination_access=True,
    )

    assert mock_post.call_args.kwargs["json"]["profile"] == "motorcycle_destination_access"


@patch("app.clients.graphhopper.requests.post")
def test_graphhopper_scales_duration_for_heavy_traffic(mock_post):
    response = Mock(ok=True)
    response.json.return_value = {"paths": [{
        "distance": 1000, "time": 100000,
        "points": {"coordinates": [[104.9, 11.5], [104.91, 11.51]]},
        "instructions": [{
            "sign": 0, "text": "Continue", "street_name": None,
            "distance": 1000, "time": 100000, "interval": [0, 0],
        }],
    }]}
    mock_post.return_value = response

    result = GraphHopperClient("http://graphhopper:8989").route(
        [(11.5, 104.9), (11.51, 104.91)], "car", traffic="heavy"
    )

    assert result["routes"][0]["duration"] == 135
    assert result["routes"][0]["steps"][0]["duration"] == 135


@patch("app.clients.graphhopper.requests.post")
def test_graphhopper_surfaces_api_error(mock_post):
    response = Mock(ok=False, status_code=400)
    response.json.return_value = {"message": "Point 0 is out of bounds"}
    mock_post.return_value = response

    with pytest.raises(GraphHopperError, match="out of bounds"):
        GraphHopperClient("http://graphhopper:8989").route([(0, 0), (1, 1)], "car")


def test_graphhopper_combined_route_prefers_shortest_direct_route():
    client = GraphHopperClient("http://graphhopper:8989")

    def route(coordinates, mode, limit=3, allow_destination_access=False, traffic="normal"):
        lengths = [1000, 1300, 900] if mode == "car" else [1200, 800, 1100]
        return {"routes": [route_result(length) for length in lengths]}

    client.route = Mock(side_effect=route)
    result = client.route_combined([(11.0, 104.0), (11.4, 104.4)])

    assert result["routing_engine"] == "graphhopper-lm-combined"
    assert client.route.call_count == 2
    assert {(call.args[1], call.args[2]) for call in client.route.call_args_list} == {
        ("car", 3), ("motorbike", 3)
    }
    assert [route["length"] for route in result["routes"]] == [800, 900, 1000]
    assert [route["rank"] for route in result["routes"]] == [1, 2, 3]
    assert result["routes"][0]["recommended"] is True
    assert [segment["mode"] for segment in result["routes"][0]["segments"]] == [
        "motorbike"
    ]
    assert all(route["transfers"] == [] for route in result["routes"])


def test_graphhopper_combined_route_keeps_car_results_if_motorbike_fails():
    client = GraphHopperClient("http://graphhopper:8989")

    def route(coordinates, mode, limit=3, allow_destination_access=False, traffic="normal"):
        if mode == "motorbike":
            raise GraphHopperError("No motorbike route")
        return {"routes": [route_result(length) for length in (1000, 1200, 1100)]}

    client.route = Mock(side_effect=route)
    result = client.route_combined([(11.0, 104.0), (11.4, 104.4)])

    assert client.route.call_count == 2
    assert [route["length"] for route in result["routes"]] == [1000, 1100, 1200]
    assert all(route["segments"][0]["mode"] == "car" for route in result["routes"])


def route_result(length):
    return {
        "duration": length / 10,
        "length": length,
        "geometry": [[104.0, 11.0], [104.4, 11.4]],
        "steps": [],
        "connectors": [],
    }

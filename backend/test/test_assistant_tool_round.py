"""Integration cover for the browser <-> socket tool handshake.

The browser answers a socket turn over the socket itself. A regression here is
invisible to unit tests: the turn simply stalls until the tool timeout, which is
what a stray HTTP submission caused.
"""
import json
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.services.assistant import stream as stream_module


def _delta(content="", tool_calls=None, reasoning=""):
    payload = {"content": content, "reasoning_content": reasoning}
    return SimpleNamespace(
        content=content,
        tool_calls=tool_calls,
        model_dump=lambda: payload,
    )


def _chunk(delta, finish_reason=None):
    return SimpleNamespace(
        usage=None,
        choices=[SimpleNamespace(delta=delta, finish_reason=finish_reason)],
    )


def _tool_call():
    call = SimpleNamespace(
        model_dump=lambda: {
            "index": 0,
            "id": "call-1",
            "function": {"name": "search_places", "arguments": '{"query": "cafe"}'},
        }
    )
    return [call]


@pytest.fixture
def stubbed_model(monkeypatch):
    """First round asks for a tool; the follow-up round answers."""
    rounds = [
        [_chunk(_delta(tool_calls=_tool_call()), finish_reason="tool_calls")],
        [_chunk(_delta(content="Found one cafe nearby."), finish_reason="stop")],
    ]
    monkeypatch.setattr(stream_module, "client", object())
    monkeypatch.setattr(
        stream_module, "_open_stream", lambda messages, enable_thinking: rounds.pop(0)
    )
    monkeypatch.setattr(stream_module, "STREAM_CHUNK_DELAY", 0)


def test_socket_turn_completes_when_the_browser_answers_over_the_socket(stubbed_model):
    from main import app

    with TestClient(app).websocket_connect("/ws/assistant") as socket:
        socket.send_json(
            {
                "type": "chat.message",
                "clientId": "turn-1",
                "language": "en",
                "reasoningMode": "off",
                "text": "find a cafe",
                "messages": [],
            }
        )

        answer = ""
        while True:
            frame = socket.receive_json()
            if frame["type"] == "assistant.tool_call":
                assert frame["data"]["name"] == "search_places"
                # Exactly the frame the browser sends: keyed by tool call id.
                socket.send_json(
                    {
                        "type": "assistant.tool_result",
                        "id": frame["data"]["toolCallId"],
                        "data": {"places": [{"name": "Brown Coffee"}]},
                    }
                )
            elif frame["type"] == "assistant.delta":
                answer += frame["data"]["text"]
            elif frame["type"] == "assistant.done":
                assert frame["data"]["message"] == "Found one cafe nearby."
                break
            elif frame["type"] == "assistant.error":
                pytest.fail(f"turn failed: {frame['data']}")

        assert answer == "Found one cafe nearby."


def test_tool_activity_frames_open_and_resolve_one_step(stubbed_model):
    """Each tool reports one identified step and its outcome, nothing else.

    The thread groups steps by tool call id, so an unresolved start row spins
    forever and a filler row without an id becomes an orphan.
    """
    from main import app

    activities = []
    with TestClient(app).websocket_connect("/ws/assistant") as socket:
        socket.send_json(
            {
                "type": "chat.message",
                "clientId": "turn-2",
                "language": "en",
                "reasoningMode": "off",
                "text": "find a cafe",
                "messages": [],
            }
        )
        while True:
            frame = socket.receive_json()
            if frame["type"] == "assistant.activity":
                activities.append(frame["data"])
            elif frame["type"] == "assistant.tool_call":
                socket.send_json(
                    {
                        "type": "assistant.tool_result",
                        "id": frame["data"]["toolCallId"],
                        "data": {"places": [{"name": "Brown Coffee"}]},
                    }
                )
            elif frame["type"] == "assistant.done":
                break
            elif frame["type"] == "assistant.error":
                pytest.fail(f"turn failed: {frame['data']}")

    assert [item.get("status") for item in activities] == [None, "done"]
    assert all(item["toolCallId"] == "call-1" for item in activities)
    assert activities[0]["label"] == "Searching places"
    assert activities[0]["detail"] == '"cafe"'


def test_tool_activity_detail_names_repeated_steps():
    """Identical labels are only distinguishable by their subject."""
    detail = stream_module._tool_activity_detail

    assert detail("add_map_point", {"name": "Siem Reap", "latitude": 13.3, "longitude": 103.8}) == "Siem Reap"
    assert detail("add_map_point", {"latitude": 13.3, "longitude": 103.8}) == "13.3000, 103.8000"
    assert (
        detail("plot_route", {"stops": [{"name": "Phnom Penh"}, {"name": "Battambang"}]})
        == "Phnom Penh → Battambang"
    )
    assert detail("reset_map_view", {}) is None

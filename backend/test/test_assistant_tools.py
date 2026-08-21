import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi.encoders import jsonable_encoder

from app.routes.assistant import (
    _execute_tool,
    _pseudo_tool_call,
    _user_content,
    _visible_stream_text,
)
from app.services.assistant.stream import _delta_reasoning, system_prompt
from app.services.assistant.protocol import (
    ReasoningRedactor,
    ThinkingParser,
    reasoning_mode,
    resolve_reasoning,
    should_reason,
)


def run(coro):
    return asyncio.run(coro)


def test_plot_route_tool_returns_validated_map_action():
    result = run(_execute_tool(SimpleNamespace(state=SimpleNamespace()), "plot_route", {
        "stops": [
            {"name": "Start", "latitude": 11.55, "longitude": 104.92},
            {"name": "End", "latitude": 11.56, "longitude": 104.93},
        ],
        "mode": "car",
    }))

    assert result["accepted"] is True
    assert result["action"]["type"] == "route"
    assert len(result["action"]["stops"]) == 2


def test_map_command_tool_returns_browser_command():
    result = run(_execute_tool(SimpleNamespace(state=SimpleNamespace()), "reset_map_view", {}))

    assert result == {
        "accepted": True,
        "action": {"type": "map_command", "command": "reset_map_view"},
    }


def test_current_location_tool_returns_browser_capability_request():
    result = run(
        _execute_tool(SimpleNamespace(state=SimpleNamespace()), "get_current_location", {})
    )

    assert result == {
        "accepted": True,
        "action": {"type": "location_request"},
    }


def test_assistant_prompt_supports_khmer_and_falls_back_safely():
    assert "ភាសាខ្មែរ" in system_prompt("km")
    assert "English" in system_prompt("en")
    assert system_prompt("unknown") == system_prompt("en")


def test_assistant_prompt_can_enable_private_deeper_reasoning():
    prompt = system_prompt("en", thinking=True)

    assert "extra internal reasoning" in prompt
    assert "never reveal hidden reasoning" in prompt.lower()
    assert system_prompt("en", thinking=False) != prompt


def test_thinking_parser_keeps_summary_separate_across_chunks():
    parser = ThinkingParser()

    events = parser.feed("Answer <thi")
    events += parser.feed("nk>Compare options.</think> Final")
    events += parser.finish()

    assert "".join(text for kind, text in events if kind == "answer") == "Answer  Final"
    assert "".join(text for kind, text in events if kind == "reasoning") == "Compare options."


def test_plot_route_rejects_missing_coordinates():
    with pytest.raises(Exception, match="coordinates"):
        run(_execute_tool(SimpleNamespace(state=SimpleNamespace()), "plot_route", {
            "stops": [{"name": "Only a name"}, {"name": "End", "latitude": 11.5, "longitude": 104.9}],
        }))


def test_search_result_with_datetime_is_json_safe():
    class Store:
        async def search_places(self, *_args):
            return [{
                "name": "Market",
                "latitude": 11.55,
                "longitude": 104.92,
                "created_at": datetime(2026, 8, 20, tzinfo=timezone.utc),
            }]

    app = SimpleNamespace(state=SimpleNamespace(map_store=Store(), map_region=("cambodia", "phnom_penh")))
    result = run(_execute_tool(app, "search_places", {"query": "market"}))

    encoded = json.dumps(jsonable_encoder(result))
    assert "2026-08-20T00:00:00+00:00" in encoded


def test_pseudo_tool_markup_is_converted_and_hidden():
    markup = "<toolplaces> <parameter=query> Coffee O'Clock Road 30M Phnom Penh </parameter> </function> </tool_call>"

    call = _pseudo_tool_call(markup, "message-1")

    assert call is not None
    assert json.loads(call["arguments"]) == {"query": "Coffee O'Clock Road 30M Phnom Penh"}
    assert _visible_stream_text(markup) == ""


def test_pseudo_route_markup_is_converted_and_hidden():
    markup = (
        '<toolroute> <parameter="mode"> car </parameter> '
        '<parameter="stops"> '
        '[{"name":"Start","latitude":11.568,"longitude":104.92},'
        '{"name":"End","latitude":11.5774,"longitude":104.911}] '
        '</parameter> </toolroute>'
    )

    call = _pseudo_tool_call(markup, "message-2")

    assert call is not None
    assert call["name"] == "plot_route"
    assert json.loads(call["arguments"]) == {
        "mode": "car",
        "stops": [
            {"name": "Start", "latitude": 11.568, "longitude": 104.92},
            {"name": "End", "latitude": 11.5774, "longitude": 104.911},
        ],
    }
    assert _visible_stream_text(markup) == ""


def test_user_content_keeps_text_files_and_supported_images_bounded():
    content = _user_content(
        "What is in these files?",
        [
            {
                "name": "notes.txt",
                "type": "text/plain",
                "text": "A useful note",
            },
            {
                "name": "map.png",
                "type": "image/png",
                "dataUrl": "data:image/png;base64,abc",
            },
        ],
    )

    assert isinstance(content, list)
    assert content[0]["type"] == "text"
    assert "A useful note" in content[0]["text"]
    assert content[1] == {
        "type": "image_url",
        "image_url": {"url": "data:image/png;base64,abc"},
    }


def test_delta_reasoning_reads_provider_native_channels():
    """Local OpenAI-compatible servers stream thinking outside `content`."""

    class Delta:
        def __init__(self, payload):
            self._payload = payload

        def model_dump(self):
            return self._payload

    assert _delta_reasoning(Delta({"content": "", "reasoning_content": "Plan"})) == "Plan"
    assert _delta_reasoning(Delta({"content": "hi", "reasoning": "Plan"})) == "Plan"
    assert _delta_reasoning(Delta({"content": "hi"})) == ""
    assert _delta_reasoning(Delta({"reasoning_content": None})) == ""


def _redact(text: str, chunk: int = 4) -> str:
    """Replay text through the redactor the way the model streams it."""
    redactor = ReasoningRedactor()
    out = ""
    for offset in range(0, len(text), chunk):
        out += "".join(redactor.feed(text[offset : offset + chunk]))
    return ("".join([out, *redactor.finish()])).strip()


def test_reasoning_redactor_drops_tool_inventory_sentences():
    leaked = (
        "The user is asking who I am. I'm PsarAI's map copilot with access to "
        "search_places (for finding places), search_web (for current facts), and "
        "plot_route (for routes). I should answer briefly."
    )

    cleaned = _redact(leaked)

    assert "search_places" not in cleaned
    assert "search_web" not in cleaned
    assert "plot_route" not in cleaned
    assert cleaned == "The user is asking who I am. I should answer briefly."


def test_reasoning_redactor_rewrites_a_single_capability_mention():
    assert _redact("I should use search_places to find cafes.") == (
        "I should use place search to find cafes."
    )
    assert _redact("Call plot_route() with the stops.") == (
        "Call route planning with the stops."
    )


def test_reasoning_redactor_drops_prompt_and_protocol_talk():
    assert _redact("The system prompt says be brief. So I will be brief.") == (
        "So I will be brief."
    )
    assert _redact("I must emit a tool_call now. Then explain it.") == "Then explain it."


def test_reasoning_redactor_keeps_ordinary_reasoning_intact():
    thought = (
        "The user wants a route from Phnom Penh to Siem Reap. "
        "I already have both coordinates."
    )

    assert _redact(thought) == thought


def test_reasoning_redactor_drops_tool_usage_talk_but_keeps_real_queries():
    assert _redact("No need for tool use here. I will answer directly.") == (
        "I will answer directly."
    )
    # "tool" as part of the user's actual question must survive redaction.
    kept = "The user asks about a tool rental shop. I should look that up."
    assert _redact(kept) == kept


def _turn(text):
    return [{"role": "user", "content": text}]


def test_reasoning_mode_normalizes_to_auto():
    assert reasoning_mode("off") == "off"
    assert reasoning_mode("HIGH") == "high"
    assert reasoning_mode(None) == "auto"
    assert reasoning_mode("nonsense") == "auto"


def test_reasoning_modes_override_the_auto_decision():
    simple = _turn("hello")
    complex_ = _turn("why is this route slower than the highway?")

    assert resolve_reasoning("off", complex_) is False
    assert resolve_reasoning("high", simple) is True
    assert resolve_reasoning("auto", simple) is False
    assert resolve_reasoning("auto", complex_) is True


def test_should_reason_detects_multi_step_requests():
    assert should_reason(_turn("Compare driving and cycling to the airport")) is True
    assert should_reason(_turn("Plan a two day trip step by step")) is True
    assert should_reason(_turn("What is the fastest way to Siem Reap?")) is True
    assert should_reason(_turn("hello")) is False
    assert should_reason(_turn("coffee near me")) is False


def test_should_reason_reads_the_latest_user_turn_only():
    messages = [
        {"role": "user", "content": "Why is this slower?"},
        {"role": "assistant", "content": "Traffic."},
        {"role": "user", "content": "ok thanks"},
    ]

    assert should_reason(messages) is False


def test_should_reason_handles_multimodal_and_empty_content():
    attached = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Analyze this map screenshot"},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,x"}},
            ],
        }
    ]

    assert should_reason(attached) is True
    assert should_reason([]) is False
    assert should_reason([{"role": "assistant", "content": "hi"}]) is False


class _FakeCompletions:
    """Record create() calls and optionally fail the first, flagged attempt."""

    def __init__(self, error=None):
        self.error = error
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error and "extra_body" in kwargs:
            raise self.error
        return "stream"


def _fake_client(error=None):
    completions = _FakeCompletions(error)
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    return client, completions


def _provider_error(message, status_code):
    error = RuntimeError(message)
    error.status_code = status_code
    return error


def test_open_stream_sends_the_enable_thinking_flag(monkeypatch):
    from app.services.assistant import stream as stream_module

    client, completions = _fake_client()
    monkeypatch.setattr(stream_module, "client", client)

    stream_module._open_stream([{"role": "user", "content": "hi"}], True)
    stream_module._open_stream([{"role": "user", "content": "hi"}], False)

    assert completions.calls[0]["extra_body"] == {"enable_thinking": True}
    assert completions.calls[1]["extra_body"] == {"enable_thinking": False}
    assert completions.calls[0]["stream"] is True


def test_open_stream_falls_back_when_the_provider_rejects_the_flag(monkeypatch):
    from app.services.assistant import stream as stream_module

    client, completions = _fake_client(
        _provider_error("Unknown field: enable_thinking", 400)
    )
    monkeypatch.setattr(stream_module, "client", client)

    assert stream_module._open_stream([], True) == "stream"
    assert len(completions.calls) == 2
    assert "extra_body" not in completions.calls[1]


def test_open_stream_propagates_unrelated_provider_failures(monkeypatch):
    from app.services.assistant import stream as stream_module

    client, completions = _fake_client(_provider_error("No model loaded", 400))
    monkeypatch.setattr(stream_module, "client", client)

    with pytest.raises(RuntimeError, match="No model loaded"):
        stream_module._open_stream([], True)
    assert len(completions.calls) == 1


class _FakeSocket:
    """Minimal websocket double that replays a scripted client frame queue."""

    def __init__(self, frames):
        self.frames = list(frames)
        self.sent = []

    async def send_json(self, frame):
        self.sent.append(frame)

    async def receive_json(self):
        if not self.frames:
            raise AssertionError("stream waited for a frame that never arrived")
        return self.frames.pop(0)


def test_tool_result_frame_shape_matches_what_the_browser_sends():
    """The browser answers a socket turn with a frame keyed by tool call id."""
    from app.services.assistant.stream import _receive_tool_result

    socket = _FakeSocket(
        [
            # Unrelated chatter and a mismatched id must be skipped, not consumed
            # as the answer.
            {"type": "chat.message", "id": "call-1"},
            {"type": "assistant.tool_result", "id": "other-call", "data": {"ok": False}},
            {"type": "assistant.tool_result", "id": "call-1", "data": {"ok": True}},
        ]
    )

    result = asyncio.run(_receive_tool_result(socket, "call-1"))

    assert result == {"ok": True}


def test_tool_result_rejects_a_malformed_payload():
    from app.services.assistant.stream import _receive_tool_result

    socket = _FakeSocket(
        [{"type": "assistant.tool_result", "id": "call-1", "data": "not-a-dict"}]
    )

    assert asyncio.run(_receive_tool_result(socket, "call-1")) == {
        "error": "Invalid tool result"
    }

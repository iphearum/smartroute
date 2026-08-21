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
from app.services.assistant.stream import system_prompt
from app.services.assistant.protocol import ThinkingParser


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
    assert "never reveal hidden reasoning" in prompt
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

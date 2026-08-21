"""Normalized SSE transport for assistant model streams."""
from __future__ import annotations

import asyncio
import json
from typing import Any


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


class SseTransport:
    """Adapt internal assistant frames to provider-neutral SSE events."""

    def __init__(self) -> None:
        self.events: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.tool_results: asyncio.Queue[tuple[str, dict[str, Any]]] = asyncio.Queue()
        self.pending_tool: tuple[str, str] | None = None

    async def send_json(self, frame: dict[str, Any]) -> None:
        frame_type = frame.get("type")
        data = frame.get("data") or {}
        if frame_type == "assistant.delta":
            await self.events.put({"type": "content", "delta": data.get("text", "")})
        elif frame_type == "assistant.reasoning_delta":
            await self.events.put({"type": "reasoning", "delta": data.get("text", "")})
        elif frame_type == "assistant.usage":
            await self.events.put(
                {
                    "type": "usage",
                    "input": data.get("input", data.get("prompt_tokens")),
                    "output": data.get("output", data.get("completion_tokens")),
                }
            )
        elif frame_type == "assistant.tool_call":
            self.pending_tool = (
                str(data.get("toolCallId", "")),
                str(data.get("name", "")),
            )
            await self.events.put(
                {
                    "type": "tool",
                    "name": data.get("name", ""),
                    "status": "start",
                    "toolCallId": data.get("toolCallId"),
                    "arguments": data.get("arguments", {}),
                }
            )

    async def receive_json(self) -> dict[str, Any]:
        tool_call_id, tool_name = self.pending_tool or ("", "")
        received_id, result = await self.tool_results.get()
        if received_id != tool_call_id:
            return {"type": "assistant.tool_result", "id": received_id, "data": result}
        await self.events.put(
            {
                "type": "tool",
                "name": tool_name,
                "status": "done",
                "toolCallId": tool_call_id,
                "action": result.get("action"),
            }
        )
        self.pending_tool = None
        return {"type": "assistant.tool_result", "id": received_id, "data": result}

    async def submit_tool_result(self, tool_call_id: str, result: dict[str, Any]) -> None:
        await self.tool_results.put((tool_call_id, result))


_streams: dict[str, SseTransport] = {}


def register_stream(stream_id: str) -> SseTransport:
    transport = SseTransport()
    _streams[stream_id] = transport
    return transport


def get_stream(stream_id: str) -> SseTransport | None:
    return _streams.get(stream_id)


def unregister_stream(stream_id: str) -> None:
    _streams.pop(stream_id, None)

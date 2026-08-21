"""HTTP and SSE endpoints for the map copilot."""
from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from fastapi.encoders import jsonable_encoder

from app.services.assistant.stream import stream_turn, system_prompt
from app.services.assistant.sessions import create_session, list_sessions, save_session
from app.services.assistant.tools import execute_tool
from app.services.assistant.sse import (
    get_stream,
    register_stream,
    sse,
    unregister_stream,
)
from app.services.assistant.protocol import (
    _pseudo_tool_call,
    _user_content,
    _visible_stream_text,
    reasoning_mode,
    resolve_reasoning,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["assistant"])

# Compatibility exports for existing tests and callers. The implementation now
# lives in protocol/service modules; this route module remains the public route
# boundary and does not duplicate those helpers.
_execute_tool = execute_tool


@router.websocket("/ws/assistant")
async def assistant_socket(websocket: WebSocket):
    """Compatibility transport for clients that cannot consume SSE reliably."""
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            if payload.get("type") != "chat.message":
                continue

            client_id = str(payload.get("clientId", "")).strip()
            text = str(payload.get("text", "")).strip()[:4000]
            if not client_id or not text:
                await websocket.send_json(
                    {
                        "type": "assistant.error",
                        "id": client_id,
                        "data": {"message": "clientId and text are required"},
                    }
                )
                continue

            language = payload.get("language") if payload.get("language") in {"en", "km"} else "en"
            mode = reasoning_mode(payload.get("reasoningMode"))
            history = _stream_history(payload.get("messages"))
            user_message = {
                "role": "user",
                "content": _user_content(text, payload.get("attachments")),
            }
            thinking = resolve_reasoning(mode, [*history, user_message])
            messages = [
                {"role": "system", "content": system_prompt(language, thinking=thinking)},
                *history,
                user_message,
            ]
            if thinking:
                # Auto mode decides server-side, so the client is told when a
                # turn will actually reason instead of guessing.
                await websocket.send_json(
                    {
                        "type": "assistant.activity",
                        "id": client_id,
                        "data": {"kind": "thinking", "label": "Thinking…"},
                    }
                )
            try:
                reply, action = await stream_turn(websocket, messages, client_id, thinking=thinking)
                await websocket.send_json(
                    {
                        "type": "assistant.done",
                        "id": client_id,
                        "data": {"message": reply, "action": action},
                    }
                )
            except Exception:
                logger.exception("Assistant stream failed")
                await websocket.send_json(
                    {
                        "type": "assistant.done",
                        "id": client_id,
                        "data": {
                            "message": "The map copilot is temporarily unavailable.",
                            "action": None,
                        },
                    }
                )
    except WebSocketDisconnect:
        logger.debug("Assistant disconnected")


def _owner_key(value: Any) -> str:
    key = str(value or "").strip()
    if len(key) < 16 or len(key) > 128:
        raise HTTPException(status_code=422, detail="clientKey must be 16-128 characters")
    return key


def _session_resource(session) -> dict[str, Any]:
    return {
        "id": session.id,
        "title": session.title,
        "messages": session.messages,
        "createdAt": session.created_at,
        "updatedAt": session.updated_at,
        "expiresAt": session.expires_at,
    }


@router.get("/assistant/sessions")
async def get_assistant_sessions(clientKey: str):
    return {"sessions": jsonable_encoder([_session_resource(item) for item in await list_sessions(_owner_key(clientKey))])}


@router.post("/assistant/sessions")
async def create_assistant_session(payload: dict[str, Any]):
    session = await create_session(
        _owner_key(payload.get("clientKey")),
        str(payload.get("title", "New chat")),
        payload.get("messages", []),
    )
    return jsonable_encoder(_session_resource(session))


@router.put("/assistant/sessions/{session_id}")
async def update_assistant_session(session_id: str, payload: dict[str, Any]):
    from app.models.assistant import AssistantSession

    session = await AssistantSession.get_or_none(id=session_id, owner_key=_owner_key(payload.get("clientKey")))
    if session is None:
        raise HTTPException(status_code=404, detail="Assistant session not found")
    return jsonable_encoder(_session_resource(await save_session(
        session,
        str(payload.get("title", session.title)),
        payload.get("messages", []),
    )))


@router.post("/assistant/tools/execute")
async def execute_assistant_tool(payload: dict[str, Any], request: Request):
    name = payload.get("name")
    args = payload.get("arguments", {})
    if not isinstance(name, str) or not isinstance(args, dict):
        raise HTTPException(status_code=422, detail="name and arguments are required")
    return jsonable_encoder(await execute_tool(request.app, name, args))


@router.post("/assistant/speech/chunk")
async def synthesize_assistant_speech(payload: dict[str, Any]):
    """Return one small MP3 chunk for frontend queue playback."""
    import asyncio

    from app.services.assistant.speech import detect_language, synthesize_chunk

    text = str(payload.get("text", "")).strip()[:280]
    if not text:
        raise HTTPException(status_code=422, detail="text is required")
    requested_language = payload.get("language")
    language = requested_language if requested_language in {"en", "km"} else detect_language(text)
    try:
        audio = await asyncio.to_thread(synthesize_chunk, text, language)
    except Exception as exc:
        logger.exception("Assistant speech synthesis failed")
        raise HTTPException(status_code=502, detail="Speech synthesis is temporarily unavailable") from exc
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


def _stream_history(value: Any) -> list[dict[str, str]]:
    if not isinstance(value, list):
        return []
    return [
        {"role": item["role"], "content": str(item["text"])[:4000]}
        for item in value[-8:]
        if isinstance(item, dict)
        and item.get("role") in {"user", "assistant"}
        and isinstance(item.get("text"), str)
        and item["text"].strip()
    ]


@router.post("/assistant/chat/stream")
async def stream_assistant_chat(payload: dict[str, Any]):
    """Stream normalized reasoning/content/tool/usage/done SSE events."""
    stream_id = str(payload.get("streamId") or payload.get("clientId") or "").strip()
    if not stream_id or len(stream_id) > 128:
        raise HTTPException(status_code=422, detail="streamId is required")
    text = str(payload.get("text", "")).strip()[:4000]
    if not text:
        raise HTTPException(status_code=422, detail="text is required")
    language = payload.get("language") if payload.get("language") in {"en", "km"} else "en"
    mode = reasoning_mode(payload.get("reasoningMode"))
    history = _stream_history(payload.get("messages"))
    user_message = {
        "role": "user",
        "content": _user_content(text, payload.get("attachments")),
    }
    thinking = resolve_reasoning(mode, [*history, user_message])
    transport = register_stream(stream_id)

    async def generate():
        task: asyncio.Task | None = None
        try:
            messages = [
                {"role": "system", "content": system_prompt(language, thinking=thinking)},
                *history,
                user_message,
            ]
            task = asyncio.create_task(
                stream_turn(transport, messages, stream_id, thinking=thinking)
            )
            while not task.done() or not transport.events.empty():
                try:
                    event = await asyncio.wait_for(transport.events.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    continue
                yield sse(event.pop("type"), event)
            reply, action = await task
            yield sse("done", {"message": reply, "action": action})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Assistant SSE stream failed")
            yield sse(
                "done",
                {
                    "message": "The map copilot is temporarily unavailable. You can still use search and routing directly.",
                    "action": None,
                },
            )
        finally:
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass
            unregister_stream(stream_id)

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/assistant/chat/stream/{stream_id}/tool-result")
async def submit_assistant_tool_result(stream_id: str, payload: dict[str, Any]):
    transport = get_stream(stream_id)
    tool_call_id = str(payload.get("toolCallId", "")).strip()
    result = payload.get("result")
    if transport is None:
        raise HTTPException(status_code=404, detail="Assistant stream not found")
    if not tool_call_id or not isinstance(result, dict):
        raise HTTPException(status_code=422, detail="toolCallId and result are required")
    await transport.submit_tool_result(tool_call_id, result)
    return {"accepted": True}

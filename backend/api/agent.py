"""
Minimal OpenAI-compatible FastAPI server backed by gpt4free (g4f).

This exposes just enough of the OpenAI Chat Completions API for
code agents such as Codex CLI, Aider, Continue, etc. to talk to it:

    GET  /v1/models
    POST /v1/chat/completions   (streaming and non-streaming)

Point any OpenAI-API-compatible client at this server by setting:

    OPENAI_BASE_URL=http://localhost:8000/v1
    OPENAI_API_KEY=<SAMPLE_API_KEY below, or anything if auth is disabled>

See README.md in this directory for setup and usage details.
"""

from __future__ import annotations

import json
import os
import time
import uuid
from typing import List, Optional, Union

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from g4f.client import AsyncClient
from g4f.errors import (
    MissingAuthError,
    ModelNotFoundError,
    ProviderNotFoundError,
    RateLimitError,
)
from g4f.providers.any_provider import AnyProvider

# Optional bearer token required from callers. Leave unset to disable auth
# (fine for local use, e.g. on localhost only).
SAMPLE_API_KEY = os.getenv("SAMPLE_API_KEY")

DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "openai-fast")
DEFAULT_PROVIDER = os.getenv("DEFAULT_PROVIDER", "Pollinations") or None

router = APIRouter()
client = AsyncClient()


def sse(event: Optional[str], data: dict) -> str:
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data)}\n\n"


def create_completion(
    messages: List[dict],
    stream: bool,
    temperature: Optional[float] = None,
    max_tokens: Optional[int] = None,
):
    """Call g4f with the sample's fixed no-auth backend.

    Returns the raw g4f call object: await it for a single ChatCompletion,
    or async-iterate it for ChatCompletionChunks, matching g4f's own
    calling convention.
    """
    kwargs: dict = {
        "model": DEFAULT_MODEL,
        "messages": messages,
        "stream": stream,
    }
    if DEFAULT_PROVIDER:
        kwargs["provider"] = DEFAULT_PROVIDER
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    return client.chat.completions.create(**kwargs)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: str = DEFAULT_MODEL
    messages: List[ChatMessage]
    stream: bool = False
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    provider: Optional[str] = DEFAULT_PROVIDER


class ResponsesRequest(BaseModel):
    model: str = DEFAULT_MODEL
    # Responses API "input" is either a plain string or a list of
    # {"role": ..., "content": "..."} / {"role": ..., "content": [{"type": "input_text", "text": "..."}]} items.
    input: Union[str, List[dict]]
    instructions: Optional[str] = None
    stream: bool = False
    temperature: Optional[float] = None
    max_output_tokens: Optional[int] = None


def check_auth(authorization: Optional[str]) -> None:
    if SAMPLE_API_KEY is None:
        return
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != SAMPLE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


def raise_for_g4f_error(e: Exception):
    if isinstance(e, (ModelNotFoundError, ProviderNotFoundError)):
        raise HTTPException(status_code=404, detail=str(e))
    if isinstance(e, MissingAuthError):
        raise HTTPException(status_code=401, detail=str(e))
    if isinstance(e, RateLimitError):
        raise HTTPException(status_code=429, detail=str(e))
    # g4f providers fail often (rate limits, auth walls, outages).
    # Surface the underlying reason instead of a bare 500.
    raise HTTPException(status_code=502, detail=str(e))


def responses_input_to_messages(body: ResponsesRequest) -> List[dict]:
    messages = []
    if body.instructions:
        messages.append({"role": "system", "content": body.instructions})
    if isinstance(body.input, str):
        messages.append({"role": "user", "content": body.input})
        return messages
    for item in body.input:
        role = item.get("role", "user")
        content = item.get("content", "")
        if isinstance(content, list):
            content = "".join(
                part.get("text", "")
                for part in content
                if isinstance(part, dict)
            )
        messages.append({"role": role, "content": content})
    return messages


@router.get("/healthz")
async def healthz():
    return {"status": "ok"}


@router.get("/v1/models")
async def list_models(authorization: Optional[str] = Header(None)):
    check_auth(authorization)
    models = AnyProvider.get_models()
    return {
        "object": "list",
        "data": [
            {"id": model, "object": "model", "created": 0, "owned_by": "g4f"}
            for model in models
        ],
    }


@router.post("/v1/chat/completions")
async def chat_completions(
    body: ChatCompletionRequest, authorization: Optional[str] = Header(None)
):
    check_auth(authorization)
    messages = [m.model_dump() for m in body.messages]

    try:
        response = create_completion(
            messages, body.stream, body.temperature, body.max_tokens
        )

        if not body.stream:
            result = await response
            return json.loads(result.model_dump_json())

        async def event_stream():
            try:
                async for chunk in response:
                    payload = (
                        chunk.model_dump_json()
                        if hasattr(chunk, "model_dump_json")
                        else chunk.json()
                    )
                    yield f"data: {payload}\n\n"
            except (RateLimitError, MissingAuthError) as e:
                yield f"data: {json.dumps({'error': {'message': str(e)}})}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    except Exception as e:
        raise_for_g4f_error(e)


@router.post("/v1/responses")
async def responses(
    body: ResponsesRequest, authorization: Optional[str] = Header(None)
):
    """
    Implements enough of OpenAI's Responses API wire format for Codex CLI's
    `wire_api = "responses"` custom model provider (see README.md).
    """
    check_auth(authorization)
    messages = responses_input_to_messages(body)
    response_id = f"resp_{uuid.uuid4().hex}"
    item_id = f"msg_{uuid.uuid4().hex}"
    created_at = int(time.time())

    def response_object(status: str, output_text: str, usage: Optional[dict] = None) -> dict:
        return {
            "id": response_id,
            "object": "response",
            "created_at": created_at,
            "status": status,
            "model": body.model,
            "output": [
                {
                    "type": "message",
                    "id": item_id,
                    "status": status,
                    "role": "assistant",
                    "content": [
                        {"type": "output_text", "text": output_text, "annotations": []}
                    ],
                }
            ],
            "usage": usage,
            "error": None,
            "instructions": body.instructions,
        }

    try:
        completion = create_completion(
            messages, body.stream, body.temperature, body.max_output_tokens
        )

        if not body.stream:
            result = await completion
            text = result.choices[0].message.content or ""
            usage = json.loads(result.usage.model_dump_json()) if result.usage else None
            return response_object("completed", text, usage)

        async def event_stream():
            yield sse("response.created", {"type": "response.created", "response": response_object("in_progress", "")})
            yield sse(
                "response.output_item.added",
                {
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {"type": "message", "id": item_id, "status": "in_progress", "role": "assistant", "content": []},
                },
            )
            yield sse(
                "response.content_part.added",
                {
                    "type": "response.content_part.added",
                    "item_id": item_id,
                    "output_index": 0,
                    "content_index": 0,
                    "part": {"type": "output_text", "text": "", "annotations": []},
                },
            )

            full_text = ""
            try:
                async for chunk in completion:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if not delta:
                        continue
                    full_text += delta
                    yield sse(
                        "response.output_text.delta",
                        {
                            "type": "response.output_text.delta",
                            "item_id": item_id,
                            "output_index": 0,
                            "content_index": 0,
                            "delta": delta,
                        },
                    )
            except (RateLimitError, MissingAuthError) as e:
                yield sse(
                    "response.failed",
                    {"type": "response.failed", "response": {**response_object("failed", full_text), "error": {"message": str(e)}}},
                )
                return

            yield sse(
                "response.output_text.done",
                {"type": "response.output_text.done", "item_id": item_id, "output_index": 0, "content_index": 0, "text": full_text},
            )
            yield sse(
                "response.content_part.done",
                {
                    "type": "response.content_part.done",
                    "item_id": item_id,
                    "output_index": 0,
                    "content_index": 0,
                    "part": {"type": "output_text", "text": full_text, "annotations": []},
                },
            )
            yield sse(
                "response.output_item.done",
                {
                    "type": "response.output_item.done",
                    "output_index": 0,
                    "item": {"type": "message", "id": item_id, "status": "completed", "role": "assistant", "content": [{"type": "output_text", "text": full_text, "annotations": []}]},
                },
            )
            yield sse(
                "response.completed",
                {"type": "response.completed", "response": response_object("completed", full_text)},
            )

        return StreamingResponse(event_stream(), media_type="text/event-stream")

    except Exception as e:
        raise_for_g4f_error(e)
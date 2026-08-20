# Map AI assistant

## Scope

The map copilot is an opt-in floating assistant for place discovery and route
planning. The map remains the primary workspace: assistant responses can return
search result cards or a route action, and the frontend applies those actions to
the existing place and route stores.

## Transport and configuration

FastAPI exposes `GET /ws/assistant`. It accepts `{ "type": "chat.message",
"clientId": "...", "text": "..." }` and streams `assistant.delta` frames,
followed by `assistant.done` with `{ message, action }`. The action is either
`search` (with backend place results) or `route` (with named coordinate stops
and a travel mode). The Mini Platform window appends deltas to one assistant
bubble, so the user sees progress before the completed action arrives.

The server advertises only two tools to the model: `search_places` and
`plot_route`. Tool calls are accumulated across streamed chunks, executed by
the backend, and returned to the model as tool messages for a short final
response. Tool names, arguments, and raw tool JSON never reach the browser.

The backend normalizes each upstream stream payload into four-character
`assistant.delta` frames with a short pacing delay. This preserves visible
step-by-step concatenation even when a local OpenAI-compatible server buffers
several tokens into one upstream chunk.

The client stores the last 24 visible messages in
`localStorage["smartroute-ai-map-history"]`. On every socket connection it
sends the last 16 text turns as `chat.history`; FastAPI validates the roles,
truncates message text, and restores that context before accepting new
messages. A generation is single-flight in the Mini Platform composer, which
keeps streamed deltas ordered across a series of user messages.

The backend uses the official `openai` Python client against any
OpenAI-compatible `/v1/chat/completions` endpoint. Local
development defaults are documented in `backend/.env.example`:

```text
AI_BASE_URL=http://127.0.0.1:8888/v1
AI_MODEL=nphearum/PsarAI-2B-GGUF
AI_API_KEY=
```

The API key stays server-side. The browser receives only the WebSocket action
envelope. Configure `NEXT_PUBLIC_AI_SOCKET_URL` when the backend is not on the
same host at port 8000.

## Failure behavior and future work

If the model is unavailable, the socket stays usable and returns a short
fallback message; direct map search and routing remain available. This MVP is
single-process and does not yet authenticate socket sessions or persist chat
history. Production hardening should add the short-lived socket ticket and
durable event protocol described in `docs/map-messaging-design.md`, then add
runtime validation for model-generated actions before execution.

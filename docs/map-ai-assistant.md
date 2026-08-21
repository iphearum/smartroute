# Map AI assistant

## Scope

The map copilot is an opt-in floating assistant for place discovery and route
planning. The map remains the primary workspace: assistant responses can return
search result cards or a route action, and the frontend applies those actions to
the existing place and route stores. The assistant is one panel in a
`MiniPlatformDock`: a single docked aside shared by every registered feature
panel, currently the copilot chat and the Shop Window. A collapsed rail launcher
opens each panel directly, and header tabs switch between them while the aside
stays open. The assistant opens as a docked right-side desktop panel; its
collapsed tab keeps the map unobstructed, and the map viewport reserves the
aside width while it is open. On mobile, the same shared shell becomes a
bottom-anchored, near-full-height panel with no resize affordance, leaving a
small map area above it for context. The aside can be resized from 300 to 640
pixels with its left edge or keyboard arrow keys on desktop. Assistant messages
render safe Markdown,
including formatted text, headings, lists, links, images, inline code, and
fenced code blocks; user messages remain plain text.

## Transport and configuration

FastAPI exposes `GET /ws/assistant` for assistant generation. The browser sends
`chat.message` with `clientId`, `language`, `thinking`, `text`, attachments,
and bounded `messages`; the socket returns normalized assistant frames for
`delta`, `reasoning_delta`, `tool_call`, `usage`, `activity`, and `done`.
Tool results return over the same socket as `assistant.tool_result`. The
browser never handles provider fields, `<think>` markup, or OpenAI event names.
The HTTP `POST /assistant/chat/stream` endpoint remains available as a
server-to-server/SSE compatibility transport, but the map UI uses the socket
because it supports the interactive tool-result handshake directly.

The provider adapter accepts OpenAI-compatible Chat Completions streams and
normalizes reasoning fields, content deltas, native/pseudo tool calls, and
usage into the same SSE contract. A future OpenAI Responses adapter belongs
behind this boundary; the frontend must not change when providers change.
Tool events contain a safe name, status, call ID, and bounded arguments. Map
searches return selectable place chips; web searches return clickable source
chips with the provider URL and snippet in the link tooltip.

The backend implementation keeps route orchestration in
`backend/app/routes/assistant.py`. The assistant feature package at
`app/services/assistant/` owns protocol normalization and bounded attachment
shaping in `protocol.py`, the normalized SSE bridge in `sse.py`, tool schemas
and browser-action validation in `tools.py`, and provider streaming plus the
tool-result handshake in `stream.py`. Keep provider differences inside
FastAPI; the Next.js UI consumes only the normalized event contract.

The supported tool actions are map place search, server-side web search, adding
a map point, plotting a route, focusing a coordinate, requesting browser
location, resetting the map view, and clearing route points. Map search returns
places for user selection; web search returns source metadata for external
links. Point and route actions are applied immediately after the execution API
succeeds.
The server never reads device GPS: `get_current_location` returns a typed
browser capability request, and the browser asks for permission before sending
coordinates back as tool-result context.

Tool permissions are client-owned. `Ask for approval` pauses map-changing tool
calls until the user allows or declines them; `Run automatically` executes
available tools without an in-chat approval; `Full access` enables all exposed
tools; `Disabled` returns a rejected tool result without changing the map.
Search remains non-mutating and can run without a confirmation prompt.

`search_web` uses DuckDuckGo's HTML search endpoint from the backend and does
not require an API key. Search requests remain server-side and only expose
normalized HTTPS result URLs to the client.

For answer grounding, the adapter may fetch result pages server-side with a
short timeout and a 2 MB response limit. It resolves every DNS address and
rejects private, loopback, link-local, reserved, unspecified, and multicast
targets. Redirects are disabled by default and manually revalidated up to three
times; only HTML content is extracted, with scripts and navigation chrome
removed and the extracted text capped before it is returned to the model.

Search results are normalized with FastAPI's JSON encoder before they cross
the HTTP/SSE boundary, including ORM timestamp fields such as
`created_at` and `updated_at`. The model-message boundary also uses a string
fallback for unexpected nested provider values, and logs the full exception
trace for diagnosis.

The backend normalizes each upstream stream payload into four-character SSE
`content` events with a short pacing delay. This preserves visible
step-by-step concatenation even when a local OpenAI-compatible server buffers
several tokens into one upstream chunk. Usage is emitted as a normalized
`usage` event when the provider supplies it, and every successful stream ends
with `done`.

Native model tool calls are the preferred protocol. Some local model templates
emit `<tool_call>`/`<function>` or shorthand
`<toolroute>` markup as ordinary text instead of native tool-call deltas. The
backend recognizes supported shorthand for every map tool, parses named JSON
parameters, suppresses the protocol from the chat bubble, and converts it into
the same normalized SSE `tool` event. This handling applies to every tool round,
including follow-up calls after a place-selection result; tool markup must
never be streamed as visible assistant text. The backend suppresses recognized
protocol during streaming, and the frontend Markdown boundary strips any
remaining protocol-shaped text as a final defense before rendering.

The client stores up to 24 visible messages in each local chat session under
`localStorage["smartroute-ai-map-sessions"]`. Users can start a new chat,
continue an existing local session, and select any saved session from the
assistant header. Each saved session can also be removed from Chat history;
removing the active session selects the nearest remaining session or creates a
new empty one, and the local-storage record is updated. On every turn it sends
the active session's bounded recent context in the POST body; FastAPI validates
the roles, truncates message text, and restores that context before accepting
the new message. A generation is single-flight in the Mini Platform composer,
which keeps streamed events ordered across a series of user messages.

The client estimates context usage conservatively at roughly four characters
per token and displays the estimate against an 8,192-token budget. Before each
turn it sends a bounded recent context to the server, keeping the full local
transcript available for the user while preventing the backend model history
from growing without limit. This is bounded truncation, not semantic
summarization: a future compaction upgrade should replace the oldest complete
turns with a model-generated summary and record that summary as a typed
session event. Thinking summaries are presentation-only and are not included
in the visible context payload or token estimate.

The cloud button explicitly syncs the selected local session to the backend.
Synced sessions are scoped by the browser's opaque client key, renewed on sync,
and expire after 30 days. The local session remains the primary source, so the
assistant continues to work offline or when the sync endpoint is unavailable.
The current anonymous client-key sync is an MVP boundary; authenticated account
ownership should replace it before exposing cross-device session access.

The assistant follows the app's persisted language preference. `en` produces
concise English replies and `km` produces concise Khmer replies while keeping
tool names, coordinates, and structured arguments unchanged. The language is
validated at the POST boundary; unsupported values fall back to English.
Users change this preference from the account menu; changing it while the
assistant is open applies to the next message without reconnecting the map.

The composer exposes an optional Thinking mode. The client sends `thinking: true`
only when the user enables it; omitted or non-boolean values are treated as
disabled by the server. Enabled mode adds a bounded instruction for deeper
internal reasoning on complex requests and tool decisions. Enabled mode also
asks the model for a short, explicit planning summary inside
`<think>...</think>`. The backend strips those tags, sends the summary as
the normalized `reasoning` SSE event, and keeps provider-native private reasoning fields
out of the browser. The Thinking preference is persisted locally under
`localStorage["smartroute-ai-thinking-enabled"]` through `useLocalStore`, so it
survives chat-session changes without being sent as part of session history.

While a turn is active, the chat shows a compact Thinking activity with the
summary and typed tool activity such as a place search or map update. These
activity events and the summary are attached to the completed assistant
message and remain visible in the session transcript, including across
reloads. The composer action row remains pinned at the bottom and does not
duplicate the activity history. If no explicit summary is returned, the UI
falls back to the generic Thinking status.

The composer uses a compact liquid-glass command surface with an interactive
tool-call approval selector and a list-style plus menu for attachments,
Search, and available tools. Search and Code capability indicators, model,
and map-context indicators remain visible in the bottom toolbar. Attachments
render as light thumbnail/file tiles inside the composer. It accepts up to five
local attachments, each capped at 5 MB. Images
are sent as vision inputs when the configured model accepts OpenAI-compatible
image content; small text/code files are included as bounded text context.
The composer also accepts image and file clipboard items pasted with `Ctrl+V`
(`Cmd+V` on macOS); normal text paste remains unchanged. The browser must expose
the clipboard item as a file, so unsupported clipboard content continues to be
treated as ordinary text.
Unsupported files remain visible as attachment metadata but are not falsely
treated as parsed content. Browser attachments are not persisted in chat
history.

Completed assistant responses expose local actions for copy, retry, delete,
and read-aloud. Read-aloud is a toggle: clicking it again cancels the active
audio queue. Before speech starts, Markdown formatting,
code blocks, images, URLs, and other presentation-only markup are removed so
the browser reads only the response text. Starting another response stops the
previous one. Retry resubmits the preceding user turn through the
same single-flight transport; delete removes the response from the local
visible session only because the current stream API has no remote
message-delete event. These controls belong to the assistant owner rather than
the message renderer so they cannot create a second source of truth for chat
state.

Read-aloud uses short server-generated MP3 chunks. The frontend splits cleaned
responses into sentence and script chunks, requests each chunk from
`POST /assistant/speech/chunk`, and queues playback so long responses do not
become one large audio file. Khmer and English script runs use separate gTTS
language settings; stopping or starting another response cancels the queue.
The next chunk is requested while the current chunk is playing, hiding most of
the TTS/network latency between chunks without concatenating the full response
into one large file. Cancelling speech also aborts in-flight prefetch requests.
The composer’s Audio responses toggle persists under
`smartroute-ai-audio-response-enabled` through `useLocalStore`. When enabled,
completed sentences are queued while the assistant response is streaming and
the final partial sentence is flushed when the response completes. Turning the
toggle off immediately cancels the active chunk and clears queued audio; a
browser autoplay restriction or speech request failure is treated as a silent
enhancement failure and does not interrupt the text response.

Fenced Markdown code blocks use the declared language for lightweight client
side syntax coloring. Common JavaScript/TypeScript, Python, Java, JSON, shell,
CSS, and markup tokens receive semantic palette colors; unknown languages stay
safe plain text. Each block also provides Copy and Download actions; downloads
use a language-specific extension when the language is recognized and `.txt`
otherwise.

User messages expose Copy, Edit, Branch, and Delete actions. Edit restores the
prompt and attachments to the composer while removing that turn and later
responses from the current local transcript. Branch creates a new local session
from the selected message. Delete removes the selected user turn and its
immediate assistant response when present.

Message actions render directly after their message, with user actions aligned
right and assistant actions aligned left. They are hidden until the message is
hovered or focused; `:focus-within` keeps keyboard users able to reveal and use
the same controls.

Assistant controls use Flowbite React-compatible `react-icons` SVG icons. Keep
the icon components semantic and pass `aria-hidden` when adjacent text already
labels the action. Install frontend UI dependencies with `bun add
flowbite-react react-icons` (or the equivalent npm command).

The shared `frontend/src/shared/ui/icon.tsx` registry uses the same icon set for
semantic icons across the frontend. Specialized vehicle silhouettes and brand
artwork remain custom because they are product-specific illustrations.

Map search and directions controls keep fixed icon-button dimensions at narrow
responsive widths so the input can shrink without overlapping the controls.
The route travel-mode selector uses the same consistent SVG icon family for
Car, Motorbike, Suggested, Bike, and Walk.
These mode icons use dedicated vehicle symbols rather than generic action
icons, while retaining the existing liquid selector spacing and active state.

The assistant UI is split into `AssistantChatWindow`,
`AssistantMessageThread`, `AssistantComposer`, `AssistantToolMenu`, and
`AssistantPermissionMenu`. `AssistantChatWindow` owns the internal chat
workspace composition: a compact control header, a collapsible session-history
rail, and the main chat/map context area. The parent assistant keeps SSE stream
state and map-tool orchestration; `useAssistantSessions` owns local session
persistence and selection; extracted components own presentation and local
interaction controls. `AssistantChatWindow` is content inside the existing
`MiniPlatformAside`; it must not create another fixed layer or window shell.
The animated `AssistantPresence` indicator is registered as the chat panel's
`status` content, so its welcome/thinking state renders in the shared
`assistant-aside-status-content` slot above the chat workspace. The message
thread owns messages only and must not render a second presence indicator.
The session-history rail floats above the ChatWindow main area as a bounded glass
popover built with the shared `LiquidCard` primitive. Because it is nested
inside the already blurred assistant aside, it uses the primitive's `nested`
variant to avoid applying a second backdrop blur; opening it does not resize or
reflow the conversation. Its z-index is scoped to the ChatWindow stacking
context rather than the map or outer aside.

The chat panel also shows a compact map-context bar above the conversation. It
reports route planning/calculation state, active stop count, distance, and
duration from the shared route store. When a route is ready it provides Focus
and Clear actions that dispatch the same map commands used by the rail and
assistant tools; it must not summarize arbitrary chat history or create a
second route state source.

The aside participates in the shared Mini Platform window session: its header
is draggable and persists position through `useWindowFrame`, while its left
edge remains the resize handle used by the map split layout.

The collapsed rail also exposes a Shop Window action. It switches the same
aside to the reusable `ShopPlatformContent` search, filter, and place-result
view without changing the standalone shop platform window.

The plus menu also exposes enabled map actions for resetting the map, clearing
route points, and focusing the selected route. These dispatch the existing
browser map-command events.

The backend uses the official `openai` Python client against any
OpenAI-compatible `/v1/chat/completions` endpoint. Local
development defaults are documented in `backend/.env.example`:

```text
AI_BASE_URL=http://127.0.0.1:8888/v1
AI_MODEL=nphearum/PsarAI-2B-GGUF
AI_API_KEY=
AI_TIMEOUT=120
```

The API key stays server-side. Tool names and arguments reach the browser only
as a typed envelope because the browser owns MapLibre and the route store;
arbitrary JavaScript is never sent or evaluated. Configure
`NEXT_PUBLIC_AI_SOCKET_URL` when the backend socket is not at the default
development URL (`ws://127.0.0.1:8100/ws/assistant`). Configure `FASTAPI_URL`
separately for HTTP APIs. Because `.env.local` overrides `.env`, keep these
variables in `.env.local` when using a local override.

## Failure behavior and future work

If the model or tool API is unavailable, the socket returns a short fallback
message; direct map search and routing remain available. This MVP is
single-process and does not yet authenticate stream sessions or persist chat
history. Production hardening should add a short-lived stream ticket and
durable event protocol described in `docs/map-messaging-design.md`, plus
request authentication and rate limiting on `/assistant/tools/execute`.

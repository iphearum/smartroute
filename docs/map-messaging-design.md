# Map-embedded messaging design

## Status and scope

This document defines the next implementation steps for Telegram-style messaging
embedded in the SmartRoute map. It is an architecture and delivery plan, not a
claim that messaging is already implemented.

The first release supports direct and group conversations, reliable text
messages, map locations, replies, reactions, typing, presence, read state, and
attachments. Calls, bots, channels, stories, end-to-end encryption, and secret
chats are outside the initial scope.

## Product experience

Messaging must preserve the map as the primary workspace.

- Add a **Messages** item to the desktop rail in `MapWorkspace` with an unread
  badge.
- Open messaging as a right-side overlay on desktop so the route panel remains
  available. Use a full-height sheet on narrow screens.
- Use three views: conversation list, message thread, and conversation details.
- A location message displays a compact place card with name, coordinates, and
  an optional snapshot. Selecting it closes or minimizes the sheet and focuses
  the map.
- The map context menu and POI preview expose **Share in chat**. Route results
  expose **Share route**.
- A shared location can be added as a route stop. A shared route contains stable
  route inputs rather than only rendered geometry, so the receiver can
  recalculate it.
- Drafts and the active conversation survive closing and reopening the sheet.

The message composer supports text, reply, emoji, attachments, current
location, selected place, and selected route. Optimistic messages show
`sending`, `sent`, `delivered`, `read`, or `failed`, with retry for failures.

## Frontend architecture

Messaging lives under `frontend/src/features/chat`; the generic transport stays
under `frontend/src/shared`.

```text
frontend/src/
  shared/realtime/
    socket-url.ts
    use-socket.ts
  features/chat/
    api/chat-api.ts
    components/chat-sheet.tsx
    components/conversation-list.tsx
    components/message-thread.tsx
    components/message-composer.tsx
    domain/types.ts
    hooks/use-chat.ts
    hooks/use-chat-messages.ts
    hooks/use-chat-presence.ts
    hooks/use-chat-uploads.ts
    store/chat-store.ts
```

`useSocket` owns only connection state, authentication, heartbeat, reconnect
with bounded exponential backoff and jitter, event subscription, and cleanup.
It must not contain message or map behavior.

`useChatMessages` owns pagination, optimistic updates, acknowledgement handling,
deduplication, ordering, reply/edit/delete/reaction operations, and retry.
`useChatPresence` owns presence and typing state. `useChatUploads` owns upload
progress, cancellation, and attachment validation. `useChat` composes these for
UI consumers.

Zustand stores normalized durable client state. High-frequency transient values
such as upload progress and typing expiry may remain local to their hooks. Store
messages by ID and keep ordered ID arrays per conversation to prevent duplicate
objects and expensive whole-thread replacement.

The public composition hook should be convenient without becoming the
implementation boundary:

```ts
const chat = useChat({ activeConversationId });

chat.connection;
chat.conversations;
chat.messages;
chat.typingUsers;
chat.sendMessage(input);
chat.editMessage(messageId, text);
chat.deleteMessage(messageId);
chat.reactToMessage(messageId, emoji);
chat.markAsRead(messageId);
chat.setTyping(true);
chat.loadOlderMessages();
```

## Socket URL contract

The browser must receive a public socket origin through
`NEXT_PUBLIC_REALTIME_URL`. Do not derive a production backend address from the
server-only `FASTAPI_URL`.

The URL builder must:

1. trim surrounding whitespace;
2. resolve relative paths against `window.location.origin`;
3. convert `http:` to `ws:` and `https:` to `wss:`;
4. accept only `ws:` and `wss:` after conversion;
5. preserve configured base paths and safely append `/ws/chat`;
6. add authentication with a short-lived socket ticket, not a long-lived token
   in logs or browser history.

The existing Next route handler at `/api/backend/[...path]` remains for HTTP. It
does not proxy WebSocket upgrades. Deployment must route `/ws/chat` directly to
FastAPI (or through a reverse proxy that supports upgrades).

## Domain model

All IDs are opaque strings. Timestamps are UTC ISO 8601 strings. Coordinates use
`[latitude, longitude]`, matching the current route domain.

```ts
type Conversation = {
  id: string;
  kind: "direct" | "group";
  title: string | null;
  memberIds: string[];
  lastMessageId: string | null;
  lastReadMessageId: string | null;
  unreadCount: number;
  updatedAt: string;
};

type MessageStatus = "sending" | "sent" | "delivered" | "read" | "failed";

type Message = {
  id: string;
  clientId: string;
  conversationId: string;
  senderId: string;
  kind: "text" | "location" | "route" | "attachment" | "system";
  text: string | null;
  payload: LocationPayload | RoutePayload | AttachmentPayload | null;
  replyToId: string | null;
  reactions: Record<string, string[]>;
  status: MessageStatus;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};
```

Every client-created message gets a UUID `clientId`. The server stores a unique
constraint on `(sender_id, client_id)` and returns the canonical message. This
makes retries idempotent and prevents duplicate messages after reconnect.

Location payloads contain coordinates, a display name, address, and optional
place ID. Route payloads contain named waypoints, travel mode, traffic profile,
and optional encoded preview geometry. The receiver recalculates from the
waypoints before navigation.

## HTTP API

HTTP provides initial state, history, mutations that benefit from ordinary
request semantics, and uploads.

```text
POST   /auth/socket-ticket
GET    /conversations?cursor=&limit=
POST   /conversations
GET    /conversations/{id}/messages?before=&limit=
POST   /conversations/{id}/messages
PATCH  /messages/{id}
DELETE /messages/{id}
PUT    /messages/{id}/reactions/{emoji}
DELETE /messages/{id}/reactions/{emoji}
POST   /conversations/{id}/read
POST   /attachments
```

History uses cursor pagination and returns newest-first pages with a stable
cursor. The frontend reverses them for display. Membership authorization is
checked for every conversation and message operation.

## Realtime protocol

The connection endpoint is `GET /ws/chat?ticket=<single-use-ticket>`. Each frame
is an envelope:

```json
{
  "type": "message.created",
  "eventId": "evt_opaque",
  "sequence": 1842,
  "occurredAt": "2026-08-16T10:00:00Z",
  "data": {}
}
```

Initial event types:

- `connection.ready` with the current server sequence;
- `message.created`, `message.updated`, and `message.deleted`;
- `message.ack` mapping `clientId` to the canonical message;
- `reaction.updated`;
- `receipt.delivered` and `receipt.read`;
- `typing.started` and `typing.stopped`;
- `presence.updated`;
- `conversation.created` and `conversation.updated`;
- `ping` and `pong`.

Persisted events carry a monotonic per-user sequence. The client remembers the
last applied sequence and requests catch-up over HTTP after reconnect. Typing
and presence events are ephemeral, have no catch-up, and expire locally.

The client ignores duplicate `eventId` values, buffers short out-of-order gaps,
and falls back to HTTP synchronization when a gap cannot be filled. Never assume
that WebSocket delivery alone is durable.

## Backend and storage

Add FastAPI chat routers, a WebSocket manager, authentication, and persistent
models for users, conversations, members, messages, attachments, reactions,
receipts, and event sequence checkpoints. The current backend has none of these,
so frontend integration must not begin by assuming these endpoints exist.

Use the existing relational database configuration for durable records. A
single-process in-memory connection manager is acceptable only for local MVP
development. Production with multiple workers requires a shared pub/sub layer
such as Redis so events reach sockets connected to other workers.

Uploads use signed or authenticated HTTP requests, size and MIME allowlists,
malware scanning where available, opaque storage keys, and authorization on
download. Do not send file bodies through the WebSocket.

## Security and privacy

- Require authenticated membership for history, mutations, uploads, and socket
  subscription.
- Use short-lived, single-use socket tickets and TLS (`wss`) in production.
- Validate message length, attachment metadata, coordinates, reaction values,
  close codes, and all event payloads on both sides.
- Rate-limit message sends, typing updates, ticket creation, and uploads.
- Do not include access tokens, message bodies, or exact locations in logs.
- Treat live and shared locations as sensitive user data and require explicit
  user action before sharing.
- Enforce server-side deletion and retention rules; client removal is not an
  authorization boundary.

## Accessibility and responsive behavior

The sheet uses a labelled dialog or complementary region depending on whether
it blocks the map. Keyboard focus moves into a modal mobile sheet and returns to
the launcher on close. New messages are announced through a polite live region
without reading the entire thread. Message status and reactions have text
labels, all composer actions are keyboard reachable, and map locations have a
non-map textual representation.

## Delivery plan

### Phase 0: contract and foundation

- Correct and test the generic socket hook, including server rendering, cleanup,
  duplicate connects, URL normalization, heartbeat, and reconnect behavior.
- Add shared domain types and runtime event validation.
- Define authentication and membership before opening the socket endpoint.
- Add unit tests for URL and event reducers.

### Phase 1: reliable text MVP

- Add users, direct conversations, message persistence, history pagination, and
  the realtime endpoint.
- Build the rail launcher, conversation list, thread, and text composer.
- Support optimistic send, acknowledgement, retry, reconnect catch-up, unread
  count, and read receipts.

### Phase 2: map integration

- Share POIs and pinned coordinates from `MapCanvas`.
- Focus the map and add route stops from location messages.
- Share and recalculate route payloads.
- Add responsive desktop overlay and mobile sheet behavior.

### Phase 3: collaboration features

- Add groups, typing, presence, replies, edits, deletes, reactions, attachments,
  search, drafts, and forwarding.
- Add moderation, retention, observability, and multi-worker pub/sub.

Calls, live-location streaming, channels, bots, end-to-end encryption, and other
Telegram-scale capabilities require separate designs after these foundations
are proven.

## Acceptance criteria for the map messaging MVP

- A signed-in user can open messaging without losing map or route state.
- A sent message appears immediately, reaches another connected client once,
  persists across reload, and resolves to a canonical server ID.
- Disconnecting and reconnecting neither loses nor duplicates persisted events.
- A user can share a POI or pin, and the receiver can focus it and add it as a
  route stop.
- A user can share a route, and the receiver can recalculate it from its inputs.
- Unread and read state remains consistent across two browser sessions.
- Unauthorized users cannot read, send to, or subscribe to a conversation.
- Keyboard and screen-reader users can open, read, compose, send, and close chat.
- Unit tests cover reducers, ordering, deduplication, URL construction, and
  reconnect behavior; integration tests cover persistence and authorization;
  an end-to-end test covers map-location sharing between two users.


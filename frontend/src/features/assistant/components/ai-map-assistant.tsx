"use client";

import { useEffect, useRef, useState } from "react";
import type { Place, TravelMode } from "@/features/routes/domain/types";
import {
  assistantApi,
  type AssistantToolAction,
  type AssistantToolName,
} from "@/features/assistant/api/assistant-api";
import { routesApi } from "@/features/routes/api/routes-api";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useAppShell } from "@/shared/state/app-shell-context";
import { useLocalStore } from "@/shared/hooks/use-local-store";
import { createClientId } from "@/shared/lib/id";
import {
  MiniPlatformDock,
  type MiniPlatformPanel,
} from "@/shared/ui/mini-platform-dock";
import {
  ShopPlatformContent,
  type ShopFilter,
} from "@/features/shops/components/shop-platform-content";
import { isShopPlace } from "@/features/shops/lib/shop-place";
import { AssistantComposer } from "./assistant-composer";
import { AssistantMessageThread } from "./assistant-message-thread";
import { AssistantContextBar } from "./assistant-context-bar";
import { AssistantChatWindow } from "./assistant-chat-window";
import { AssistantPresence } from "./assistant-presence";
import type {
  AssistantAction,
  AssistantActivity,
  ChatAttachment,
  ChatItem,
  PendingToolCall,
  PermissionMode,
  ReasoningMode,
} from "./assistant-types";
import { useAssistantSessions } from "../hooks/use-assistant-sessions";
import {
  beginStreamingSpeech,
  enqueueStreamingSpeech,
  finishStreamingSpeech,
  stopAssistantSpeech,
} from "../lib/assistant-speech";
import {
  ASSISTANT_CONTEXT_TOKEN_LIMIT,
  contextPayload,
  estimateContextTokens,
} from "../lib/context-budget";
import {
  type StreamEvent,
} from "../lib/assistant-stream";

/** Ids of the dock panels below; `chat` is the default view. */
type AsideView = "chat" | "shops";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isReasoningMode = (value: unknown): value is ReasoningMode =>
  value === "off" || value === "auto" || value === "high";

export function AiMapAssistant({
  onOpenChange,
  asideWidth = 400,
  onAsideWidthChange,
}: {
  onOpenChange?: (open: boolean) => void;
  asideWidth?: number;
  onAsideWidthChange?: (width: number) => void;
}) {
  const [input, setInput] = useState("");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [permissionMenuOpen, setPermissionMenuOpen] = useState(false);
  const [thinkingMenuOpen, setThinkingMenuOpen] = useState(false);
  const [permissionMode, setPermissionMode] =
    useState<PermissionMode>("automatic");
  const [reasoningMode, setReasoningMode] = useLocalStore<ReasoningMode>(
    "smartroute-ai-reasoning-mode",
    "auto",
    isReasoningMode,
  );
  const [audioResponseEnabled, setAudioResponseEnabled] = useLocalStore(
    "smartroute-ai-audio-response-enabled",
    false,
    isBoolean,
  );
  const [turnActivities, setTurnActivities] = useState<AssistantActivity[]>([]);
  const permissionModeRef = useRef(permissionMode);
  const [pendingToolCall, setPendingToolCall] =
    useState<PendingToolCall | null>(null);
  const {
    sessions,
    activeSessionId,
    messages,
    setMessages,
    setSessions,
    clientKey,
    startNewChat: createNewChat,
    selectChatSession: changeSession,
    branchChatSession,
    deleteChatSession: removeChatSession,
  } = useAssistantSessions();
  const [asideOpen, setAsideOpen] = useState(false);
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [asideView, setAsideView] = useState<AsideView>("chat");
  const [shopQuery, setShopQuery] = useState("");
  const [shopFilter, setShopFilter] = useState<ShopFilter>("all");
  const [shopPlaces, setShopPlaces] = useState<Place[]>([]);
  const [shopLoading, setShopLoading] = useState(false);
  const streamAbort = useRef<AbortController | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const streamingMessageId = useRef<string | null>(null);
  const messagesRef = useRef(messages);
  const unfinishedTextRef = useRef(new Map<string, string>());
  const unfinishedReasoningRef = useRef(new Map<string, string>());
  const turnActivitiesRef = useRef<AssistantActivity[]>([]);
  const reasoningRoundBreakRef = useRef(false);
  const threadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const language = useAppShell((state) => state.language);
  const languageRef = useRef(language);
  const audioResponseEnabledRef = useRef(audioResponseEnabled);
  const { calculateAll } = useRouteCalculation();
  messagesRef.current = messages;
  permissionModeRef.current = permissionMode;
  languageRef.current = language;
  audioResponseEnabledRef.current = audioResponseEnabled;
  const contextTokens = estimateContextTokens(messages);

  useEffect(() => {
    if (!audioResponseEnabled) stopAssistantSpeech();
  }, [audioResponseEnabled]);

  const commitActivities = (activities: AssistantActivity[]) => {
    turnActivitiesRef.current = activities;
    setTurnActivities(activities);
  };

  const recordActivity = (next: Omit<AssistantActivity, "active">) => {
    commitActivities([...turnActivitiesRef.current, { ...next, active: true }]);
  };

  /** Close out the step a tool result belongs to instead of adding a row. */
  const resolveActivity = (toolCallId: string, status: "done" | "error") => {
    commitActivities(
      turnActivitiesRef.current.map((item) =>
        item.toolCallId === toolCallId
          ? { ...item, active: false, status }
          : item,
      ),
    );
  };

  /** Stream the reasoning summary into the open thinking step. */
  const updateThinkingDetail = (detail: string) => {
    const activities = turnActivitiesRef.current;
    const index = activities.findIndex(
      (item) => item.kind === "thinking" && item.active !== false,
    );
    if (index < 0) {
      commitActivities([
        ...activities,
        {
          kind: "thinking",
          label: "Thinking…",
          startedAt: Date.now(),
          active: true,
          detail,
        },
      ]);
      return;
    }
    commitActivities(
      activities.map((item, position) =>
        position === index ? { ...item, detail } : item,
      ),
    );
  };

  const handleAsideOpenChange = (open: boolean) => {
    setAsideOpen(open);
    if (!open) setAsideView("chat");
    onOpenChange?.(open);
  };

  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, turnActivities]);

  useEffect(() => {
    if (!asideOpen || asideView !== "shops") return;
    const value = shopQuery.trim();
    let cancelled = false;
    setShopLoading(true);
    const request =
      value.length >= 2
        ? routesApi.search(value, 18).then((response) => response.results)
        : routesApi.places(120);
    request
      .then((items) => {
        if (!cancelled) setShopPlaces(items.filter(isShopPlace));
      })
      .catch(() => {
        if (!cancelled) setShopPlaces([]);
      })
      .finally(() => {
        if (!cancelled) setShopLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asideOpen, asideView, shopQuery]);

  useEffect(() => {
    setConnected(asideOpen);
    if (asideOpen) return;
    streamAbort.current?.abort();
    streamAbort.current = null;
    setBusy(false);
    stopAssistantSpeech();
    commitActivities([]);
    streamingMessageId.current = null;
  }, [asideOpen]);

  const finishAssistantMessage = (frame: AssistantFrame) => {
    if (!frame.data) return;
    const id = frame.id || streamingMessageId.current;
    const unfinished = id ? unfinishedTextRef.current.get(id) : undefined;
    const reasoning = id ? unfinishedReasoningRef.current.get(id) : undefined;
    const activities = turnActivitiesRef.current.map((item) => ({
      ...item,
      active: false,
    }));
    // A turn that only ran tools has no prose to show; "I’m ready." reads as
    // if nothing happened, so the completed work is acknowledged instead.
    const fallback = activities.some((item) => item.kind === "tool")
      ? "Done — the map is updated."
      : "I’m ready.";
    setMessages((current) => {
      const existing = id
        ? current.findIndex((message) => message.id === id)
        : -1;
      const next =
        existing < 0
          ? [
              ...current,
              {
                id: id ?? undefined,
                role: "assistant" as const,
                text: frame.data?.message || unfinished || fallback,
                reasoning: reasoning || undefined,
                action: frame.data?.action,
                activities,
              },
            ]
          : current.map((message, index) =>
              index === existing
                ? {
                    ...message,
                    text: frame.data?.message || unfinished || message.text,
                    reasoning: reasoning || message.reasoning,
                    action: frame.data?.action ?? message.action,
                    activities: activities.length ? activities : message.activities,
                    streaming: false,
                  }
                : message,
            );
      messagesRef.current = next;
      return next;
    });
    if (id) unfinishedTextRef.current.delete(id);
    if (id) unfinishedReasoningRef.current.delete(id);
    commitActivities([]);
    streamingMessageId.current = null;
    setBusy(false);
  };

  const submitToolResult = async (
    streamId: string,
    toolCallId: string,
    result: Parameters<typeof assistantApi.submitToolResult>[2],
  ) => {
    // The result has to go back over the transport that asked for it. A socket
    // turn is waiting on a frame, and the HTTP bridge has no stream registered
    // for it, so posting there answers nobody and stalls the turn until the
    // backend's tool timeout expires.
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: "assistant.tool_result",
          id: toolCallId,
          data: result,
        }),
      );
      return;
    }
    await assistantApi.submitToolResult(streamId, toolCallId, result);
  };

  const executeToolCall = async (
    streamId: string,
    toolCallId: string,
    name: AssistantToolName,
    arguments_: Record<string, unknown>,
  ) => {
    try {
      const result = await assistantApi.executeTool(name, arguments_);
      let toolResult = result;
      if (result.action) {
        const location = await applyAction(result.action);
        if (location) toolResult = { ...result, location };
        setMessages((current) =>
          current.map((message) =>
            message.id === streamId
              ? { ...message, action: result.action }
              : message,
          ),
        );
      }
      await submitToolResult(streamId, toolCallId, toolResult);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Tool execution failed";
      try {
        await submitToolResult(streamId, toolCallId, { error: message });
      } catch (submitError) {
        console.error("Assistant tool result was not delivered", submitError);
      }
    }
  };

  const approvePendingTool = () => {
    if (!pendingToolCall || !pendingToolCall.frameId) return;
    const pending = pendingToolCall;
    const streamId = pending.frameId!;
    setPendingToolCall(null);
    void executeToolCall(
      streamId,
      pending.toolCallId,
      pending.name as AssistantToolName,
      pending.arguments,
    );
  };

  const rejectPendingTool = () => {
    if (!pendingToolCall || !pendingToolCall.frameId) return;
    void submitToolResult(pendingToolCall.frameId, pendingToolCall.toolCallId, {
      error: "The user declined this map action.",
    }).catch((error) =>
      console.error("Assistant tool result was not delivered", error),
    );
    setPendingToolCall(null);
  };

  const handleStreamEvent = (streamId: string, event: StreamEvent) => {
    if (event.type === "reasoning") {
      appendReasoningDelta(
        { id: streamId, data: { text: event.delta } },
        messagesRef,
        unfinishedReasoningRef,
        streamingMessageId,
        setMessages,
        updateThinkingDetail,
        reasoningRoundBreakRef,
      );
      return;
    }
    if (event.type === "content") {
      appendDelta(
        { id: streamId, data: { text: event.delta } },
        messagesRef,
        unfinishedTextRef,
        streamingMessageId,
        setMessages,
        unfinishedReasoningRef,
        audioResponseEnabledRef.current ? enqueueStreamingSpeech : undefined,
      );
      return;
    }
    if (event.type === "tool" && event.status === "start") {
      const name = event.name as AssistantToolName;
      const toolCallId = event.toolCallId;
      if (!toolCallId || !name) return;
      const arguments_ = event.arguments || {};
      // A tool round ends the current thought; the next one starts a paragraph.
      reasoningRoundBreakRef.current = true;
      const requiresApproval =
        name !== "search_places" &&
        name !== "search_web" &&
        permissionModeRef.current === "ask";
      if (requiresApproval) {
        setPendingToolCall({
          frameId: streamId,
          toolCallId,
          name,
          arguments: arguments_,
        });
      } else if (permissionModeRef.current === "disabled") {
        void submitToolResult(streamId, toolCallId, {
          error: "Assistant map tools are disabled.",
        }).catch((error) =>
          console.error("Assistant tool result was not delivered", error),
        );
      } else {
        void executeToolCall(streamId, toolCallId, name, arguments_);
      }
      return;
    }
    if (event.type === "done") {
      if (audioResponseEnabledRef.current) finishStreamingSpeech();
      finishAssistantMessage({
        id: streamId,
        data: {
          message: event.message,
          action: event.action as AssistantAction,
        },
      });
    }
  };

  const handleSocketFrame = (frame: {
    type?: string;
    id?: string;
    data?: Record<string, unknown>;
  }) => {
    const streamId = frame.id || streamingMessageId.current || "";
    if (!streamId) return;
    const data = frame.data || {};
    if (frame.type === "assistant.activity") {
      const kind = data.kind === "tool" ? "tool" : "thinking";
      const toolCallId =
        typeof data.toolCallId === "string" ? data.toolCallId : undefined;
      if (data.status === "done" || data.status === "error") {
        if (toolCallId) resolveActivity(toolCallId, data.status);
        return;
      }
      const alreadyThinking =
        kind === "thinking" &&
        turnActivitiesRef.current.some((item) => item.kind === "thinking");
      if (!alreadyThinking) {
        recordActivity({
          kind,
          label: String(data.label || (kind === "tool" ? "Using a tool" : "Thinking…")),
          detail: typeof data.detail === "string" ? data.detail : undefined,
          startedAt: Date.now(),
          toolCallId,
        });
      }
      return;
    }
    if (frame.type === "assistant.error") {
      finishAssistantMessage({
        id: streamId,
        data: { message: String(data.message || "Assistant request failed.") },
      });
      return;
    }
    const eventTypeMap = {
      "assistant.delta": "content",
      "assistant.reasoning_delta": "reasoning",
      "assistant.tool_call": "tool",
      "assistant.usage": "usage",
      "assistant.done": "done",
    } as const;
    const eventType = eventTypeMap[frame.type as keyof typeof eventTypeMap] ?? null;
    if (!eventType) return;
    handleStreamEvent(streamId, {
      type: eventType,
      delta: typeof data.text === "string" ? data.text : undefined,
      name: typeof data.name === "string" ? data.name : undefined,
      status: frame.type === "assistant.tool_call" ? "start" : undefined,
      toolCallId: typeof data.toolCallId === "string" ? data.toolCallId : undefined,
      arguments: data.arguments as Record<string, unknown> | undefined,
      message: typeof data.message === "string" ? data.message : undefined,
      action: data.action,
      input: typeof data.prompt_tokens === "number" ? data.prompt_tokens : undefined,
      output: typeof data.completion_tokens === "number" ? data.completion_tokens : undefined,
    } as StreamEvent);
  };

  const socketFrameHandler = useRef(handleSocketFrame);
  socketFrameHandler.current = handleSocketFrame;

  useEffect(() => {
    if (!asideOpen || typeof window === "undefined") return;
    const configured = process.env.NEXT_PUBLIC_AI_SOCKET_URL?.trim();
    const url = configured || `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws/assistant`;
    const socket = new WebSocket(url);
    socketRef.current = socket;
    socket.onopen = () => setConnected(true);
    socket.onmessage = (event) => {
      try {
        socketFrameHandler.current(JSON.parse(event.data) as { type?: string; id?: string; data?: Record<string, unknown> });
      } catch (error) {
        console.error("Invalid assistant socket message", error);
      }
    };
    socket.onerror = () => setConnected(false);
    socket.onclose = () => {
      if (socketRef.current === socket) socketRef.current = null;
      setConnected(false);
    };
    return () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [asideOpen]);

  const transmit = async (
    text: string,
    messageAttachments: ChatAttachment[],
    addUserMessage: boolean,
  ) => {
    const clientId = createClientId("stream");
    streamingMessageId.current = clientId;
    unfinishedTextRef.current.set(clientId, "");
    unfinishedReasoningRef.current.set(clientId, "");
    commitActivities([]);
    reasoningRoundBreakRef.current = false;
    if (audioResponseEnabledRef.current) beginStreamingSpeech();
    const userMessage: ChatItem = {
      id: `user-${clientId}`,
      role: "user",
      text: text || "Attached files",
      attachments: messageAttachments,
    };
    const nextMessages = addUserMessage
      ? [...messagesRef.current, userMessage]
      : messagesRef.current;
    if (addUserMessage) {
      messagesRef.current = nextMessages;
      setMessages(nextMessages);
    }
    setBusy(true);
    const controller = new AbortController();
    streamAbort.current?.abort();
    streamAbort.current = controller;
    try {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        throw new Error("Assistant socket is not connected");
      }
      socket.send(
        JSON.stringify({
          type: "chat.message",
          clientId,
          language: languageRef.current,
          reasoningMode,
          text,
          messages: contextPayload(nextMessages),
          attachments: messageAttachments.map(
            ({ id, name, type, size, dataUrl, text: fileText }) => ({
              id,
              name,
              type,
              size,
              dataUrl,
              text: fileText,
            }),
          ),
        }),
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        stopAssistantSpeech();
        console.error("Assistant stream failed", error);
        finishAssistantMessage({
          id: clientId,
          data: {
            message:
              "I couldn't connect to the assistant service. Please check that the FastAPI backend is running on port 8100 and try again.",
          },
        });
      }
    } finally {
      if (streamAbort.current === controller) streamAbort.current = null;
    }
  };

  const send = () => {
    const text = input.trim();
    if (
      busy ||
      (!text && !attachments.length) ||
      !connected
    )
      return;
    transmit(text, attachments, true);
    setInput("");
    setAttachments([]);
    setComposerMenuOpen(false);
  };

  const deleteMessage = (messageId: string) => {
    if (busy) return;
    const current = messagesRef.current;
    const index = current.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const removeCount = current[index]?.role === "user" && current[index + 1]?.role === "assistant" ? 2 : 1;
    const next = current.filter((_, itemIndex) => itemIndex < index || itemIndex >= index + removeCount);
    messagesRef.current = next;
    setMessages(next);
  };

  const editMessage = (messageId: string) => {
    if (busy) return;
    const current = messagesRef.current;
    const index = current.findIndex((message) => message.id === messageId);
    const message = current[index];
    if (!message || message.role !== "user") return;
    setInput(message.text === "Attached files" ? "" : message.text);
    setAttachments(message.attachments ?? []);
    const next = current.slice(0, index);
    messagesRef.current = next;
    setMessages(next);
  };

  const branchFromMessage = (messageId: string) => {
    if (busy) return;
    const index = messagesRef.current.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    branchChatSession(messagesRef.current.slice(0, index + 1));
    setInput("");
    setAttachments([]);
    setPendingToolCall(null);
  };

  const retryAssistantMessage = (messageId: string) => {
    if (busy || !connected) return;
    const current = messagesRef.current;
    const index = current.findIndex((message) => message.id === messageId);
    const userMessage = index > 0 ? current[index - 1] : undefined;
    if (!userMessage || userMessage.role !== "user") return;
    const next = current.filter((message) => message.id !== messageId);
    messagesRef.current = next;
    setMessages(next);
    transmit(userMessage.text === "Attached files" ? "" : userMessage.text, userMessage.attachments ?? [], false);
  };

  const addFiles = async (files: FileList | File[]) => {
    const next: ChatAttachment[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > 5 * 1024 * 1024) continue;
      const attachment: ChatAttachment = {
        id: createClientId("attachment"),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
      };
      if (file.type.startsWith("image/"))
        attachment.dataUrl = await readDataUrl(file);
      else if (
        file.type.startsWith("text/") ||
        /\.(md|json|csv|ts|tsx|js|py|css|html)$/i.test(file.name)
      )
        attachment.text = (await file.text()).slice(0, 64_000);
      next.push(attachment);
    }
    setAttachments((current) => [...current, ...next].slice(0, 5));
  };

  const applyPlace = (place: Place) => {
    const index = useRouteStore.getState().activePoint;
    useRouteStore.getState().setPoint(index, place);
    window.dispatchEvent(
      new CustomEvent("smartroute:focus-coordinate", {
        detail: { latitude: place.latitude, longitude: place.longitude },
      }),
    );
  };

  const applyRoute = async (stops: Place[], mode?: TravelMode) => {
    if (stops.length < 2) return;
    const route = useRouteStore.getState();
    route.setMode(mode || route.mode);
    stops.slice(0, 7).forEach((stop, index) => route.setPoint(index, stop));
    await calculateAll(
      stops.slice(0, 7).map((stop) => [stop.latitude, stop.longitude]),
    );
    window.dispatchEvent(new CustomEvent("smartroute:focus-selected-route"));
  };

  const requestCurrentLocation = () =>
    new Promise<{ latitude: number; longitude: number; accuracy?: number }>(
      (resolve, reject) => {
        if (!window.isSecureContext) {
          reject(new Error("Location requires a secure HTTPS connection."));
          return;
        }
        if (!navigator.geolocation) {
          reject(new Error("Location is not available on this device."));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            const location = {
              latitude: coords.latitude,
              longitude: coords.longitude,
              accuracy: coords.accuracy,
            };
            window.dispatchEvent(
              new CustomEvent("smartroute:show-current-location", {
                detail: location,
              }),
            );
            resolve(location);
          },
          (error) => {
            const message =
              error.code === error.PERMISSION_DENIED
                ? "Location access was denied. Allow it in device Settings, then try again."
                : "Your current location is unavailable. Check Location Services.";
            window.dispatchEvent(
              new CustomEvent("smartroute:location-error", {
                detail: message,
              }),
            );
            reject(new Error(message));
          },
          { enableHighAccuracy: true, timeout: 20_000, maximumAge: 60_000 },
        );
      },
    );

  const applyAction = async (action: AssistantToolAction) => {
    if (action.type === "search" || action.type === "web_search") return;
    if (action.type === "point") return applyPlace(action.place);
    if (action.type === "route") return applyRoute(action.stops, action.mode);
    if (action.type === "focus") {
      window.dispatchEvent(
        new CustomEvent("smartroute:focus-coordinate", { detail: action }),
      );
      return;
    }
    if (action.type === "location_request") return requestCurrentLocation();
    window.dispatchEvent(
      new CustomEvent(
        action.command === "reset_map_view"
          ? "smartroute:reset-map-view"
          : "smartroute:clear-route-points",
      ),
    );
  };

  const runMapAction = (action: "reset" | "clear" | "focus") => {
    const events = {
      reset: "smartroute:reset-map-view",
      clear: "smartroute:clear-route-points",
      focus: "smartroute:focus-selected-route",
    } as const;
    window.dispatchEvent(new CustomEvent(events[action]));
  };

  const startNewChat = () => {
    if (busy) return;
    createNewChat();
    setInput("");
    setAttachments([]);
    setPendingToolCall(null);
  };

  const selectChatSession = (sessionId: string) => {
    if (busy || sessionId === activeSessionId) return;
    changeSession(sessionId);
    setInput("");
    setAttachments([]);
    setPendingToolCall(null);
  };

  const deleteChatSession = (sessionId: string) => {
    if (busy) return;
    removeChatSession(sessionId);
    setInput("");
    setAttachments([]);
    setPendingToolCall(null);
  };

  const syncChatSession = async () => {
    if (!clientKey || !activeSessionId || syncing) return;
    const session = sessions.find((item) => item.id === activeSessionId);
    if (!session) return;
    setSyncing(true);
    try {
      const syncMessages = session.messages.map(({ role, text }) => ({
        role,
        text,
      }));
      const remote = session.serverId
        ? await assistantApi.saveSession(clientKey, {
            id: session.serverId,
            title: session.title,
            messages: syncMessages,
          })
        : await assistantApi.createSession(
            clientKey,
            session.title,
            syncMessages,
          );
      setSessions((current) =>
        current.map((item) =>
          item.id === session.id ? { ...item, serverId: remote.id } : item,
        ),
      );
    } finally {
      setSyncing(false);
    }
  };

  const panels: MiniPlatformPanel[] = [
    {
      id: "chat",
      railLabel: "MAP AI",
      icon: "spark",
      title: "Map copilot",
      ariaLabel: "AI map copilot",
      status: <AssistantPresence busy={busy} compact />,
      content: (
        <AssistantChatWindow
          sessions={sessions}
          activeSessionId={activeSessionId}
          activeSessionTitle={
            sessions.find((session) => session.id === activeSessionId)?.title ||
            "New chat"
          }
          connectionStatus={
            <div
              className={`assistant-connection-status ${connected ? "is-ready" : "is-connecting"}`}
              role="status"
              aria-live="polite"
            >
              <span className="assistant-connection-dot" aria-hidden="true" />
              <span>{connected ? "Ready" : "Connecting…"}</span>
            </div>
          }
          historyOpen={chatHistoryOpen}
          syncing={syncing}
          onHistoryToggle={() => setChatHistoryOpen((open) => !open)}
          onNewChat={startNewChat}
          onSelectSession={selectChatSession}
          onDeleteSession={deleteChatSession}
          onSync={() => void syncChatSession()}
          contextTokens={contextTokens}
          contextTokenLimit={ASSISTANT_CONTEXT_TOKEN_LIMIT}
        >
          <AssistantContextBar />
          <AssistantMessageThread
            messages={messages}
            threadRef={threadRef}
            onPlaceSelect={applyPlace}
            onRouteSelect={applyRoute}
            pendingToolCall={pendingToolCall}
            onApproveTool={approvePendingTool}
            onRejectTool={rejectPendingTool}
            onRetry={retryAssistantMessage}
            onDelete={deleteMessage}
            onEdit={editMessage}
            onBranch={branchFromMessage}
            activities={turnActivities}
          />
          <AssistantComposer
            input={input}
            onInputChange={setInput}
            busy={busy}
            connected={connected}
            attachments={attachments}
            setAttachments={setAttachments}
            composerMenuOpen={composerMenuOpen}
            setComposerMenuOpen={setComposerMenuOpen}
            permissionMenuOpen={permissionMenuOpen}
            setPermissionMenuOpen={setPermissionMenuOpen}
            permissionMode={permissionMode}
            setPermissionMode={setPermissionMode}
            reasoningMode={reasoningMode}
            setReasoningMode={setReasoningMode}
            thinkingMenuOpen={thinkingMenuOpen}
            setThinkingMenuOpen={setThinkingMenuOpen}
            audioResponseEnabled={audioResponseEnabled}
            setAudioResponseEnabled={setAudioResponseEnabled}
            fileInputRef={fileInputRef}
            onAddFiles={addFiles}
            onSend={send}
            onMapAction={runMapAction}
            onMapSearch={() => setInput((value) => value || "Find ")}
            onWebSearch={() => setInput((value) => value || "Search the internet for ")}
          />
        </AssistantChatWindow>
      ),
    },
    {
      id: "shops",
      railLabel: "SHOPS",
      icon: "box",
      title: "Shops, restaurants & stores",
      ariaLabel: "Shop window",
      status: (
        <p className="assistant-aside-status">
          Explore places on the map and open their details.
        </p>
      ),
      content: (
        <div className="flex min-h-0 flex-1 flex-col">
          <ShopPlatformContent
            query={shopQuery}
            onQueryChange={setShopQuery}
            filter={shopFilter}
            onFilterChange={setShopFilter}
            places={shopPlaces}
            loading={shopLoading}
            onPlaceSelect={(place) => {
              window.dispatchEvent(
                new CustomEvent("smartroute:open-place-detail", {
                  detail: place,
                }),
              );
              handleAsideOpenChange(false);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <MiniPlatformDock
      windowId="ai-assistant-window"
      panels={panels}
      activeId={asideView}
      onActiveChange={(id) => setAsideView(id as AsideView)}
      open={asideOpen}
      onOpenChange={handleAsideOpenChange}
      width={asideWidth}
      onWidthChange={onAsideWidthChange}
      minHeight={360}
    />
  );
}

async function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function appendDelta(
  frame: AssistantFrame,
  messagesRef: React.MutableRefObject<ChatItem[]>,
  unfinishedTextRef: React.MutableRefObject<Map<string, string>>,
  streamingMessageId: React.MutableRefObject<string | null>,
  setMessages: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  unfinishedReasoningRef: React.MutableRefObject<Map<string, string>>,
  onSpeechDelta?: (delta: string) => void,
) {
  if (!frame.data) return;
  const id = frame.id || streamingMessageId.current;
  if (!id) return;
  const delta = frame.data.text || frame.data.delta || frame.data.content || "";
  if (!delta) return;
  onSpeechDelta?.(delta);
  const text = `${unfinishedTextRef.current.get(id) || ""}${delta}`;
  unfinishedTextRef.current.set(id, text);
  const current = messagesRef.current;
  const existing = current.findIndex((message) => message.id === id);
  const next =
    existing < 0
      ? [
          ...current,
          {
            id,
            role: "assistant" as const,
            text,
            reasoning: unfinishedReasoningRef.current.get(id) || undefined,
            streaming: true,
          },
        ]
      : current.map((message, index) =>
          index === existing ? { ...message, text, streaming: true } : message,
        );
  messagesRef.current = next;
  setMessages(next);
}

function appendReasoningDelta(
  frame: AssistantFrame,
  messagesRef: React.MutableRefObject<ChatItem[]>,
  unfinishedReasoningRef: React.MutableRefObject<Map<string, string>>,
  streamingMessageId: React.MutableRefObject<string | null>,
  setMessages: React.Dispatch<React.SetStateAction<ChatItem[]>>,
  updateThinkingDetail: (detail: string) => void,
  reasoningRoundBreakRef: React.MutableRefObject<boolean>,
) {
  if (!frame.data) return;
  const id = frame.id || streamingMessageId.current;
  const delta = frame.data.text || frame.data.delta || "";
  if (!id || !delta) return;
  const previous = unfinishedReasoningRef.current.get(id) || "";
  const separator = reasoningRoundBreakRef.current && previous ? "\n\n" : "";
  reasoningRoundBreakRef.current = false;
  const reasoning = `${previous}${separator}${delta}`;
  unfinishedReasoningRef.current.set(id, reasoning);
  // Reasoning arrives before the first answer token, so the thinking step is
  // opened here when the turn has no activity of its own yet.
  updateThinkingDetail(reasoning);
  const existing = messagesRef.current.findIndex(
    (message) => message.id === id,
  );
  if (existing < 0) return;
  const next = messagesRef.current.map((message, index) =>
    index === existing ? { ...message, reasoning } : message,
  );
  messagesRef.current = next;
  setMessages(next);
}

type AssistantFrame = {
  type?: string;
  id?: string;
  data?: {
    text?: string;
    delta?: string;
    content?: string;
    message?: string;
    thinking?: boolean;
    kind?: "thinking" | "tool";
    label?: string;
    detail?: string;
    action?: AssistantAction;
    toolCallId?: string;
    name?: AssistantToolName;
    arguments?: Record<string, unknown>;
  };
};

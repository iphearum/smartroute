"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Place, TravelMode } from "@/features/routes/domain/types";
import { useRouteCalculation } from "@/features/routes/hooks/use-route-calculation";
import { useRouteStore } from "@/features/routes/store/route-store";
import { useWindowFrame } from "@/shared/hooks/use-window-frame";
import { Icon } from "@/shared/ui/icon";
import { WindowResizeHandles } from "@/shared/ui/window-resize-handles";

type Action = { type: "search"; query: string; results?: Place[] } | { type: "route"; stops: Place[]; mode?: TravelMode } | null;
type RouteAction = Extract<Exclude<Action, null>, { type: "route" }>;
type ChatItem = { id?: string; role: "user" | "assistant"; text: string; action?: Action; streaming?: boolean };
const historyStorageKey = "smartroute-ai-map-history";
const socketOrigin = () => {
  const configured = process.env.NEXT_PUBLIC_AI_SOCKET_URL?.trim();
  if (configured) return configured.replace(/^http/, "ws").replace(/\/$/, "");
  return typeof window === "undefined" ? "ws://127.0.0.1:8000/ws/assistant" : `ws://${window.location.hostname}:8000/ws/assistant`;
};

export function AiMapAssistant() {
  const [input, setInput] = useState(""), [connected, setConnected] = useState(false), [busy, setBusy] = useState(false), [historyHydrated, setHistoryHydrated] = useState(false);
  const [messages, setMessages] = useState<ChatItem[]>([{ role: "assistant", text: "Tell me what you want to find or where you want to go. I’ll place it on the map." }]);
  const socket = useRef<WebSocket | null>(null);
  const streamingMessageId = useRef<string | null>(null);
  const messagesRef = useRef<ChatItem[]>([]);
  const unfinishedTextRef = useRef(new Map<string, string>());
  const threadRef = useRef<HTMLDivElement | null>(null);
  messagesRef.current = messages;
  const { calculateAll } = useRouteCalculation();
  const { windowRef, entry, zIndex, frameStyle, sized, dragHandleProps, resizeHandleProps, update, setOpen, bringToFront } = useWindowFrame("ai-assistant-window", { minHeight: 360 });
  const open = entry.open, maximized = entry.maximized;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(historyStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as ChatItem[];
        if (Array.isArray(parsed)) setMessages(parsed.slice(-24));
      }
    } catch {}
    setHistoryHydrated(true);
  }, []);

  useEffect(() => {
    if (historyHydrated) localStorage.setItem(historyStorageKey, JSON.stringify(messages.slice(-24)));
  }, [historyHydrated, messages]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const ws = new WebSocket(socketOrigin());
    socket.current = ws;
    ws.onopen = () => {
      setConnected(true);
      try {
        const saved = localStorage.getItem(historyStorageKey);
        const previous = saved ? (JSON.parse(saved) as ChatItem[]) : [];
        ws.send(JSON.stringify({ type: "chat.history", messages: previous.slice(-16).map(({ role, text }) => ({ role, text })) }));
      } catch {}
    };
    ws.onclose = () => { setConnected(false); setBusy(false); streamingMessageId.current = null; };
    ws.onmessage = (event) => {
      const frame = JSON.parse(event.data) as { type?: string; id?: string; data?: { text?: string; delta?: string; content?: string; message?: string; action?: Action } };
      if (!frame.type) return;
      if (frame.type === "assistant.start") {
        streamingMessageId.current = frame.id || null;
        if (frame.id) unfinishedTextRef.current.set(frame.id, "");
        setBusy(true);
      } else if (frame.type === "assistant.delta") {
        if (!frame.data) return;
        const id = frame.id || streamingMessageId.current;
        if (!id) return;
        const delta = frame.data.text || frame.data.delta || frame.data.content || "";
        if (!delta) return;
        const unfinished = `${unfinishedTextRef.current.get(id) || ""}${delta}`;
        unfinishedTextRef.current.set(id, unfinished);
        const current = messagesRef.current;
        const existing = current.findIndex((message) => message.id === id);
        const next = existing < 0
          ? [...current, { id, role: "assistant" as const, text: unfinished, streaming: true }]
          : current.map((message, index) => index === existing ? { ...message, text: unfinished, streaming: true } : message);
        messagesRef.current = next;
        setMessages(next);
      } else if (frame.type === "assistant.done" || frame.type === "assistant.message") {
        if (!frame.data) return;
        const id = frame.id || streamingMessageId.current;
        const unfinished = id ? unfinishedTextRef.current.get(id) : undefined;
        setMessages((current) => {
          const existing = id ? current.findIndex((message) => message.id === id) : -1;
          const next = existing < 0
            ? [...current, { id: id ?? undefined, role: "assistant" as const, text: frame.data?.message || unfinished || "I’m ready.", action: frame.data?.action }]
            : current.map((message, index) => index === existing ? { ...message, text: frame.data?.message || unfinished || message.text, action: frame.data?.action, streaming: false } : message);
          messagesRef.current = next;
          return next;
        });
        if (id) unfinishedTextRef.current.delete(id);
        streamingMessageId.current = null;
        setBusy(false);
      }
    };
    return () => { ws.close(); socket.current = null; setConnected(false); };
  }, [open]);

  const send = () => {
    const text = input.trim();
    if (busy || !text || !socket.current || socket.current.readyState !== WebSocket.OPEN) return;
    const clientId = crypto.randomUUID();
    setMessages((current) => [...current, { id: `user-${clientId}`, role: "user", text }]);
    socket.current.send(JSON.stringify({ type: "chat.message", clientId, text }));
    setInput("");
  };
  const applyPlace = (place: Place) => {
    const index = useRouteStore.getState().activePoint;
    useRouteStore.getState().setPoint(index, place);
    window.dispatchEvent(new CustomEvent("smartroute:focus-coordinate", { detail: { latitude: place.latitude, longitude: place.longitude } }));
  };
  const applyRoute = async (stops: Place[], mode?: TravelMode) => {
    if (stops.length < 2) return;
    const route = useRouteStore.getState();
    route.setMode(mode || route.mode);
    stops.slice(0, 7).forEach((stop, index) => route.setPoint(index, stop));
    await calculateAll(stops.slice(0, 7).map((stop) => [stop.latitude, stop.longitude]));
    window.dispatchEvent(new CustomEvent("smartroute:focus-selected-route"));
  };

  return <>
    <div className="ai-jarvis-launcher opacity-35 absolute bottom-[calc(var(--floating-controls-bottom))] left-1/2 z-[720] -translate-x-1/2">
      <button type="button" className="ai-jarvis-main" onClick={() => setOpen(true)} aria-label="Open AI map copilot">
        <span className="ai-jarvis-ring ai-jarvis-ring-primary" />
        <span className="ai-jarvis-ring ai-jarvis-ring-secondary" />
        <span className="ai-jarvis-content">
          <strong>Bunjure !</strong>
        <span className="ai-jarvis-bars"><i /><i /><i /></span></span>
      </button>
    </div>
    <div className="place-detail-bounds pointer-events-none fixed inset-0" style={{ zIndex }}>
      <AnimatePresence>
        {open && <motion.section className="place-detail-shell resizable-liquid-window shop-platform-shell liquid-card liquid-popover pointer-events-auto absolute top-3.5 right-3.5 w-[380px] overflow-hidden rounded-[28px]" style={maximized ? { width: "min(760px, calc(100vw - 24px))", height: "min(760px, calc(100dvh - 24px))", left: "auto", top: 12, right: 12 } : frameStyle} onPointerDownCapture={bringToFront} initial={{ opacity: 0, scale: 0.96, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: -10 }} transition={{ type: "spring", stiffness: 380, damping: 34 }} data-sized={maximized || sized ? "true" : undefined} role="dialog" aria-label="AI map copilot" ref={windowRef}>
          <WindowResizeHandles handleProps={resizeHandleProps} hidden={maximized} />
          <div className="place-detail-draghandle" {...dragHandleProps} aria-hidden="true"><span /></div>
          <div className="window-controls"><button type="button" className="shop-platform-window-toggle" onClick={() => update({ maximized: !maximized })} aria-label={maximized ? "Restore map copilot" : "Maximize map copilot"}><Icon name={maximized ? "minimize" : "maximize"} className="h-4 w-4" /></button><button type="button" className="place-detail-close" onClick={() => setOpen(false)} aria-label="Close map copilot"><Icon name="close" className="h-4 w-4" /></button></div>
          <div className="shop-platform-heading" {...dragHandleProps}><span className="shop-platform-eyebrow">MINI PLATFORM</span><h2>Map copilot</h2><p>{connected ? "Connected to PsarAI" : "Connecting to local AI…"}</p></div>
          <div className="shop-platform-search-wrap"><Icon name="spark" className="h-4 w-4" /><input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); send(); } }} placeholder={busy ? "Thinking…" : "Find a place or plan a route"} aria-label="Ask the map" disabled={busy} /><button type="button" className="text-emerald-700 disabled:opacity-40" onClick={send} disabled={!connected || busy || !input.trim()} aria-label="Send message"><Icon name="directions" className="h-4 w-4" /></button></div>
          <div ref={threadRef} className="shop-platform-results liquid-window-scroll space-y-3 p-3" aria-live="polite">{messages.map((message, index) => <div key={index} className={`grid max-w-[92%] gap-2 text-xs ${message.role === "user" ? "ml-auto" : ""}`}><span className={`rounded-2xl px-3 py-2 ${message.role === "user" ? "rounded-br-sm bg-emerald-100 text-emerald-950" : "rounded-bl-sm bg-white/45 text-slate-700"}`}>{message.text}{message.streaming && <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded-full bg-emerald-600 align-[-2px]" aria-label="Generating" />}</span>{message.action?.type === "search" && <div className="grid gap-1.5">{(message.action.results || []).map((place) => <button type="button" key={`${place.name}-${place.latitude}`} className="shop-platform-result" onClick={() => applyPlace(place)}><span className="shop-platform-result-icon"><Icon name="pin" className="h-4 w-4" /></span><span className="min-w-0 flex-1 text-left"><strong>{place.name}</strong><span>{place.address || "Show on map"}</span></span><Icon name="chevron-left" className="h-3.5 w-3.5 rotate-180" /></button>)}</div>}{message.action?.type === "route" && (() => { const action = message.action as RouteAction; return <button type="button" className="shop-platform-result" onClick={() => applyRoute(action.stops, action.mode)}><span className="shop-platform-result-icon"><Icon name="directions" className="h-4 w-4" /></span><span className="min-w-0 flex-1 text-left"><strong>Plot route on map</strong><span>{action.stops.map((stop) => stop.name).join(" → ")}</span></span><Icon name="chevron-left" className="h-3.5 w-3.5 rotate-180" /></button>; })()}</div>)}</div>
        </motion.section>}
      </AnimatePresence>
    </div>
  </>;
}

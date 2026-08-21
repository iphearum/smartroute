"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { ChatItem, ChatSession } from "../components/assistant-types";
import { createClientId } from "@/shared/lib/id";

const legacyHistoryKey = "smartroute-ai-map-history";
const sessionStorageKey = "smartroute-ai-map-sessions";
const clientKeyStorageKey = "smartroute-ai-map-client-key";

const titleFor = (messages: ChatItem[]) =>
  messages.find((message) => message.role === "user")?.text.slice(0, 42) ||
  "New chat";

const createSession = (messages: ChatItem[] = []): ChatSession => ({
  id: createClientId("session"),
  title: titleFor(messages),
  messages: messages.slice(-24),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const isSessions = (value: unknown): value is ChatSession[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item &&
      typeof item === "object" &&
      typeof (item as ChatSession).id === "string" &&
      typeof (item as ChatSession).title === "string" &&
      Array.isArray((item as ChatSession).messages),
  );

export function useAssistantSessions() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [clientKey, setClientKey] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const savedKey = localStorage.getItem(clientKeyStorageKey);
      const nextKey = savedKey || createClientId("client");
      localStorage.setItem(clientKeyStorageKey, nextKey);
      setClientKey(nextKey);

      const savedSessions = localStorage.getItem(sessionStorageKey);
      const parsedSessions = savedSessions ? JSON.parse(savedSessions) : null;
      if (isSessions(parsedSessions) && parsedSessions.length) {
        setSessions(parsedSessions);
        setActiveSessionId(parsedSessions[0].id);
        setMessages(parsedSessions[0].messages);
      } else {
        const savedHistory = localStorage.getItem(legacyHistoryKey);
        const history = savedHistory ? JSON.parse(savedHistory) : [];
        const session = createSession(Array.isArray(history) ? history : []);
        setSessions([session]);
        setActiveSessionId(session.id);
        setMessages(session.messages);
      }
    } catch {
      const session = createSession();
      setSessions([session]);
      setActiveSessionId(session.id);
      setMessages([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setSessions((current) =>
      current.map((session) =>
        session.id === activeSessionId
          ? {
              ...session,
              title:
                session.title === "New chat"
                  ? titleFor(messages)
                  : session.title,
              messages: messages.slice(-24),
              updatedAt: new Date().toISOString(),
            }
          : session,
      ),
    );
  }, [activeSessionId, hydrated, messages]);

  useEffect(() => {
    if (!hydrated) return;
    const persisted = sessions.map((session) => ({
      ...session,
      messages: session.messages.map((message) => ({
        ...message,
        attachments: message.attachments?.map(
          ({ dataUrl: _dataUrl, ...attachment }) => attachment,
        ),
      })),
    }));
    localStorage.setItem(sessionStorageKey, JSON.stringify(persisted));
  }, [hydrated, sessions]);

  const startNewChat = () => {
    const session = createSession();
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setMessages([]);
  };

  const selectChatSession = (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session || sessionId === activeSessionId) return;
    setActiveSessionId(session.id);
    setMessages(session.messages);
  };

  const branchChatSession = (sourceMessages: ChatItem[]) => {
    const session = createSession(sourceMessages);
    setSessions((current) => [session, ...current]);
    setActiveSessionId(session.id);
    setMessages(session.messages);
  };

  const deleteChatSession = (sessionId: string) => {
    const index = sessions.findIndex((session) => session.id === sessionId);
    if (index < 0) return;

    const remaining = sessions.filter((session) => session.id !== sessionId);
    const nextSession = remaining[index] || remaining[index - 1] || createSession();
    setSessions(remaining.length ? remaining : [nextSession]);

    if (sessionId === activeSessionId) {
      setActiveSessionId(nextSession.id);
      setMessages(nextSession.messages);
    }
  };

  return {
    sessions,
    activeSessionId,
    messages,
    setMessages: setMessages as Dispatch<SetStateAction<ChatItem[]>>,
    setSessions,
    clientKey,
    hydrated,
    startNewChat,
    selectChatSession,
    branchChatSession,
    deleteChatSession,
  };
}

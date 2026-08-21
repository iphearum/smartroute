"use client";

import type { ReactNode } from "react";
import {
  FiCloud,
  FiMap,
  FiMenu,
  FiMessageSquare,
  FiPlus,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { useI18n } from "@/features/i18n/use-i18n";
import { LiquidCard } from "@/shared/ui/liquid";
import type { ChatSession } from "./assistant-types";

export function AssistantChatWindow({
  sessions,
  activeSessionId,
  activeSessionTitle,
  connectionStatus,
  historyOpen,
  syncing,
  children,
  onHistoryToggle,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  onSync,
  contextTokens,
  contextTokenLimit,
}: {
  sessions: ChatSession[];
  activeSessionId: string;
  activeSessionTitle: string;
  connectionStatus: ReactNode;
  historyOpen: boolean;
  syncing: boolean;
  children: ReactNode;
  onHistoryToggle: () => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  onSync: () => void;
  contextTokens: number;
  contextTokenLimit: number;
}) {
  const t = useI18n();
  return (
    <div className="assistant-chat-window">
      {historyOpen && (
        <LiquidCard
          as="aside"
          variant="nested"
          className="assistant-chat-history"
          aria-label="Chat history"
        >
            <div className="assistant-chat-history-header">
              <strong>{t("assistant.chatHistory", "Chat history")}</strong>
              <button
                type="button"
                className="assistant-chat-history-close"
                onClick={onHistoryToggle}
                aria-label={t("assistant.closeHistory", "Close chat history")}
              >
                <FiX aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="assistant-chat-new"
              onClick={onNewChat}
            >
              <FiPlus aria-hidden="true" />
              {t("assistant.newChat", "New chat")}
            </button>
            <div
              className="assistant-chat-session-list"
              role="listbox"
              aria-label={t("assistant.chatHistory", "Chat history")}
            >
              {sessions.map((session) => (
                <div
                  className={`assistant-chat-session-row ${session.id === activeSessionId ? "is-active" : ""}`}
                  key={session.id}
                  role="option"
                  aria-selected={session.id === activeSessionId}
                >
                  <button
                    type="button"
                    className="assistant-chat-session"
                    onClick={() => onSelectSession(session.id)}
                  >
                    <FiMessageSquare aria-hidden="true" />
                    <span>{session.title}</span>
                  </button>
                  <button
                    type="button"
                    className="assistant-chat-session-delete"
                    onClick={() => onDeleteSession(session.id)}
                    aria-label={`${t("assistant.deleteChat", "Delete chat")} ${session.title}`}
                    title={t("assistant.deleteChat", "Delete chat")}
                  >
                    <FiTrash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
        </LiquidCard>
      )}
      <main className="assistant-chat-main">
        <div className="assistant-chat-toolbar">
          <button
            type="button"
            className="assistant-chat-toolbar-button"
            onClick={onHistoryToggle}
            aria-expanded={historyOpen}
            aria-label={t("assistant.toggleHistory", "Toggle chat history")}
            title={t("assistant.toggleHistory", "Toggle chat history")}
          >
            {historyOpen ? (
              <FiX aria-hidden="true" />
            ) : (
              <FiMenu aria-hidden="true" />
            )}
          </button>
          <div className="assistant-chat-toolbar-heading">
            <strong>
              {activeSessionTitle || t("assistant.newChat", "New chat")}
            </strong>
            <span>
              <FiMap aria-hidden="true" />
              {t("assistant.chatContext", "Chat context")}
            </span>
          </div>
          <div className="assistant-chat-toolbar-status">
            {connectionStatus}
          </div>
          <span className="assistant-chat-token-budget" title="Estimated context usage">
            {t("assistant.contextUsage", "Context")}: {contextTokens.toLocaleString()} / {(contextTokenLimit / 1000).toFixed(0)}k
          </span>
          <div className="assistant-chat-toolbar-actions">
            <button
              type="button"
              className="assistant-chat-toolbar-button"
              onClick={onNewChat}
              aria-label={t("assistant.newChat", "New chat")}
              title={t("assistant.newChat", "New chat")}
            >
              <FiPlus aria-hidden="true" />
            </button>
            <button
              type="button"
              className="assistant-chat-toolbar-button"
              onClick={onSync}
              disabled={
                !sessions.find((session) => session.id === activeSessionId)
                  ?.messages.length || syncing
              }
              aria-label={t("assistant.syncChat", "Sync chat")}
              title={
                syncing
                  ? t("assistant.syncingChat", "Syncing chat")
                  : t("assistant.syncChat", "Sync chat")
              }
            >
              <FiCloud aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="assistant-chat-main-content">{children}</div>
      </main>
    </div>
  );
}

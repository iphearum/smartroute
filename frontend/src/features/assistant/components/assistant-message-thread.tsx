import { Fragment, type RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  FiCopy,
  FiEdit2,
  FiGitBranch,
  FiRefreshCw,
  FiTrash2,
  FiVolume2,
  FiVolumeX,
} from "react-icons/fi";
import type { Place, TravelMode } from "@/features/routes/domain/types";
import { useAppShell } from "@/shared/state/app-shell-context";
import { Icon } from "@/shared/ui/icon";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { useI18n } from "@/features/i18n/use-i18n";
import { MarkdownMessage } from "./markdown-message";
import { toSpeechText } from "../lib/speech-text";
import { speakAssistantSpeech, stopAssistantSpeech } from "../lib/assistant-speech";
import { AssistantActivityGroup } from "./assistant-activity-group";
import type {
  AssistantAction,
  AssistantActivity as AssistantActivityState,
  ChatItem,
  PendingToolCall,
} from "./assistant-types";

type RouteAction = Extract<Exclude<AssistantAction, null>, { type: "route" }>;

export function AssistantMessageThread({
  messages,
  threadRef,
  onPlaceSelect,
  onRouteSelect,
  pendingToolCall,
  onApproveTool,
  onRejectTool,
  onRetry,
  onDelete,
  onEdit,
  onBranch,
  activities,
}: {
  messages: ChatItem[];
  threadRef: RefObject<HTMLDivElement | null>;
  onPlaceSelect: (place: Place) => void;
  onRouteSelect: (stops: Place[], mode?: TravelMode) => void;
  pendingToolCall: PendingToolCall | null;
  onApproveTool: () => void;
  onRejectTool: () => void;
  onRetry: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onEdit: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  activities: AssistantActivityState[];
}) {
  const t = useI18n();
  const approvalTitle = t(
    "assistant.approvalTitle",
    "The assistant wants to change the map.",
  );
  const openBottomSheet = useAppShell((state) => state.openBottomSheet),
    closeBottomSheet = useAppShell((state) => state.closeBottomSheet);

  useEffect(() => {
    if (pendingToolCall) {
      openBottomSheet({
        id: "assistant-tool-approval",
        title: approvalTitle,
      });
    } else {
      closeBottomSheet("assistant-tool-approval");
    }
  }, [approvalTitle, closeBottomSheet, openBottomSheet, pendingToolCall]);

  return (
    <div
      ref={threadRef}
      className="assistant-thread shop-platform-results liquid-window-scroll min-h-0 flex-1 space-y-3 p-3"
      aria-live="polite"
    >
      {messages.length > 0 && <div></div>}
      {messages.map((message, index) => (
        <Fragment key={message.id || index}>
          {message.streaming &&
            index === messages.findIndex((item) => item.streaming) && (
              <AssistantActivityGroup
                activities={activities}
                reasoning={message.reasoning}
              />
            )}
          <AssistantMessage
            message={message}
            onPlaceSelect={onPlaceSelect}
            onRouteSelect={onRouteSelect}
            onRetry={onRetry}
            onDelete={onDelete}
            onEdit={onEdit}
            onBranch={onBranch}
            t={t}
          />
        </Fragment>
      ))}
      {!messages.some((message) => message.streaming) && (
        <AssistantActivityGroup activities={activities} />
      )}
      <BottomSheet
        id="assistant-tool-approval"
        title={approvalTitle}
        role="alertdialog"
        ariaLabelledBy="assistant-tool-approval-title"
        ariaDescribedBy="assistant-tool-approval-description"
        className="assistant-tool-approval"
      >
        {pendingToolCall && (
          <section className="assistant-tool-approval-content">
            <strong id="assistant-tool-approval-title">
              Allow {pendingToolCall.name.replaceAll("_", " ")}?
            </strong>
            <span id="assistant-tool-approval-description">
              {approvalTitle}
            </span>
            <div className="assistant-tool-approval-actions">
              <button type="button" onClick={onRejectTool}>
                {t("assistant.decline", "Decline")}
              </button>
              <button type="button" onClick={onApproveTool}>
                {t("assistant.approve", "Allow")}
              </button>
            </div>
          </section>
        )}
      </BottomSheet>
    </div>
  );
}

function AssistantMessage({
  message,
  onPlaceSelect,
  onRouteSelect,
  onRetry,
  onDelete,
  onEdit,
  onBranch,
  t,
}: {
  message: ChatItem;
  onPlaceSelect: (place: Place) => void;
  onRouteSelect: (stops: Place[], mode?: TravelMode) => void;
  onRetry: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onEdit: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const routeAction =
    message.action?.type === "route" ? (message.action as RouteAction) : null;

  return (
    <div
      className={`assistant-message grid max-w-[92%] gap-2 text-xs ${message.role === "user" ? "ml-auto" : ""}`}
    >
      {message.role === "assistant" && message.activities?.length ? (
        <AssistantActivityGroup
          activities={message.activities}
          reasoning={message.reasoning}
        />
      ) : null}
      <div
        className={`assistant-message-bubble ${message.role === "user" ? "is-user" : "is-assistant"}`}
      >
        <MessageAttachments message={message} />
        {message.role === "assistant" ? (
          <MarkdownMessage value={message.text} />
        ) : (
          <span className="whitespace-pre-wrap">{message.text}</span>
        )}
        {message.streaming && (
          <span
            className="ml-1 inline-block h-3 w-1 animate-pulse rounded-full bg-emerald-600 align-[-2px]"
            aria-label="Generating"
          />
        )}
      </div>
      {message.role === "user" && message.id && (
        <UserMessageActions
          message={message}
          onEdit={onEdit}
          onBranch={onBranch}
          onDelete={onDelete}
          t={t}
        />
      )}
      {message.role === "assistant" && message.id && !message.streaming && (
        <AssistantMessageActions
          message={message}
          onRetry={onRetry}
          onDelete={onDelete}
          t={t}
        />
      )}
      {message.action?.type === "search" && (
        <div
          className="assistant-search-sources"
          aria-label={t("assistant.searchSources", "Search results")}
        >
          {(message.action.results || []).map((place) => (
            <button
              type="button"
              key={`${place.name}-${place.latitude}`}
              className="assistant-search-source"
              onClick={() => onPlaceSelect(place)}
            >
              <Icon name="pin" className="h-3 w-3" />
              <span>{place.name}</span>
            </button>
          ))}
        </div>
      )}
      {message.action?.type === "web_search" && (
        <div
          className="assistant-search-sources"
          aria-label={t("assistant.webSearchSources", "Web sources")}
        >
          {(message.action.results || []).map((result) => (
            <a
              key={result.url}
              className="assistant-search-source"
              href={result.url}
              target="_blank"
              rel="noreferrer"
              title={`${result.title}${result.snippet ? ` — ${result.snippet}` : ""}`}
            >
              <Icon name="globe" className="h-3 w-3" />
              <span>{result.domain || result.title}</span>
            </a>
          ))}
        </div>
      )}
      {routeAction && (
        <button
          type="button"
          className="shop-platform-result"
          onClick={() => onRouteSelect(routeAction.stops, routeAction.mode)}
        >
          <span className="shop-platform-result-icon">
            <Icon name="directions" className="h-4 w-4" />
          </span>
          <span className="shop-platform-result-body">
            <strong>Plot route on map</strong>
            <span className="shop-platform-result-meta">
              {routeAction.stops.map((stop) => stop.name).join(" → ")}
            </span>
          </span>
          <Icon name="chevron-left" className="h-3.5 w-3.5 rotate-180" />
        </button>
      )}
    </div>
  );
}

function UserMessageActions({
  message,
  onEdit,
  onBranch,
  onDelete,
  t,
}: {
  message: ChatItem;
  onEdit: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div
      className="assistant-message-actions user"
      aria-label={t("assistant.messageActions", "Message actions")}
    >
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t("assistant.copyMessage", "Copy message")}
        title={copied ? t("assistant.copied", "Copied") : t("assistant.copyMessage", "Copy message")}
      >
        <FiCopy aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onEdit(message.id!)}
        aria-label={t("assistant.editMessage", "Edit message")}
        title={t("assistant.editMessage", "Edit message")}
      >
        <FiEdit2 aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onBranch(message.id!)}
        aria-label={t("assistant.branchMessage", "Branch from message")}
        title={t("assistant.branchMessage", "Branch from message")}
      >
        <FiGitBranch aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(message.id!)}
        aria-label={t("assistant.deleteMessage", "Delete message")}
        title={t("assistant.deleteMessage", "Delete message")}
      >
        <FiTrash2 aria-hidden="true" />
      </button>
      <span className="assistant-message-action-status" aria-live="polite">
        {copied ? t("assistant.copied", "Copied") : ""}
      </span>
    </div>
  );
}

function AssistantMessageActions({
  message,
  onRetry,
  onDelete,
  t,
}: {
  message: ChatItem;
  onRetry: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  t: (key: string, fallback?: string) => string;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);

  useEffect(() => {
    const stopWhenAnotherMessageStarts = (event: Event) => {
      const speechEvent = event as CustomEvent<string>;
      if (speechEvent.detail === message.id) return;
      speakingRef.current = false;
      setSpeaking(false);
    };
    window.addEventListener(
      "smartroute:assistant-speech-start",
      stopWhenAnotherMessageStarts,
    );
    return () => {
      window.removeEventListener(
        "smartroute:assistant-speech-start",
        stopWhenAnotherMessageStarts,
      );
      if (speakingRef.current) stopAssistantSpeech();
    };
  }, [message.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };
  const toggleSpeech = () => {
    if (typeof window === "undefined") return;
    if (speakingRef.current) {
      stopAssistantSpeech();
      speakingRef.current = false;
      setSpeaking(false);
      return;
    }
    const speechText = toSpeechText(message.text);
    if (!speechText) return;
    window.dispatchEvent(
      new CustomEvent("smartroute:assistant-speech-start", {
        detail: message.id,
      }),
    );
    speakingRef.current = true;
    setSpeaking(true);
    void speakAssistantSpeech(speechText).catch(() => {
      if (!speakingRef.current) return;
      speakingRef.current = false;
      setSpeaking(false);
    });
  };
  return (
    <div
      className="assistant-message-actions"
      aria-label={t("assistant.messageActions", "Message actions")}
    >
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={t("assistant.copyResponse", "Copy response")}
        title={copied ? t("assistant.copied", "Copied") : t("assistant.copyResponse", "Copy response")}
      >
        <FiCopy aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onRetry(message.id!)}
        aria-label={t("assistant.retryResponse", "Retry response")}
        title={t("assistant.retryResponse", "Retry response")}
      >
        <FiRefreshCw aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(message.id!)}
        aria-label={t("assistant.deleteResponse", "Delete response")}
        title={t("assistant.deleteResponse", "Delete response")}
      >
        <FiTrash2 aria-hidden="true" />
      </button>
      <button
        type="button"
        className={speaking ? "is-speaking" : undefined}
        onClick={toggleSpeech}
        aria-label={
          speaking
            ? t("assistant.stopResponse", "Stop reading")
            : t("assistant.readResponse", "Read response aloud")
        }
        title={
          speaking
            ? t("assistant.stopResponse", "Stop reading")
            : t("assistant.readResponse", "Read response aloud")
        }
      >
        {speaking ? (
          <FiVolumeX aria-hidden="true" />
        ) : (
          <FiVolume2 aria-hidden="true" />
        )}
      </button>
      <span className="assistant-message-action-status" aria-live="polite">
        {copied ? t("assistant.copied", "Copied") : ""}
      </span>
    </div>
  );
}

function MessageAttachments({ message }: { message: ChatItem }) {
  if (!message.attachments?.length) return null;
  return (
    <div className="mb-2 grid gap-1.5">
      {message.attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-xl bg-white/55 px-2 py-1.5 text-[10px]"
        >
          {attachment.dataUrl ? (
            <img
              src={attachment.dataUrl}
              alt=""
              className="h-10 w-10 rounded-lg object-cover"
            />
          ) : (
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-100 text-emerald-800">
              FILE
            </span>
          )}
          <span className="min-w-0 truncate font-semibold">
            {attachment.name}
          </span>
        </div>
      ))}
    </div>
  );
}

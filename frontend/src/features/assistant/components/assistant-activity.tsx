"use client";

import { useEffect, useRef, useState } from "react";
import { FiChevronDown, FiCopy, FiLoader, FiZap } from "react-icons/fi";
import { useI18n } from "@/features/i18n/use-i18n";
import type { AssistantActivity as AssistantActivityState } from "./assistant-types";

export function AssistantActivity({
  activity,
  summary,
}: {
  activity: AssistantActivityState;
  summary?: string;
}) {
  const t = useI18n();
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean | null>(null);
  const streamBodyRef = useRef<HTMLParagraphElement | null>(null);
  const thinkingSummary = summary || activity.detail;

  // The summary box is height-capped, so it has to follow its own tail while
  // reasoning streams in; otherwise the reader is left staring at the opening
  // sentence while new text piles up out of sight.
  useEffect(() => {
    const body = streamBodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [thinkingSummary]);

  if (activity.kind === "thinking") {
    const streaming = activity.active !== false;
    // A finished summary collapses back down unless the reader opened it.
    const expanded = manuallyExpanded ?? streaming;
    return (
      <div
        className={`assistant-thinking-card ${expanded ? "is-expanded" : "is-collapsed"}`}
        role="status"
        aria-live="polite"
      >
        <div className="assistant-thinking-card-heading">
          <button
            type="button"
            className="assistant-thinking-toggle"
            onClick={() => setManuallyExpanded(!expanded)}
            aria-expanded={expanded}
            disabled={!thinkingSummary}
          >
            <FiZap aria-hidden="true" />
            <span>
              {streaming
                ? t("assistant.thinking", "Thinking…")
                : t("assistant.thought", "Thought")}
            </span>
          </button>
          {thinkingSummary && expanded && (
            <button
              type="button"
              className="assistant-thinking-copy"
              onClick={() => void navigator.clipboard?.writeText(thinkingSummary)}
              aria-label={t("assistant.copyThinking", "Copy thinking summary")}
              title={t("assistant.copyThinking", "Copy thinking summary")}
            >
              <FiCopy aria-hidden="true" />
            </button>
          )}
          <FiChevronDown
            className={`assistant-thinking-chevron ${expanded ? "is-open" : "is-closed"}`}
            aria-hidden="true"
          />
        </div>
        {expanded && (
          <p
            ref={streaming ? streamBodyRef : undefined}
            className={streaming ? "assistant-thinking-stream" : undefined}
          >
            {thinkingSummary ||
              t("assistant.hiddenReasoning", "Working through the request…")}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="assistant-tool-activity" role="status" aria-live="polite">
      <FiLoader
        className={activity.active ? "assistant-tool-activity-spinner" : undefined}
        aria-hidden="true"
      />
      <span>
        <strong>{activity.label}</strong>
        {activity.detail ? ` ${activity.detail}` : ""}
      </span>
      <FiChevronDown aria-hidden="true" />
    </div>
  );
}

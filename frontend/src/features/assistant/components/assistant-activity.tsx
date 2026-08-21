"use client";

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
  const thinkingSummary = summary || activity.detail;

  if (activity.kind === "thinking") {
    return (
      <div className="assistant-thinking-card" role="status" aria-live="polite">
        <div className="assistant-thinking-card-heading">
          <FiZap aria-hidden="true" />
          <span>{t("assistant.thinking", "Thinking…")}</span>
          {thinkingSummary && (
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
          <FiChevronDown aria-hidden="true" />
        </div>
        <p>
          {thinkingSummary ||
            t("assistant.hiddenReasoning", "Working through the request…")}
        </p>
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

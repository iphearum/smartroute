"use client";

import { useI18n } from "@/features/i18n/use-i18n";
import { Icon } from "@/shared/ui/icon";

export function AssistantPresence({
  busy,
  compact = false,
}: {
  busy: boolean;
  compact?: boolean;
}) {
  const t = useI18n();

  return (
    <div
      className={`assistant-presence ${compact ? "assistant-presence-aside" : ""} ${busy ? "is-thinking" : ""}`}
      role="status"
      aria-live="polite"
    >
      <span className="assistant-presence-orb" aria-hidden="true">
        <Icon name="spark" className="h-5 w-5" />
      </span>
      <span className="assistant-presence-copy">
        <strong>
          {busy
            ? t("assistant.thinking", "Thinking…")
            : t("assistant.welcomeTitle", "Map copilot")}
        </strong>
        {!busy && (
          <span>
            {t(
              "assistant.welcomeText",
              "Ask me to find places or plan a route.",
            )}
          </span>
        )}
      </span>
      {busy && (
        <span className="assistant-waveform" aria-hidden="true">
          {Array.from({ length: 7 }, (_, index) => (
            <i
              key={index}
              style={{ "--wave-index": index } as React.CSSProperties}
            />
          ))}
        </span>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { FiAlertCircle, FiCheck, FiChevronDown, FiLoader, FiTool } from "react-icons/fi";
import { useI18n } from "@/features/i18n/use-i18n";
import { AssistantActivity } from "./assistant-activity";
import type { AssistantActivity as AssistantActivityState } from "./assistant-types";

type ToolStep = AssistantActivityState & { count: number };

/** Collapse repeated calls of one tool into a single counted step. */
function mergeSteps(activities: AssistantActivityState[]): ToolStep[] {
  return activities.reduce<ToolStep[]>((steps, activity) => {
    const previous = steps[steps.length - 1];
    if (
      previous &&
      previous.label === activity.label &&
      previous.detail === activity.detail
    ) {
      steps[steps.length - 1] = {
        ...previous,
        count: previous.count + 1,
        active: previous.active || activity.active,
        status: activity.status ?? previous.status,
      };
      return steps;
    }
    return [...steps, { ...activity, count: 1 }];
  }, []);
}

/** Split a turn into runs of one kind so each renders in its own card. */
function segmentByKind(
  activities: AssistantActivityState[],
): AssistantActivityState[][] {
  return activities.reduce<AssistantActivityState[][]>((segments, activity) => {
    const current = segments[segments.length - 1];
    if (current && current[0].kind === activity.kind) {
      current.push(activity);
      return segments;
    }
    return [...segments, [activity]];
  }, []);
}

export function AssistantActivityGroup({
  activities,
  reasoning,
}: {
  activities: AssistantActivityState[];
  reasoning?: string;
}) {
  if (!activities.length) return null;
  return (
    <>
      {segmentByKind(activities).map((segment, index) =>
        segment[0].kind === "thinking" ? (
          <AssistantActivity
            key={`activity-segment-${index}`}
            activity={segment[0]}
            summary={reasoning}
          />
        ) : (
          <AssistantToolGroup key={`activity-segment-${index}`} activities={segment} />
        ),
      )}
    </>
  );
}

function AssistantToolGroup({
  activities,
}: {
  activities: AssistantActivityState[];
}) {
  const t = useI18n();
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean | null>(null);
  const steps = mergeSteps(activities);
  const running = activities.some(
    (activity) => activity.active !== false && !activity.status,
  );
  // Steps stay visible while they run, then fold into the summary line unless
  // the reader opened the group.
  const expanded = manuallyExpanded ?? running;
  const total = steps.reduce((count, step) => count + step.count, 0);
  const heading = running
    ? steps[steps.length - 1].label
    : `${t("assistant.usedTools", "Used")} ${total} ${
        total === 1
          ? t("assistant.toolSingular", "tool")
          : t("assistant.toolPlural", "tools")
      }`;

  return (
    <div
      className={`assistant-tool-group ${expanded ? "is-expanded" : "is-collapsed"}`}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="assistant-tool-group-heading"
        onClick={() => setManuallyExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {running ? (
          <FiLoader className="assistant-tool-activity-spinner" aria-hidden="true" />
        ) : (
          <FiTool aria-hidden="true" />
        )}
        <strong>{heading}</strong>
        <FiChevronDown
          className={`assistant-thinking-chevron ${expanded ? "is-open" : "is-closed"}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <ol className="assistant-tool-group-steps">
          {steps.map((step, index) => (
            <li key={`${step.label}-${index}`} className="assistant-tool-activity">
              <StepIcon step={step} />
              <span>
                <strong>{step.label}</strong>
                {step.detail ? ` ${step.detail}` : ""}
                {step.count > 1 ? ` ×${step.count}` : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function StepIcon({ step }: { step: ToolStep }) {
  if (step.status === "error") {
    return <FiAlertCircle className="assistant-tool-step-error" aria-hidden="true" />;
  }
  if (step.status === "done" || step.active === false) {
    return <FiCheck className="assistant-tool-step-done" aria-hidden="true" />;
  }
  return <FiLoader className="assistant-tool-activity-spinner" aria-hidden="true" />;
}

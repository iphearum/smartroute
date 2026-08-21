import type { AssistantToolAction } from "@/features/assistant/api/assistant-api";

export type ChatAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl?: string;
  text?: string;
};

export type AssistantAction = AssistantToolAction | null;
export type ChatItem = {
  id?: string;
  role: "user" | "assistant";
  text: string;
  action?: AssistantAction;
  streaming?: boolean;
  reasoning?: string;
  attachments?: ChatAttachment[];
  activities?: AssistantActivity[];
};

export type ChatSession = {
  id: string;
  serverId?: string;
  title: string;
  messages: ChatItem[];
  createdAt: string;
  updatedAt: string;
};

export type PermissionMode = "ask" | "automatic" | "full" | "disabled";
// "auto" lets the backend decide per request; "high" always reasons.
export type ReasoningMode = "off" | "auto" | "high";
export const permissionOptions: Array<{
  id: PermissionMode;
  title: string;
  description: string;
}> = [
  {
    id: "ask",
    title: "Ask for approval",
    description: "Ask before changing the map or using an attachment",
  },
  {
    id: "automatic",
    title: "Run automatically",
    description: "Run map tool calls without approval prompts",
  },
  {
    id: "full",
    title: "Full access",
    description: "Allow all available Smart map tools",
  },
  {
    id: "disabled",
    title: "Disabled",
    description: "Do not run map tools from the assistant",
  },
];

export type PendingToolCall = {
  frameId?: string;
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type AssistantActivity = {
  kind: "thinking" | "tool";
  label: string;
  detail?: string;
  startedAt: number;
  active?: boolean;
  toolCallId?: string;
  status?: "done" | "error";
};

import { api } from "@/shared/api/http";
import type { Place, TravelMode } from "@/features/routes/domain/types";

export type AssistantToolName =
  | "search_places"
  | "search_web"
  | "plot_route"
  | "add_map_point"
  | "focus_coordinate"
  | "reset_map_view"
  | "clear_route_points"
  | "get_current_location";

export type AssistantToolAction =
  | { type: "search"; query: string; results: Place[] }
  | { type: "web_search"; query: string; results: WebSearchResult[] }
  | { type: "route"; stops: Place[]; mode?: TravelMode }
  | { type: "point"; place: Place }
  | { type: "focus"; latitude: number; longitude: number }
  | { type: "map_command"; command: "reset_map_view" | "clear_route_points" }
  | { type: "location_request" };

export type WebSearchResult = {
  title: string;
  url: string;
  domain: string;
  snippet: string;
  content?: string;
};

export interface AssistantToolResult {
  accepted?: boolean;
  action?: AssistantToolAction;
  error?: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
}

export type AssistantSession = {
  id: string;
  title: string;
  messages: Array<{ role: "user" | "assistant"; text: string }>;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export const assistantApi = {
  streamChat: (payload: Record<string, unknown>, signal?: AbortSignal) =>
    fetch("/api/backend/assistant/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
      cache: "no-store",
    }),
  submitToolResult: (
    streamId: string,
    toolCallId: string,
    result: AssistantToolResult,
  ) =>
    api<{ accepted: boolean }>(
      `/assistant/chat/stream/${encodeURIComponent(streamId)}/tool-result`,
      {
        method: "POST",
        body: JSON.stringify({ toolCallId, result }),
      },
    ),
  executeTool: (name: AssistantToolName, arguments_: Record<string, unknown>) =>
    api<AssistantToolResult>("/assistant/tools/execute", {
      method: "POST",
      body: JSON.stringify({ name, arguments: arguments_ }),
    }),
  listSessions: (clientKey: string) =>
    api<{ sessions: AssistantSession[] }>(
      `/assistant/sessions?clientKey=${encodeURIComponent(clientKey)}`,
    ),
  createSession: (
    clientKey: string,
    title: string,
    messages: AssistantSession["messages"],
  ) =>
    api<AssistantSession>("/assistant/sessions", {
      method: "POST",
      body: JSON.stringify({ clientKey, title, messages }),
    }),
  saveSession: (
    clientKey: string,
    session: Pick<AssistantSession, "id" | "title" | "messages">,
  ) =>
    api<AssistantSession>(`/assistant/sessions/${session.id}`, {
      method: "PUT",
      body: JSON.stringify({
        clientKey,
        title: session.title,
        messages: session.messages,
      }),
    }),
};

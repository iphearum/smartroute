import type { ChatItem } from "../components/assistant-types";

/** A conservative client-side estimate; the server remains the authority. */
export const ASSISTANT_CONTEXT_TOKEN_LIMIT = 8_192;

export function estimateTokens(text: string): number {
  const normalized = text.trim();
  return normalized ? Math.max(1, Math.ceil(normalized.length / 4)) : 0;
}

export function estimateMessageTokens(message: ChatItem): number {
  const attachmentTokens = (message.attachments ?? []).reduce(
    (total, attachment) => total + estimateTokens(attachment.text ?? ""),
    0,
  );
  return 4 + estimateTokens(message.text) + attachmentTokens;
}

export function estimateContextTokens(messages: ChatItem[]): number {
  return messages.reduce((total, message) => total + estimateMessageTokens(message), 0);
}

/** Keep complete recent turns while preserving the full local transcript. */
export function compactContextMessages(
  messages: ChatItem[],
  limit = ASSISTANT_CONTEXT_TOKEN_LIMIT,
): ChatItem[] {
  const selected: ChatItem[] = [];
  let used = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const cost = estimateMessageTokens(message);
    if (selected.length && used + cost > limit) break;
    selected.unshift(message);
    used += cost;
  }
  return selected;
}

export function contextPayload(messages: ChatItem[]) {
  return compactContextMessages(messages).map(({ role, text }) => ({
    role,
    text,
  }));
}

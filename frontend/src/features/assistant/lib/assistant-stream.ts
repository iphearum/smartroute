export type StreamEvent =
  | { type: "reasoning"; delta: string }
  | {
      type: "content";
      delta: string;
    }
  | {
      type: "tool";
      name: string;
      status: string;
      toolCallId?: string;
      arguments?: Record<string, unknown>;
      action?: unknown;
    }
  | { type: "usage"; input?: number; output?: number }
  | { type: "done"; message?: string; action?: unknown };

export async function consumeAssistantStream(
  response: Response,
  onEvent: (event: StreamEvent) => void,
) {
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).trim().slice(0, 500);
    } catch {
      // Keep the status useful even when the proxy closes the error body.
    }
    throw new Error(
      `Assistant stream failed (${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  if (!response.body) throw new Error("Assistant stream has no body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const consume = (block: string) => {
    let event = "message";
    let data = "";
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) return;
    const payload = JSON.parse(data) as Record<string, unknown>;
    onEvent({ type: event, ...payload } as StreamEvent);
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(consume);
    if (done) break;
  }
  if (buffer.trim()) consume(buffer);
}

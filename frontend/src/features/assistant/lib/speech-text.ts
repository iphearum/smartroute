/** Convert rendered assistant Markdown into concise text for speech synthesis. */
export function toSpeechText(value: string): string {
  return value
    .replace(/<(?:tool_call|function|tool[a-z_]*)\b[\s\S]*?<\/(?:tool_call|function|tool[a-z_]*)\s*>/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<https?:\/\/[^>]+>/gi, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/(^|\n)\s{0,3}#{1,6}\s+/g, "$1")
    .replace(/(^|\n)\s*[-*+]\s+/g, "$1")
    .replace(/(^|\n)\s*\d+[.)]\s+/g, "$1")
    .replace(/(^|\n)\s*>\s?/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[*_]/g, "")
    .replace(/\|/g, " ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

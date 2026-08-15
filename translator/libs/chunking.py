import re

from .config import CHUNK_SIZE_CHARS

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def chunk_text(text: str, max_chars: int = CHUNK_SIZE_CHARS) -> list[str]:
    """Split text on sentence boundaries, packing up to max_chars per chunk."""
    if len(text) <= max_chars:
        return [text]

    sentences = SENTENCE_SPLIT_RE.split(text.strip())
    chunks: list[str] = []
    current = ""
    for s in sentences:
        if not s:
            continue
        if len(s) > max_chars:
            # Pathological: one sentence longer than the chunk limit.
            # Flush current, then hard-split the long sentence.
            if current:
                chunks.append(current)
                current = ""
            for i in range(0, len(s), max_chars):
                chunks.append(s[i:i + max_chars])
            continue
        if len(current) + len(s) + 1 <= max_chars:
            current = (current + " " + s).strip()
        else:
            chunks.append(current)
            current = s
    if current:
        chunks.append(current)
    return chunks

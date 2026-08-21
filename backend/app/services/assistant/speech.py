"""Small server-side speech chunks for mixed English and Khmer responses."""
from __future__ import annotations

from io import BytesIO
import re

KHMER_RE = re.compile(r"[\u1780-\u17ff\u19e0-\u19ff]")


def detect_language(text: str) -> str:
    return "km" if KHMER_RE.search(text) else "en"


def synthesize_chunk(text: str, language: str | None = None) -> bytes:
    """Create one short MP3 chunk; gTTS is imported only when speech is used."""
    from gtts import gTTS

    output = BytesIO()
    gTTS(text=text, lang=language or detect_language(text), slow=False).write_to_fp(output)
    return output.getvalue()

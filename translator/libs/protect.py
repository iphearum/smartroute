import re

# Content preservation: extract code/URLs, translate prose, splice back.

# Fenced code blocks: ```lang\n ... \n```
FENCED_CODE_RE = re.compile(r"```[\w+-]*\n.*?\n```", re.DOTALL)
# Inline code: `foo_bar()`
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
# URLs
URL_RE = re.compile(r"https?://\S+")

# Double-underscore + digits is reliably preserved by Google Translate.
PLACEHOLDER_TEMPLATE = "__PRESERVE_{n}__"
PLACEHOLDER_RE = re.compile(r"__PRESERVE_(\d+)__")


def protect(text: str) -> tuple[str, list[str]]:
    """
    Replace code blocks and URLs with placeholders. Return (protected_text,
    list_of_originals). Order of replacement matters: fenced first, then inline,
    then URLs, so we don't double-wrap.
    """
    originals: list[str] = []

    def _sub(match):
        originals.append(match.group(0))
        return PLACEHOLDER_TEMPLATE.format(n=len(originals) - 1)

    text = FENCED_CODE_RE.sub(_sub, text)
    text = INLINE_CODE_RE.sub(_sub, text)
    text = URL_RE.sub(_sub, text)
    return text, originals


def restore(text: str, originals: list[str]) -> str:
    """Put the originals back where the placeholders are."""
    def _sub(match):
        idx = int(match.group(1))
        if idx < len(originals):
            return originals[idx]
        return match.group(0)  # malformed — leave it
    return PLACEHOLDER_RE.sub(_sub, text)

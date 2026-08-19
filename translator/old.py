import json
import random
import re
import threading
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed, FIRST_COMPLETED, wait
from pathlib import Path
from typing import Optional

# pip install deep-translator --break-system-packages
from deep_translator import GoogleTranslator
from deep_translator.exceptions import TranslationNotFound, RequestError, TooManyRequests
from datasets import load_dataset


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

OUTPUT_PATH = Path("datasets/translation/translate_7M_en_km_0.jsonl")

SOURCE_LANG = "en"
TARGET_LANG = "km"

# Be conservative. deep_translator scrapes web Translate, which rate-limits hard.
# 2-3 concurrent threads is the realistic ceiling before 429s cascade.
CONCURRENCY = 5
MIN_DELAY_SECONDS = 0.3    # minimum delay between requests per thread
MAX_RETRIES = 5            # per translation call, with exponential backoff
CHUNK_SIZE_CHARS = 4500    # Google Translate caps around 5000 chars/request

PROGRESS_EVERY = 20

# ---------------------------------------------------------------------------
# Content preservation: extract code/URLs, translate prose, splice back
# ---------------------------------------------------------------------------

# Fenced code blocks: ```lang\n ... \n```
FENCED_CODE_RE = re.compile(r"```[\w+-]*\n.*?\n```", re.DOTALL)
# Inline code: `foo_bar()`
INLINE_CODE_RE = re.compile(r"`[^`\n]+`")
# URLs
URL_RE = re.compile(r"https?://\S+")

# Use a placeholder that Google Translate won't touch.
# Double-underscore + digits is reliably preserved by GT.
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


# ---------------------------------------------------------------------------
# Chunking for long texts (Google Translate ~5000 char limit per request)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Translation with retries
# ---------------------------------------------------------------------------

# Thread-local translators — GoogleTranslator is not obviously thread-safe.
_thread_local = threading.local()


def get_translator():
    tr = getattr(_thread_local, "translator", None)
    if tr is None:
        tr = GoogleTranslator(source=SOURCE_LANG, target=TARGET_LANG)
        _thread_local.translator = tr
    return tr


def translate_chunk_with_retry(chunk: str) -> Optional[str]:
    """Translate a single chunk with exponential backoff on rate limits."""
    tr = get_translator()
    for attempt in range(MAX_RETRIES):
        try:
            result = tr.translate(chunk)
            if result is None:
                return None
            return result
        except TooManyRequests:
            # Hard backoff: 4s, 8s, 16s, 32s, 64s
            wait_s = 4 * (2 ** attempt) + random.uniform(0, 1)
            print(f"[rate-limit] sleeping {wait_s:.1f}s (attempt {attempt+1}/{MAX_RETRIES})")
            time.sleep(wait_s)
        except (TranslationNotFound, RequestError) as e:
            # Transient — shorter backoff
            wait_s = 1 * (2 ** attempt)
            print(f"[transient] {type(e).__name__}: retrying in {wait_s}s")
            time.sleep(wait_s)
        except Exception as e:
            print(f"[unexpected] {type(e).__name__}: {e}")
            return None
    return None  # exhausted retries


def translate_text(text: str) -> Optional[str]:
    """
    Full pipeline for one string:
      1. Extract code/URLs -> placeholders
      2. Chunk if too long
      3. Translate each chunk
      4. Reassemble
      5. Restore code/URLs
    Returns None if any chunk fails.
    """
    if not text.strip():
        return text

    protected, originals = protect(text)
    chunks = chunk_text(protected)

    translated_chunks: list[str] = []
    for c in chunks:
        time.sleep(random.randrange(1, 5)/2.3)  # per-request rate limit floor
        result = translate_chunk_with_retry(c)
        if result is None:
            return None
        translated_chunks.append(result)

    joined = " ".join(translated_chunks)
    return restore(joined, originals)

# ---------------------------
# Worker
# ---------------------------

def process_example(example):
    text = example.get("text", "").strip()
    # text = example.strip()
    if not text:
        return None

    translated = translate_text(text)
    if translated is None:
        return None

    return {"en": text, "km": translated}


from concurrent.futures import as_completed

CONCURRENCY = 4
MAX_IN_FLIGHT = 50
FILE_SIZE = 500

output_dir = Path("datasets/translation")
output_dir.mkdir(exist_ok=True)

file_index = 0
written_in_file = 0
total_processed = 0

current_file = (output_dir / f"translate_7M_en_km_{file_index}.jsonl").open("w", encoding="utf-8")

with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
    futures = set()

    for example in ds:
        futures.add(executor.submit(process_example, example))

        if len(futures) >= MAX_IN_FLIGHT:
            done, futures = wait(futures, return_when=FIRST_COMPLETED)

            for future in done:
                result = future.result()
                if result:
                    current_file.write(json.dumps(result, ensure_ascii=False) + "\n")
                    written_in_file += 1
                    total_processed += 1

                # rotate file
                if written_in_file >= FILE_SIZE:
                    current_file.close()
                    file_index += 1
                    written_in_file = 0
                    current_file = (output_dir / f"translate_7M_en_km_{file_index}.jsonl").open("w", encoding="utf-8")

                if total_processed % 20 == 0:
                    print(f"Processed {total_processed}")

# flush remaining
for future in as_completed(futures):
    result = future.result()
    if result:
        current_file.write(json.dumps(result, ensure_ascii=False) + "\n")

current_file.close()
# 212920
"""Country-aware, failure-tolerant translation for imported map data."""

from __future__ import annotations

import logging
import random
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Callable, Iterable

logger = logging.getLogger(__name__)

COUNTRY_LANGUAGES: dict[str, tuple[str, ...]] = {
    "cambodia": ("km", "en"),
    "kh": ("km", "en"),
    "khm": ("km", "en"),
    "laos": ("lo", "en"),
    "thailand": ("th", "en"),
    "vietnam": ("vi", "en"),
    "myanmar": ("my", "en"),
}
PROTECTED_RE = re.compile(r"https?://\S+|\b[\w.+-]+@[\w.-]+\.\w+\b|\+?\d[\d ()-]{6,}\d")
SENTENCE_RE = re.compile(r"(?<=[.!?។៕])\s+")
BATCH_SEPARATOR = "\n[[[SMARTROUTE_TRANSLATION_ITEM]]]\n"


def languages_for_country(country: str) -> tuple[str, ...]:
    """Return the base language first, followed by supported fallback languages."""
    return COUNTRY_LANGUAGES.get(country.strip().lower().replace("_", "-"), ("en",))


def _protect(text: str) -> tuple[str, list[str]]:
    values: list[str] = []

    def replace(match: re.Match[str]) -> str:
        values.append(match.group(0))
        return f"__PRESERVE_{len(values) - 1}__"

    return PROTECTED_RE.sub(replace, text), values


def _restore(text: str, values: list[str]) -> str:
    for index, value in enumerate(values):
        text = text.replace(f"__PRESERVE_{index}__", value)
    return text


def chunk_text(text: str, max_chars: int = 4500) -> list[str]:
    """Split large text without exceeding provider limits, preferring natural boundaries."""
    if len(text) <= max_chars:
        return [text]
    chunks: list[str] = []
    for paragraph in re.split(r"\n{2,}", text):
        sentences = SENTENCE_RE.split(paragraph.strip())
        current = ""
        for sentence in sentences:
            if len(sentence) > max_chars:
                words = sentence.split()
                for word in words:
                    if len(word) > max_chars:
                        if current:
                            chunks.append(current)
                            current = ""
                        chunks.extend(word[index:index + max_chars] for index in range(0, len(word), max_chars))
                    elif len(current) + len(word) + 1 <= max_chars:
                        current = f"{current} {word}".strip()
                    else:
                        chunks.append(current)
                        current = word
            elif len(current) + len(sentence) + 1 <= max_chars:
                current = f"{current} {sentence}".strip()
            else:
                if current:
                    chunks.append(current)
                current = sentence
        if current:
            chunks.append(current)
    return chunks


@dataclass(frozen=True)
class TranslationOptions:
    enabled: bool = True
    source_language: str = "auto"
    max_chars: int = 4500
    max_retries: int = 3
    concurrency: int = 2
    min_interval: float = 0.4


class TranslationService:
    """Small reusable wrapper around deep-translator with chunking, retry, and caching."""

    def __init__(self, options: TranslationOptions | None = None,
                 engine_factory: Callable[[str, str], Any] | None = None):
        self.options = options or TranslationOptions()
        self.engine_factory = engine_factory or self._google_engine
        self._local = threading.local()
        self._rate_lock = threading.Lock()
        self._last_request = 0.0

    @staticmethod
    def _google_engine(source: str, target: str):
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source=source, target=target)

    def _engine(self, target: str):
        engines = getattr(self._local, "engines", None)
        if engines is None:
            engines = self._local.engines = {}
        key = (self.options.source_language, target)
        if key not in engines:
            engines[key] = self.engine_factory(*key)
        return engines[key]

    def _wait_for_slot(self) -> None:
        with self._rate_lock:
            delay = self.options.min_interval - (time.monotonic() - self._last_request)
            if delay > 0:
                time.sleep(delay)
            self._last_request = time.monotonic()

    def _translate_chunk(self, text: str, target: str) -> str | None:
        for attempt in range(self.options.max_retries):
            try:
                self._wait_for_slot()
                result = self._engine(target).translate(text)
                return result.strip() if isinstance(result, str) and result.strip() else None
            except Exception as exc:  # Network/rate-limit errors must not abort an import.
                if attempt + 1 == self.options.max_retries:
                    logger.warning("Translation failed after %s attempts: %s", attempt + 1, exc)
                    return None
                time.sleep((2 ** attempt) + random.uniform(0, 0.3))
        return None

    @lru_cache(maxsize=20_000)
    def translate(self, text: str, target: str) -> str | None:
        if not self.options.enabled or not text or not text.strip():
            return text
        protected, values = _protect(text.strip())
        translated: list[str] = []
        for chunk in chunk_text(protected, self.options.max_chars):
            result = self._translate_chunk(chunk, target)
            if result is None:
                return None
            translated.append(result)
        return _restore(" ".join(translated), values)

    def translate_many(self, texts: Iterable[str], target: str) -> list[str | None]:
        """Translate packed unique values while preserving input order and duplicates."""
        values = list(texts)
        unique = list(dict.fromkeys(value for value in values if value and value.strip()))
        batches: list[list[str]] = []
        current: list[str] = []
        current_chars = 0
        separator_chars = len(BATCH_SEPARATOR)
        for value in unique:
            added_chars = len(value) + (separator_chars if current else 0)
            if current and current_chars + added_chars > self.options.max_chars:
                batches.append(current)
                current, current_chars = [], 0
                added_chars = len(value)
            current.append(value)
            current_chars += added_chars
        if current:
            batches.append(current)

        def translate_batch(batch: list[str]) -> list[str | None]:
            if len(batch) == 1:
                return [self.translate(batch[0], target)]
            payload = BATCH_SEPARATOR.join(batch)
            result = self.translate(payload, target)
            if result:
                parts = [part.strip() for part in result.split(BATCH_SEPARATOR)]
                if len(parts) == len(batch) and all(parts):
                    return parts
            logger.warning("Translation provider changed a batch separator; retrying %s items", len(batch))
            return [self.translate(value, target) for value in batch]

        workers = max(1, min(self.options.concurrency, 4))
        with ThreadPoolExecutor(max_workers=workers) as executor:
            batch_results = list(executor.map(translate_batch, batches))
        translated = {
            value: result
            for batch, results in zip(batches, batch_results)
            for value, result in zip(batch, results)
        }
        return [translated.get(value) if value and value.strip() else value for value in values]


def localize_places(places: list[dict[str, Any]], country: str,
                    service: TranslationService | None = None) -> list[dict[str, Any]]:
    """Localize mutable place records in a single deduplicated batch and retain originals."""
    if not places:
        return places
    languages = languages_for_country(country)
    target = languages[0]
    service = service or TranslationService()
    requests: list[tuple[int, str, str]] = []

    for index, place in enumerate(places):
        metadata = place.setdefault("metadata", {})
        translations = metadata.setdefault("translations", {})
        metadata["base_language"] = target
        name_translations = translations.setdefault("name", {})
        address_translations = translations.setdefault("address", {})
        native_name = metadata.get(f"name_{target}")
        english_name = metadata.get("name_en")
        original_name = str(place.get("name") or "").strip()
        source_values = metadata.setdefault("source_values", {})
        if original_name:
            source_values.setdefault("name", original_name)
        if native_name:
            name_translations[target] = str(native_name)
        if english_name:
            name_translations["en"] = str(english_name)
        if original_name and target not in name_translations:
            requests.append((index, "name", str(english_name or original_name)))
        address = str(place.get("address") or "").strip()
        if address:
            source_values.setdefault("address", address)
        if address and target not in address_translations:
            requests.append((index, "address", address))

    results = service.translate_many((text for _, _, text in requests), target)
    for (index, field, _), translated in zip(requests, results):
        if translated:
            places[index]["metadata"]["translations"][field][target] = translated

    for place in places:
        metadata = place["metadata"]
        translations = metadata["translations"]
        localized_name = translations.get("name", {}).get(target)
        localized_address = translations.get("address", {}).get(target)
        if localized_name:
            place["name"] = localized_name[:160]
        if localized_address:
            place["address"] = localized_address
        requested_fields = sum(bool(translations.get(field, {}).get(target)) for field in ("name", "address"))
        metadata["translation_status"] = "complete" if requested_fields else "source_only"
    return places

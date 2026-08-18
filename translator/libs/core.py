import random
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional, Union

from . import config
from .chunking import chunk_text
from .dataset import detect_text_column, load_hf_rows, load_rows, write_rows
from .protect import protect, restore

RATE_LIMIT_MARKERS = ("RateLimit", "TooManyRequests")


class Translator:
    """
    ts = Translator(target_lang="km")
    text = ts.translate("Hello, world!")

    Every argument falls back to translator/.env (see libs/config.py) when
    omitted, so `Translator()` alone works out of the box.
    """

    def __init__(
        self,
        source_lang: Optional[str] = None,
        target_lang: Optional[str] = None,
        max_retries: Optional[int] = None,
        chunk_size_chars: Optional[int] = None,
        concurrency: Optional[int] = None,
    ):
        self.source_lang = source_lang or config.SOURCE_LANG
        self.target_lang = target_lang or config.TARGET_LANG
        self.max_retries = max_retries or config.MAX_RETRIES
        self.chunk_size_chars = chunk_size_chars or config.CHUNK_SIZE_CHARS
        self.concurrency = concurrency or config.CONCURRENCY

        # One GoogleTranslator per thread — it isn't obviously thread-safe,
        # and a single Translator instance may be shared across a thread pool.
        self._local = threading.local()

    def _get_engine(self):
        engine = getattr(self._local, "engine", None)
        if engine is None:
            from deep_translator import GoogleTranslator

            engine = GoogleTranslator(source=self.source_lang, target=self.target_lang)
            self._local.engine = engine
        return engine

    def _translate_chunk_with_retry(self, chunk: str) -> Optional[str]:
        engine = self._get_engine()
        for attempt in range(self.max_retries):
            try:
                result = engine.translate(chunk)
                return result.strip() if isinstance(result, str) else result
            except Exception as e:
                name = type(e).__name__
                if any(marker in name for marker in RATE_LIMIT_MARKERS):
                    # Hard backoff: 4s, 8s, 16s, 32s, 64s
                    wait_s = 4 * (2 ** attempt) + random.uniform(0, 1)
                    print(f"[rate-limit] {name}: sleeping {wait_s:.1f}s (attempt {attempt+1}/{self.max_retries})")
                    time.sleep(wait_s)
                elif attempt < self.max_retries - 1:
                    # Transient — shorter backoff
                    wait_s = 1 * (2 ** attempt)
                    print(f"[transient] {name}: retrying in {wait_s}s")
                    time.sleep(wait_s)
                else:
                    print(f"[failed] {name}: {e}")
                    return None
        return None  # exhausted retries

    def translate(self, text: str) -> Optional[str]:
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
        chunks = chunk_text(protected, self.chunk_size_chars)

        translated_chunks: list[str] = []
        for c in chunks:
            time.sleep(random.randrange(1, 5) / 2.3)  # per-request rate limit floor
            result = self._translate_chunk_with_retry(c)
            if result is None:
                return None
            translated_chunks.append(result)

        joined = " ".join(translated_chunks)
        return restore(joined, originals)

    def translate_batch(self, texts: list[str]) -> list[Optional[str]]:
        """Translate many strings in parallel, preserving input order."""
        with ThreadPoolExecutor(max_workers=self.concurrency) as executor:
            return list(executor.map(self.translate, texts))

    def _translate_rows(
        self,
        rows: list[dict],
        output_path: Union[str, Path],
        column: Optional[str],
    ) -> list[dict]:
        if not rows:
            write_rows(output_path, rows)
            return rows

        column = column or detect_text_column(list(rows[0].keys()), self.source_lang)
        texts = [row.get(column, "") for row in rows]
        translations = self.translate_batch(texts)

        for row, translated in zip(rows, translations):
            row[self.target_lang] = translated

        write_rows(output_path, rows)
        return rows

    def translate_file(
        self,
        input_path: Union[str, Path],
        output_path: Union[str, Path],
        column: Optional[str] = None,
    ) -> list[dict]:
        """
        Load a .csv/.json/.jsonl/.parquet dataset, translate one column
        (auto-detected by name if not given), and write the result —
        original columns plus a new `self.target_lang` column — to
        output_path in the same format as its extension.
        """
        return self._translate_rows(load_rows(input_path), output_path, column)

    def translate_hf_dataset(
        self,
        dataset_name: str,
        output_path: Union[str, Path],
        split: str = "train",
        column: Optional[str] = None,
        limit: Optional[int] = None,
        hf_token: Optional[str] = None,
    ) -> list[dict]:
        """
        Load a dataset from the Hugging Face Hub (streaming, so `limit` can
        cap a huge dataset to a sample without downloading it in full),
        translate one column, and write the result to output_path
        (.csv/.json/.jsonl/.parquet, by its extension).
        """
        rows = load_hf_rows(dataset_name, split=split, token=hf_token or config.HF_TOKEN, limit=limit)
        return self._translate_rows(rows, output_path, column)

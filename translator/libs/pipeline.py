import json
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, as_completed, wait
from typing import Optional

from datasets import load_dataset

from .config import (
    CONCURRENCY,
    DATASET_NAME,
    DATASET_SPLIT,
    FILE_SIZE,
    HF_TOKEN,
    MAX_IN_FLIGHT,
    OUTPUT_DIR,
    OUTPUT_PREFIX,
    PROGRESS_EVERY,
)
from .core import Translator


def process_example(translator: Translator, example: dict) -> Optional[dict]:
    text = example.get("text", "").strip()
    if not text:
        return None

    translated = translator.translate(text)
    if translated is None:
        return None

    return {"en": text, "km": translated}


class RotatingWriter:
    """Writes JSONL records, rotating to a new output file every `file_size` records."""

    def __init__(self, output_dir, prefix: str, file_size: int):
        self.output_dir = output_dir
        self.prefix = prefix
        self.file_size = file_size
        self.file_index = 0
        self.written_in_file = 0
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._file = self._open_next()

    def _open_next(self):
        return (self.output_dir / f"{self.prefix}_{self.file_index}.jsonl").open("w", encoding="utf-8")

    def write(self, record: dict) -> None:
        self._file.write(json.dumps(record, ensure_ascii=False) + "\n")
        self.written_in_file += 1
        if self.written_in_file >= self.file_size:
            self._file.close()
            self.file_index += 1
            self.written_in_file = 0
            self._file = self._open_next()

    def close(self) -> None:
        self._file.close()


def run() -> None:
    ds = load_dataset(DATASET_NAME, split=DATASET_SPLIT, streaming=True, token=HF_TOKEN)
    writer = RotatingWriter(OUTPUT_DIR, OUTPUT_PREFIX, FILE_SIZE)
    translator = Translator()
    total_processed = 0

    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        futures = set()

        for example in ds:
            futures.add(executor.submit(process_example, translator, example))

            if len(futures) >= MAX_IN_FLIGHT:
                done, futures = wait(futures, return_when=FIRST_COMPLETED)

                for future in done:
                    result = future.result()
                    if result:
                        writer.write(result)
                        total_processed += 1

                    if total_processed % PROGRESS_EVERY == 0:
                        print(f"Processed {total_processed}")

        for future in as_completed(futures):
            result = future.result()
            if result:
                writer.write(result)
                total_processed += 1

    writer.close()
    print(f"Done. Processed {total_processed}")

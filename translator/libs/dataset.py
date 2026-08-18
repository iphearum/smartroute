import csv
import itertools
import json
from pathlib import Path
from typing import Optional, Union

# Column names checked (case-insensitive) when auto-detecting the text
# column, in priority order after the source language code itself.
CANDIDATE_COLUMNS = ["text", "english", "content", "sentence", "source", "input", "prompt"]

SUPPORTED_FORMATS = (".csv", ".json", ".jsonl", ".parquet")


def detect_text_column(columns: list[str], source_lang: Optional[str] = None) -> str:
    """Pick the column holding source text, by name then by elimination."""
    lower_map = {c.lower(): c for c in columns}
    candidates = [source_lang.lower(), *CANDIDATE_COLUMNS] if source_lang else CANDIDATE_COLUMNS
    for candidate in candidates:
        if candidate in lower_map:
            return lower_map[candidate]
    if len(columns) == 1:
        return columns[0]
    raise ValueError(f"Could not auto-detect a text column among {columns}")


def load_rows(path: Union[str, Path]) -> list[dict]:
    """Load rows from a local .csv, .json, .jsonl, or .parquet file."""
    path = Path(path)
    suffix = path.suffix.lower()
    if suffix == ".csv":
        with path.open(newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))
    if suffix == ".jsonl":
        with path.open(encoding="utf-8") as f:
            return [json.loads(line) for line in f if line.strip()]
    if suffix == ".json":
        with path.open(encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError(f"{path}: expected a JSON array of objects")
        return data
    if suffix == ".parquet":
        import pandas as pd

        return pd.read_parquet(path).to_dict("records")
    raise ValueError(f"Unsupported dataset format: {suffix} (expected {', '.join(SUPPORTED_FORMATS)})")


def write_rows(path: Union[str, Path], rows: list[dict]) -> None:
    """Write rows to a local .csv, .json, .jsonl, or .parquet file."""
    path = Path(path)
    suffix = path.suffix.lower()
    path.parent.mkdir(parents=True, exist_ok=True)

    if suffix == ".csv":
        fieldnames = list(rows[0].keys()) if rows else []
        with path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)
    elif suffix == ".jsonl":
        with path.open("w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")
    elif suffix == ".json":
        with path.open("w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
    elif suffix == ".parquet":
        import pandas as pd

        pd.DataFrame(rows).to_parquet(path, index=False)
    else:
        raise ValueError(f"Unsupported dataset format: {suffix} (expected {', '.join(SUPPORTED_FORMATS)})")


def load_hf_rows(
    dataset_name: str,
    split: str = "train",
    token: Optional[str] = None,
    limit: Optional[int] = None,
) -> list[dict]:
    """
    Load rows from a Hugging Face Hub dataset. Streams and stops after
    `limit` rows when given, so a huge dataset doesn't have to be pulled
    in full just to translate a sample.
    """
    from datasets import load_dataset

    ds = load_dataset(dataset_name, split=split, token=token, streaming=limit is not None)
    if limit is not None:
        return list(itertools.islice(ds, limit))
    return list(ds)

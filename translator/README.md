# translator

A small package that translates text to Khmer with Google Translate (via
`deep_translator`), plus a batch pipeline that streams an English dataset
from Hugging Face and writes translated pairs out as rotating JSONL files.

Code blocks, inline code, and URLs are protected from translation and
spliced back into the output untouched.

## Layout

```
translator/
  main.py              entry point — runs the HF streaming pipeline
  libs/
    config.py           settings, loaded from .env / environment
    core.py              Translator class — the library's public API
    dataset.py           load/write .csv/.json/.jsonl/.parquet, HF Hub loading, column auto-detect
    protect.py           protect()/restore() code & URL placeholders
    chunking.py          splits long text into request-sized chunks
    pipeline.py           HF dataset streaming, worker pool, output rotation
  .env.example           template for local config
main_translate.py        translate a local dataset file (csv/json/jsonl)
```

## Setup

```bash
pip install -r translator/requirements.txt --break-system-packages
cp translator/.env.example translator/.env
```

## Use it as a library

```python
from translator import Translator

ts = Translator()                              # defaults from translator/.env
text = ts.translate("Hello, world!")

ts2 = Translator(source_lang="en", target_lang="km", max_retries=3)
text2 = ts2.translate("Some other text")
```

`Translator(...)` accepts `source_lang`, `target_lang`, `max_retries`,
`chunk_size_chars`, and `concurrency` — any omitted argument falls back to
`translator/.env`. `translate()` returns `None` if translation failed after
all retries. A `Translator` instance is safe to share across threads (each
thread gets its own underlying `GoogleTranslator`).

Two more methods build on `translate()`:

- `ts.translate_batch(texts)` — translates a list of strings in parallel
  (`self.concurrency` workers), preserving order.
- `ts.translate_file(input_path, output_path, column=None)` — loads a
  `.csv`/`.json`/`.jsonl`/`.parquet` file, auto-detects which column holds
  the source text (checks `source_lang`, then common names like `text`,
  `english`, `content`, `sentence`; pass `column=` to skip detection),
  translates it, and writes every original column plus a new
  `self.target_lang` column to `output_path` in the format matching its
  extension.
- `ts.translate_hf_dataset(dataset_name, output_path, split="train", column=None, limit=None, hf_token=None)` —
  same as `translate_file` but the source is a Hugging Face Hub dataset,
  loaded via streaming so `limit` can pull just a sample without
  downloading the whole thing.

## Translate a local dataset file

`main_translate.py` is a small script built on `translate_file`:

```python
from translator import Translator

ts = Translator("en", "km", max_retries=5, chunk_size_chars=4500, concurrency=4)
ts.translate_file("data/cleaned_data.csv", "data/translated_data.csv")     # or .json / .jsonl / .parquet
```

Edit the variables at the top of `main_translate.py` (dataset path, output
path, languages, concurrency) and run:

```bash
python3 main_translate.py
```

## Translate a Hugging Face dataset

```python
from translator import Translator

ts = Translator("en", "km", concurrency=4)
ts.translate_hf_dataset("Skylion007/openwebtext", "data/hf_sample.jsonl", limit=1000)
```

Omit `limit` to walk the full split (combine with `translate_hf_dataset`
inside your own loop, or use the batch pipeline below for large-scale runs
with output rotation).

## Run the batch pipeline (large-scale HF streaming with output rotation)

```bash
python3 main.py                       # from inside translator/, or:
python3 -c "from translator.libs.pipeline import run; run()"
```

Streams `DATASET_NAME`/`DATASET_SPLIT` from Hugging Face and writes to
`$OUTPUT_DIR/$OUTPUT_PREFIX_<n>.jsonl`, rotating to a new file every
`FILE_SIZE` records. Each line is `{"en": ..., "km": ...}`. Configure via
`translator/.env` (see table below).

## Config (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `SOURCE_LANG` | `en` | source language code |
| `TARGET_LANG` | `km` | target language code |
| `DATASET_NAME` | `Skylion007/openwebtext` | HF dataset to stream |
| `DATASET_SPLIT` | `train` | dataset split |
| `HF_TOKEN` | _(empty)_ | HF token, for private/gated datasets |
| `OUTPUT_DIR` | `datasets/translation` | output directory |
| `OUTPUT_PREFIX` | `translate_7M_en_km` | output filename prefix |
| `FILE_SIZE` | `500` | records per output file before rotating |
| `CONCURRENCY` | `4` | worker threads |
| `MAX_IN_FLIGHT` | `50` | max in-flight futures before draining |
| `MAX_RETRIES` | `5` | retries per translation call |
| `CHUNK_SIZE_CHARS` | `4500` | max chars per Google Translate request |
| `PROGRESS_EVERY` | `20` | log a progress line every N records |

## Notes

- `deep_translator` scrapes web Google Translate — it has no API key and
  rate-limits hard. Keep `CONCURRENCY` low (2-5); the pipeline backs off
  automatically on `429`s.
- `old.py` is the original single-file script, kept for reference.

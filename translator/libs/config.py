import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

SOURCE_LANG = os.getenv("SOURCE_LANG", "en")
TARGET_LANG = os.getenv("TARGET_LANG", "km")

DATASET_NAME = os.getenv("DATASET_NAME", "Skylion007/openwebtext")
DATASET_SPLIT = os.getenv("DATASET_SPLIT", "train")
HF_TOKEN = os.getenv("HF_TOKEN")

OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "datasets/translation"))
OUTPUT_PREFIX = os.getenv("OUTPUT_PREFIX", "translate")
FILE_SIZE = int(os.getenv("FILE_SIZE", 500))  # examples per output file

# Be conservative. deep_translator scrapes web Translate, which rate-limits hard.
CONCURRENCY = int(os.getenv("CONCURRENCY", 4))
MAX_IN_FLIGHT = int(os.getenv("MAX_IN_FLIGHT", 50))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", 5))            # per translation call, with exponential backoff
CHUNK_SIZE_CHARS = int(os.getenv("CHUNK_SIZE_CHARS", 4500))  # Google Translate caps around 5000 chars/request

PROGRESS_EVERY = int(os.getenv("PROGRESS_EVERY", 20))

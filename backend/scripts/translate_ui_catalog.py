"""Translate a frontend UI catalog while preserving its JSON key structure.

Example: ``python backend/scripts/translate_ui_catalog.py --target km``.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

# Allow the script to run directly from the repository root or backend folder,
# like the other operational scripts in this directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.support.translation import TranslationOptions, TranslationService


def _translate(value: Any, service: TranslationService, target: str) -> Any:
    if isinstance(value, dict):
        return {key: _translate(item, service, target) for key, item in value.items()}
    if isinstance(value, list):
        return [_translate(item, service, target) for item in value]
    if isinstance(value, str):
        return service.translate(value, target) or value
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", required=True, help="Target locale, for example km")
    parser.add_argument("--source", default="en", help="Source locale file")
    parser.add_argument(
        "--directory",
        type=Path,
        default=Path(__file__).parents[2] / "frontend" / "public" / "lang",
    )
    parser.add_argument("--force", action="store_true", help="Replace an existing target file")
    args = parser.parse_args()

    source_path = args.directory / f"{args.source}.json"
    target_path = args.directory / f"{args.target}.json"
    if target_path.exists() and not args.force:
        raise SystemExit(f"Refusing to overwrite {target_path}; pass --force")
    source = json.loads(source_path.read_text(encoding="utf-8"))
    service = TranslationService(TranslationOptions(source_language=args.source))
    translated = _translate(source, service, args.target)
    target_path.write_text(
        json.dumps(translated, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {target_path}")


if __name__ == "__main__":
    main()

"""Fill English and country-local names directly on OSM features."""

from __future__ import annotations

import argparse
import asyncio

from tqdm import tqdm

from libs.cambodia import REGIONS
from libs.translation import TranslationOptions, TranslationService, languages_for_country
from services.map_models import MapRecord, OsmFeature
from services.settings import TORTOISE_ORM, settings
from tortoise import Tortoise


def service() -> TranslationService:
    return TranslationService(TranslationOptions(
        enabled=settings.translation_enabled,
        concurrency=settings.translation_concurrency,
        max_retries=settings.translation_max_retries,
        max_chars=settings.translation_chunk_chars,
    ))


async def sync_batch(rows: list[dict], local_language: str, translator: TranslationService,
                     force: bool = False) -> int:
    updates: dict[int, OsmFeature] = {}
    translated = 0
    for target, destination, preferred_source in (
        ("en", "name", "name_base"),
        (local_language, "name_base", "name"),
    ):
        pending = [row for row in rows if (force or not row.get(destination)) and
                   (row.get(preferred_source) or row.get("name"))]
        results = await asyncio.to_thread(
            translator.translate_many,
            (row.get(preferred_source) or row["name"] for row in pending), target,
        )
        for row, value in zip(pending, results):
            if not value:
                continue
            obj = updates.setdefault(row["id"], OsmFeature(
                id=row["id"], name=row.get("name"), name_base=row.get("name_base"),
                base_language=local_language, translated=row.get("translated", False),
            ))
            setattr(obj, destination, value)
            if destination == "name_base":
                obj.translated = True
            translated += 1
    if updates:
        await OsmFeature.bulk_update(
            list(updates.values()), fields=("name", "name_base", "base_language", "translated"),
            batch_size=500,
        )
    return translated


async def run(regions: list[str], batch_size: int = 250,
              force: bool = False, show_progress: bool = True) -> None:
    await Tortoise.init(config=TORTOISE_ORM)
    translator = service()
    total_translated = 0
    try:
        for slug in regions:
            map_record = await MapRecord.get_or_none(country_slug="cambodia", province_slug=slug)
            if not map_record:
                tqdm.write(f"[{slug}] skipped: map is not registered")
                continue
            local_language = languages_for_country("cambodia")[0]
            count = await OsmFeature.filter(map_id=map_record.id, active=True).count()
            progress = tqdm(total=count, desc=f"Translating {slug}", unit="feature",
                            dynamic_ncols=True, disable=not show_progress)
            for offset in range(0, count, batch_size):
                rows = await OsmFeature.filter(map_id=map_record.id, active=True).offset(offset).limit(
                    batch_size
                ).values("id", "name", "name_base", "base_language", "translated")
                total_translated += await sync_batch(rows, local_language, translator, force)
                progress.update(len(rows))
            progress.close()
    finally:
        await Tortoise.close_connections()
    print(f"Translation sync finished: translated={total_translated:,}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regions", nargs="*", choices=sorted(REGIONS))
    parser.add_argument("--batch-size", type=int, default=250)
    parser.add_argument("--force", action="store_true", help="Refresh machine translations")
    parser.add_argument("--no-progress", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.regions or list(REGIONS), args.batch_size,
                    args.force, not args.no_progress))

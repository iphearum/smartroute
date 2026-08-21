"""Import Cambodia POIs province-by-province with localized, resumable upserts."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from tqdm import tqdm

from app.support.cambodia import REGIONS, province_polygon
from app.services.map.map_service import MapService
from app.clients.osm_places import download_osm_places_from_polygon
from config.settings import settings


def download_region(slug: str):
    display_name = REGIONS[slug]
    polygon, area_km2, boundary_query = province_polygon(display_name)
    places = download_osm_places_from_polygon(polygon)
    return slug, display_name, area_km2, boundary_query, places


async def run(selected: list[str], stop_on_error: bool = False, show_progress: bool = True,
              workers: int = 2) -> None:
    unknown = sorted(set(selected) - REGIONS.keys())
    if unknown:
        raise ValueError(f"Unknown region(s): {', '.join(unknown)}")
    totals = {"received": 0, "created": 0, "updated": 0, "failed": 0}
    async with MapService(Path("maps"), settings.database_url) as store:
        regions = tqdm(total=len(selected), desc="Cambodia places", unit="region",
                       dynamic_ncols=True, disable=not show_progress)
        worker_count = max(1, min(workers, len(selected), 8))
        semaphore = asyncio.Semaphore(worker_count)

        async def download_one(position: int, slug: str):
            async with semaphore:
                if not show_progress:
                    print(f"[{position}/{len(selected)}] Downloading {REGIONS[slug]}, Cambodia…",
                          flush=True)
                try:
                    result = await asyncio.to_thread(download_region, slug)
                    return (*result, None)
                except Exception as exc:
                    return slug, REGIONS[slug], 0.0, "", [], exc

        tasks = [asyncio.create_task(download_one(position, slug))
                 for position, slug in enumerate(selected, 1)]
        for future in asyncio.as_completed(tasks):
            try:
                slug, display_name, area_km2, boundary_query, places, error = await future
                if error:
                    raise error
                if not await store.get_map("cambodia", slug):
                    await store.register_map(
                        "cambodia", slug, f"{display_name}, Cambodia",
                        metadata={"base_language": "km", "languages": ["km", "en"]},
                    )
                message = f"[{slug}] boundary={boundary_query!r}, area={area_km2:.0f} km²"
                tqdm.write(message) if show_progress else print(message, flush=True)
                regions.set_postfix(pois=len(places), refresh=True)
                result = await store.import_places("cambodia", slug, places)
                for key in ("received", "created", "updated"):
                    totals[key] += result[key]
                if show_progress:
                    tqdm.write(f"[{slug}] {result}")
                else:
                    print(f"[{slug}] {result}", flush=True)
            except Exception as exc:
                totals["failed"] += 1
                if show_progress:
                    tqdm.write(f"[{slug}] failed: {exc}")
                else:
                    print(f"[{slug}] failed: {exc}", flush=True)
                if stop_on_error:
                    for task in tasks:
                        task.cancel()
                    raise
            finally:
                regions.update(1)
        regions.close()
    print(f"Cambodia import finished: {totals}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regions", nargs="*", choices=sorted(REGIONS),
                        help="Optional region slugs; defaults to all 25 regions")
    parser.add_argument("--stop-on-error", action="store_true",
                        help="Stop immediately instead of continuing with the next province")
    parser.add_argument("--no-progress", action="store_true",
                        help="Disable tqdm progress bars for CI or redirected logs")
    parser.add_argument("--workers", type=int, default=2,
                        help="Concurrent province download threads (default: 2)")
    args = parser.parse_args()
    asyncio.run(run(args.regions or list(REGIONS), args.stop_on_error,
                    not args.no_progress, args.workers))

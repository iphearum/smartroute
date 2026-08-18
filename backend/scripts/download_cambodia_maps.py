"""Download routable Cambodia road graphs as province-level GraphML files."""

from __future__ import annotations

import argparse
import asyncio
import os
from pathlib import Path

import osmnx as ox
from tqdm import tqdm

from libs.cambodia import REGIONS, province_polygon
from libs.overpass import call as overpass_call
from services.map_store import MapStore
from services.settings import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
MAPS_DIR = BACKEND_DIR / "maps"


def download_graph(slug: str, display_name: str, network_type: str, force: bool) -> Path:
    destination = MAPS_DIR / "cambodia" / slug / "base" / f"{slug}.graphml"
    if destination.is_file() and destination.stat().st_size and not force:
        return destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".graphml.part")
    polygon, area_km2, query = province_polygon(display_name)
    print(f"[{slug}] boundary={query!r}, area={area_km2:.0f} km²", flush=True)
    try:
        graph = overpass_call(
            lambda: ox.graph_from_polygon(
                polygon, network_type=network_type, simplify=True, retain_all=True
            ),
            f"road network for {display_name}",
        )
        if not graph.number_of_nodes():
            raise ValueError("OpenStreetMap returned no routable road nodes")
        ox.save_graphml(graph, temporary)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()
    return destination


async def run(selected: list[str], network_type: str = "drive", force: bool = False,
              stop_on_error: bool = False, show_progress: bool = True,
              workers: int = 2) -> None:
    store = MapStore(MAPS_DIR, settings.database_url)
    await store.initialize()
    completed = skipped = failed = 0
    regions = tqdm(selected, desc="Cambodia road maps", unit="map", dynamic_ncols=True,
                   disable=not show_progress)
    worker_count = max(1, min(workers, len(selected), 8))
    semaphore = asyncio.Semaphore(worker_count)

    async def download_one(position: int, slug: str):
        async with semaphore:
            display_name = REGIONS[slug]
            destination = MAPS_DIR / "cambodia" / slug / "base" / f"{slug}.graphml"
            existed = destination.is_file() and destination.stat().st_size > 0
            if not show_progress:
                print(f"[{position}/{len(selected)}] {display_name}", flush=True)
            try:
                graph_path = await asyncio.to_thread(
                    download_graph, slug, display_name, network_type, force
                )
                return slug, display_name, graph_path, existed, None
            except Exception as exc:
                return slug, display_name, None, existed, exc

    tasks = [asyncio.create_task(download_one(position, slug))
             for position, slug in enumerate(selected, 1)]
    try:
        for future in asyncio.as_completed(tasks):
            try:
                slug, display_name, graph_path, existed, error = await future
                if error:
                    raise error
                assert graph_path is not None
                if existed and not force:
                    skipped += 1
                else:
                    completed += 1
                current = await store.get_map("cambodia", slug)
                metadata = {
                    **((current or {}).get("metadata") or {}),
                    "base_language": "km", "languages": ["km", "en"],
                    "network_type": network_type,
                }
                await store.register_map(
                    "cambodia", slug, f"{display_name}, Cambodia", str(graph_path),
                    version=(current or {}).get("version", "1.0.0"), metadata=metadata,
                )
                message = f"[{slug}] {graph_path} ({graph_path.stat().st_size / 1_048_576:.1f} MB)"
                tqdm.write(message) if show_progress else print(message, flush=True)
            except Exception as exc:
                failed += 1
                message = f"[{slug}] failed: {exc}"
                tqdm.write(message) if show_progress else print(message, flush=True)
                if stop_on_error:
                    for task in tasks:
                        task.cancel()
                    raise
            finally:
                regions.update(1)
    finally:
        regions.close()
        await store.close()
    print(f"Road-map download finished: downloaded={completed}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--regions", nargs="*", choices=sorted(REGIONS),
                        help="Province slugs; omit to download all 25 regions")
    parser.add_argument("--network-type", choices=("drive", "bike", "walk", "all"), default="drive")
    parser.add_argument("--force", action="store_true", help="Replace existing GraphML files")
    parser.add_argument("--stop-on-error", action="store_true")
    parser.add_argument("--no-progress", action="store_true")
    parser.add_argument("--workers", type=int, default=2,
                        help="Concurrent province download threads (default: 2)")
    args = parser.parse_args()
    asyncio.run(run(args.regions or list(REGIONS), args.network_type, args.force,
                    args.stop_on_error, not args.no_progress, args.workers))

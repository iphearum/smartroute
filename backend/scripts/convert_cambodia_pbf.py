"""Convert a Cambodia OSM PBF into province-level OSMnx GraphML road maps."""

from __future__ import annotations

import argparse
import asyncio
import os
import re
from pathlib import Path
from typing import Any

import osmnx as ox
from tqdm import tqdm

from libs.cambodia import REGIONS, province_name
from services.map_store import MapStore
from services.settings import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
MAPS_DIR = BACKEND_DIR / "maps"
DEFAULT_PBF = MAPS_DIR / "cambodia-latest.osm.pbf"
NETWORK_TYPES = {
    "drive": "driving",
    "bike": "cycling",
    "walk": "walking",
    "all": "all",
}
REGION_ALIASES = {
    "banteay_meanchey": {"Bantey Meanchey"},
    "preah_sihanouk": {"Khaet Preah Sihanouk"},
    "tboung_khmum": {"Tbong Khmum"},
}


def _pyrosm():
    try:
        from pyrosm import OSM
    except ImportError as exc:
        raise RuntimeError(
            "Pyrosm is required for local PBF conversion. Run: pip install -r requirements.txt"
        ) from exc
    return OSM


def _normalized(value: Any) -> str:
    text = str(value or "").casefold().replace("province", "")
    return re.sub(r"[^a-z0-9]+", "", text)


def load_province_boundaries(pbf_path: Path) -> dict[str, Any]:
    """Read Cambodia's level-4 administrative province polygons locally."""
    OSM = _pyrosm()
    reader = OSM(str(pbf_path), keep_metadata=False)
    boundaries = reader.get_boundaries(
        extra_attributes=["admin_level", "name:en", "name:km"],
    )
    if boundaries is None or boundaries.empty:
        raise RuntimeError("The PBF contains no admin-level 4 Cambodia boundaries")
    boundaries = boundaries[boundaries["admin_level"].astype(str).str.replace(".0", "", regex=False).eq("4")]
    if len(boundaries) != len(REGIONS):
        raise RuntimeError(
            f"Expected {len(REGIONS)} Cambodia admin-level 4 boundaries, found {len(boundaries)}"
        )

    resolved: dict[str, Any] = {}
    for slug, display_name in REGIONS.items():
        expected_names = {
            display_name, province_name(display_name), slug,
            *REGION_ALIASES.get(slug, set()),
        }
        expected = {_normalized(value) for value in expected_names}
        matches = []
        for _, row in boundaries.iterrows():
            names = {_normalized(row.get(key)) for key in ("name", "name:en")}
            if expected & names:
                matches.append(row.get("geometry"))
        matches = [geometry for geometry in matches if geometry is not None and not geometry.is_empty]
        if len(matches) != 1:
            available = sorted(str(value) for value in boundaries["name:en"].dropna().unique())
            raise RuntimeError(
                f"Expected one boundary for {display_name}, found {len(matches)}. "
                f"Available level-4 name:en values: {', '.join(available)}"
            )
        resolved[slug] = matches[0]
    return resolved


def convert_province(pbf_path: Path, slug: str, polygon: Any,
                     network_type: str, force: bool) -> tuple[Path, int, int, bool]:
    """Extract one province network and atomically save an OSMnx GraphML file."""
    destination = MAPS_DIR / "cambodia" / slug / "base" / f"{slug}.graphml"
    existed = destination.is_file() and destination.stat().st_size > 0
    if existed and not force:
        graph = ox.load_graphml(destination)
        return destination, graph.number_of_nodes(), graph.number_of_edges(), True

    OSM = _pyrosm()
    reader = OSM(str(pbf_path), bounding_box=polygon, keep_metadata=False)
    pyrosm_type = NETWORK_TYPES[network_type]
    nodes, edges = reader.get_network(network_type=pyrosm_type, nodes=True)
    if nodes is None or edges is None or nodes.empty or edges.empty:
        raise RuntimeError(f"No {network_type} road network found in {slug}")

    graph = OSM.to_graph(
        nodes,
        edges,
        graph_type="networkx",
        network_type=pyrosm_type,
        retain_all=False,
        osmnx_compatible=True,
        simplify=True,
    )
    if not graph.number_of_nodes() or not graph.number_of_edges():
        raise RuntimeError(f"Conversion produced an empty graph for {slug}")

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".graphml.part")
    try:
        ox.save_graphml(graph, temporary)
        os.replace(temporary, destination)
    finally:
        if temporary.exists():
            temporary.unlink()
    return destination, graph.number_of_nodes(), graph.number_of_edges(), False


async def run(pbf_path: Path, selected: list[str], network_type: str = "drive",
              force: bool = False, workers: int = 2, stop_on_error: bool = False,
              show_progress: bool = True) -> None:
    pbf_path = pbf_path.expanduser().resolve()
    if not pbf_path.is_file() or pbf_path.stat().st_size == 0:
        raise FileNotFoundError(f"PBF file is missing or empty: {pbf_path}")

    progress = tqdm(total=len(selected), desc="Reading province boundaries", unit="province",
                    dynamic_ncols=True, disable=not show_progress)
    try:
        boundaries = await asyncio.to_thread(load_province_boundaries, pbf_path)
    except Exception:
        progress.close()
        raise
    progress.set_description("Converting province graphs")
    worker_count = max(1, min(workers, len(selected), 6))
    semaphore = asyncio.Semaphore(worker_count)

    async def convert_one(slug: str):
        async with semaphore:
            try:
                result = await asyncio.to_thread(
                    convert_province, pbf_path, slug, boundaries[slug], network_type, force
                )
                return slug, result, None
            except Exception as exc:
                return slug, None, exc

    tasks = [asyncio.create_task(convert_one(slug)) for slug in selected]
    store = MapStore(MAPS_DIR, settings.database_url)
    await store.initialize()
    converted = skipped = failed = 0
    try:
        for future in asyncio.as_completed(tasks):
            slug, result, error = await future
            try:
                if error:
                    raise error
                assert result is not None
                path, nodes, edges, was_skipped = result
                skipped += int(was_skipped)
                converted += int(not was_skipped)
                current = await store.get_map("cambodia", slug)
                metadata = {
                    **((current or {}).get("metadata") or {}),
                    "base_language": "km", "languages": ["km", "en"],
                    "network_type": network_type, "source": "local_osm_pbf",
                    "source_file": pbf_path.name,
                }
                await store.register_map(
                    "cambodia", slug, f"{REGIONS[slug]}, Cambodia", str(path),
                    version=(current or {}).get("version", "1.0.0"), metadata=metadata,
                )
                tqdm.write(
                    f"[{slug}] {'skipped' if was_skipped else 'converted'}: "
                    f"{nodes:,} nodes, {edges:,} edges, {path.stat().st_size / 1_048_576:.1f} MB"
                )
            except Exception as exc:
                failed += 1
                tqdm.write(f"[{slug}] failed: {exc}")
                if stop_on_error:
                    for task in tasks:
                        task.cancel()
                    raise
            finally:
                progress.update(1)
    finally:
        progress.close()
        await store.close()
    print(f"PBF conversion finished: converted={converted}, skipped={skipped}, failed={failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, default=DEFAULT_PBF,
                        help=f"Cambodia PBF path (default: {DEFAULT_PBF})")
    parser.add_argument("--regions", nargs="*", choices=sorted(REGIONS),
                        help="Province slugs; omit to convert all 25 provinces")
    parser.add_argument("--network-type", choices=tuple(NETWORK_TYPES), default="drive")
    parser.add_argument("--workers", type=int, default=2,
                        help="Concurrent local conversions (default: 2, maximum: 6)")
    parser.add_argument("--force", action="store_true", help="Replace existing GraphML files")
    parser.add_argument("--stop-on-error", action="store_true")
    parser.add_argument("--no-progress", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.pbf, args.regions or list(REGIONS), args.network_type, args.force,
                    args.workers, args.stop_on_error, not args.no_progress))

"""Seed buildings, POIs, boundaries, land use, and nature from a local Cambodia PBF."""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from shapely.geometry import mapping
from tqdm import tqdm

from app.support.cambodia import REGIONS
from scripts.convert_cambodia_pbf import DEFAULT_PBF, _pyrosm, load_province_boundaries
from services.map_models import OsmFeature
from app.services.map.map_service import MapService
from config.settings import settings

FEATURE_TYPES = ("buildings", "pois", "boundaries", "landuse", "natural")
FEATURE_NAMES = {
    "buildings": "building", "pois": "poi", "boundaries": "boundary",
    "landuse": "landuse", "natural": "natural",
}
CATEGORY_KEYS = ("amenity", "shop", "tourism", "leisure", "healthcare", "building",
                 "landuse", "natural", "boundary")
TAG_COLUMNS = CATEGORY_KEYS + ("addr:housenumber", "addr:street", "opening_hours", "phone",
                               "website", "wheelchair", "brand", "height", "min_height",
                               "building:levels", "building:min_level", "building:part",
                               "roof:height", "roof:levels", "roof:shape", "layer")


def _value(value: Any):
    if value is None or str(value) == "nan":
        return None
    if hasattr(value, "item"):
        value = value.item()
    return value


def _tags(value: Any) -> dict[str, Any]:
    value = _value(value)
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, dict) else {"_raw": value}
        except json.JSONDecodeError:
            return {"_raw": value}
    return {}


def _load(reader, feature_type: str):
    attributes = ["name:en", "name:km", *TAG_COLUMNS]
    if feature_type == "buildings":
        return reader.get_buildings(extra_attributes=attributes)
    if feature_type == "pois":
        return reader.get_pois(extra_attributes=attributes)
    if feature_type == "boundaries":
        return reader.get_boundaries(extra_attributes=["admin_level", "name:en", "name:km"])
    if feature_type == "landuse":
        return reader.get_landuse(extra_attributes=attributes)
    if feature_type == "natural":
        return reader.get_natural(extra_attributes=attributes)
    raise ValueError(f"Unsupported feature type: {feature_type}")


def extract_features(pbf_path: Path, polygon: Any, selected_types: list[str]):
    OSM = _pyrosm()
    reader = OSM(str(pbf_path), bounding_box=polygon, keep_metadata=False)
    records: list[dict[str, Any]] = []
    counts: dict[str, int] = {}
    for feature_type in selected_types:
        frame = _load(reader, feature_type)
        counts[feature_type] = 0 if frame is None else len(frame)
        if frame is None or frame.empty:
            continue
        for _, row in frame.iterrows():
            geometry = row.get("geometry")
            osm_id = _value(row.get("id"))
            if geometry is None or geometry.is_empty or osm_id is None:
                continue
            point = geometry if geometry.geom_type == "Point" else geometry.representative_point()
            min_lon, min_lat, max_lon, max_lat = geometry.bounds
            tags = _tags(row.get("tags"))
            for key in TAG_COLUMNS:
                value = _value(row.get(key))
                if value is not None:
                    tags[key] = value
            admin_level = _value(row.get("admin_level"))
            if admin_level is not None:
                tags["admin_level"] = admin_level
            category = next((_value(row.get(key)) for key in CATEGORY_KEYS
                             if _value(row.get(key)) is not None), None)
            records.append({
                "osm_type": str(_value(row.get("osm_type")) or "feature"),
                "osm_id": int(osm_id), "feature_type": FEATURE_NAMES[feature_type],
                "name": _value(row.get("name:en")) or _value(row.get("name")),
                "category": str(category) if category else None,
                "name_base": _value(row.get("name:km")) or _value(row.get("name")),
                "base_language": "km",
                "translated": False,
                "geometry": mapping(geometry), "centroid_latitude": float(point.y),
                "centroid_longitude": float(point.x), "bbox_min_latitude": float(min_lat),
                "bbox_min_longitude": float(min_lon), "bbox_max_latitude": float(max_lat),
                "bbox_max_longitude": float(max_lon), "tags": tags, "active": True,
            })
    return records, counts


async def upsert_features(map_id: int, records: list[dict[str, Any]], batch_size: int = 500):
    objects = [OsmFeature(map_id=map_id, **record) for record in records]
    if not objects:
        return 0
    await OsmFeature.bulk_create(
        objects, batch_size=batch_size,
        on_conflict=("map_id", "osm_type", "osm_id", "feature_type"),
        update_fields=("name", "name_base", "base_language", "translated", "category", "geometry_json",
                       "centroid_latitude", "centroid_longitude", "bbox_min_latitude",
                       "bbox_min_longitude", "bbox_max_latitude", "bbox_max_longitude",
                       "tags_json", "active", "updated_at"),
    )
    return len(objects)


async def run(pbf_path: Path, regions: list[str], feature_types: list[str], workers: int = 2,
              batch_size: int = 500, show_progress: bool = True) -> None:
    pbf_path = pbf_path.expanduser().resolve()
    if not pbf_path.is_file():
        raise FileNotFoundError(pbf_path)
    boundaries = await asyncio.to_thread(load_province_boundaries, pbf_path)
    semaphore = asyncio.Semaphore(max(1, min(workers, len(regions), 4)))
    progress = tqdm(total=len(regions), desc="Seeding PBF features", unit="province",
                    dynamic_ncols=True, disable=not show_progress)

    async def extract(slug: str):
        async with semaphore:
            try:
                result = await asyncio.to_thread(
                    extract_features, pbf_path, boundaries[slug], feature_types
                )
                return slug, result, None
            except Exception as exc:
                return slug, None, exc

    seeded = failed = 0
    async with MapService(Path("maps"), settings.database_url) as store:
        tasks = [asyncio.create_task(extract(slug)) for slug in regions]
        for future in asyncio.as_completed(tasks):
            slug, result, error = await future
            try:
                if error:
                    raise error
                assert result is not None
                records, counts = result
                map_record = await store.get_map("cambodia", slug)
                if not map_record:
                    map_record = await store.register_map(
                        "cambodia", slug, f"{REGIONS[slug]}, Cambodia",
                        metadata={"base_language": "km", "languages": ["km", "en"]},
                    )
                seeded += await upsert_features(map_record["id"], records, batch_size)
                tqdm.write(f"[{slug}] upserted={len(records):,} source={counts}")
            except Exception as exc:
                failed += 1
                tqdm.write(f"[{slug}] failed: {exc}")
            finally:
                progress.update(1)
    progress.close()
    print(f"Feature seed finished: upserted={seeded:,}, failed_provinces={failed}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", type=Path, default=DEFAULT_PBF)
    parser.add_argument("--regions", nargs="*", choices=sorted(REGIONS))
    parser.add_argument("--types", nargs="+", choices=FEATURE_TYPES, default=list(FEATURE_TYPES))
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--no-progress", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.pbf, args.regions or list(REGIONS), args.types, args.workers,
                    args.batch_size, not args.no_progress))

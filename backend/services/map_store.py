"""Developer-friendly Tortoise ORM repository for incremental map data."""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tortoise import Tortoise
from tortoise.expressions import Q

from libs.translation import (TranslationOptions, TranslationService, languages_for_country,
                              localize_places)
from tortoise.transactions import in_transaction

from services.map_models import (CustomRoute, MapImage, MapRecord, MapRevision,
                                 OsmFeature, Place, RoadClosure, ThreeDAsset)
from services.settings import TORTOISE_ORM, settings

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")
MAP_FIELDS = ("id", "country_slug", "province_slug", "display_name", "graph_path", "version",
              "status", "metadata", "created_at", "updated_at")
TRANSLATION_SERVICE = TranslationService(TranslationOptions(
    enabled=settings.translation_enabled,
    concurrency=settings.translation_concurrency,
    max_retries=settings.translation_max_retries,
    max_chars=settings.translation_chunk_chars,
))


class MapStore:
    def __init__(self, root: Path, database_url: str | None = None):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path = self.root / "maps.db"
        self.database_url = database_url or f"sqlite://{self.database_path}"

    async def initialize(self, generate_schemas: bool = False):
        config = {**TORTOISE_ORM, "connections": {"default": self.database_url}}
        await Tortoise.init(
            config=config,
            # FastAPI runs lifespan and requests in different asyncio tasks.
            _enable_global_fallback=True,
        )
        if generate_schemas:
            # Intended for isolated tests only; deployed databases use migrations.
            await Tortoise.generate_schemas(safe=True)

    @staticmethod
    async def close():
        await Tortoise.close_connections()

    @staticmethod
    def _now():
        return datetime.now(timezone.utc)

    @staticmethod
    def _meters(value: Any) -> float | None:
        if value is None:
            return None
        match = re.search(r"-?\d+(?:\.\d+)?", str(value).replace(",", "."))
        return float(match.group()) if match else None

    @staticmethod
    def validate_slug(value: str):
        normalized = value.strip().lower()
        if not SLUG_PATTERN.fullmatch(normalized):
            raise ValueError("Names may contain lowercase letters, numbers, hyphens, and underscores")
        return normalized

    def region_directory(self, country: str, province: str):
        country, province = self.validate_slug(country), self.validate_slug(province)
        directory = (self.root / country / province).resolve()
        if self.root not in directory.parents:
            raise ValueError("Invalid map directory")
        for child in ("base", "overlays", "images"):
            (directory / child).mkdir(parents=True, exist_ok=True)
        return directory

    async def _map(self, country: str, province: str):
        country, province = self.validate_slug(country), self.validate_slug(province)
        record = await MapRecord.get_or_none(country_slug=country, province_slug=province)
        if record is None:
            raise KeyError("Map is not registered")
        return record

    async def register_map(self, country: str, province: str, display_name: str,
                           graph_path: str | None = None, version: str = "1.0.0",
                           metadata: dict[str, Any] | None = None):
        country, province = self.validate_slug(country), self.validate_slug(province)
        self.region_directory(country, province)
        defaults = {"display_name": display_name.strip(), "version": version, "metadata": metadata or {}}
        if graph_path:
            defaults["graph_path"] = str(Path(graph_path).resolve())
        await MapRecord.update_or_create(defaults=defaults, country_slug=country, province_slug=province)
        return await self.get_map(country, province)

    async def get_map(self, country: str, province: str):
        country, province = self.validate_slug(country), self.validate_slug(province)
        rows = await MapRecord.filter(country_slug=country, province_slug=province).limit(1).values(*MAP_FIELDS)
        return rows[0] if rows else None

    async def list_maps(self):
        return await MapRecord.all().order_by("country_slug", "province_slug").values(*MAP_FIELDS)

    async def discover_maps(self) -> int:
        """Register non-empty province GraphML files found under the maps directory."""
        discovered = 0
        for base_directory in sorted(self.root.glob("*/*/base")):
            country, province = base_directory.parent.parent.name, base_directory.parent.name
            candidates = [path for path in base_directory.glob("*.graphml")
                          if path.is_file() and path.stat().st_size > 0]
            if not candidates:
                continue
            graph_path = next((path for path in candidates if path.stem == province), candidates[0])
            current = await self.get_map(country, province)
            if current and current.get("graph_path") == str(graph_path.resolve()):
                continue
            await self.register_map(
                country, province, province.replace("_", " ").title(), str(graph_path),
                version=current["version"] if current else "1.0.0",
                metadata=current["metadata"] if current else {"network_type": "drive"},
            )
            discovered += 1
        return discovered

    async def add_update(self, country: str, province: str, version: str, change_type: str,
                         summary: str, graph_path: str | None = None,
                         metadata: dict[str, Any] | None = None):
        record = await self._map(country, province)
        resolved_graph = str(Path(graph_path).resolve()) if graph_path else None
        async with in_transaction() as connection:
            revision = await MapRevision.create(map_id=record.id, version=version, change_type=change_type,
                                                summary=summary, graph_path=resolved_graph,
                                                metadata=metadata or {}, using_db=connection)
            changes = {"version": version, "updated_at": self._now()}
            if resolved_graph:
                changes["graph_path"] = resolved_graph
            await MapRecord.filter(id=record.id).using_db(connection).update(**changes)
        return revision.id

    async def list_updates(self, country: str, province: str):
        record = await self._map(country, province)
        return await MapRevision.filter(map_id=record.id).order_by("-created_at").values(
            "id", "version", "change_type", "summary", "graph_path", "metadata", "created_at")

    async def add_image(self, country: str, province: str, filename: str, content_type: str,
                        data: bytes, caption: str | None = None):
        record = await self._map(country, province)
        image = await MapImage.create(map_id=record.id, filename=Path(filename).name,
                                      content_type=content_type, image_data=data,
                                      byte_size=len(data), caption=caption)
        return image.id

    async def list_images(self, country: str, province: str):
        record = await self._map(country, province)
        return await MapImage.filter(map_id=record.id).order_by("-created_at").values(
            "id", "filename", "content_type", "byte_size", "caption", "created_at")

    async def get_image(self, image_id: int):
        rows = await MapImage.filter(id=image_id).limit(1).values("filename", "content_type", "image_data")
        return rows[0] if rows else None

    async def add_place(self, country: str, province: str, name: str, latitude: float, longitude: float,
                        category: str | None = None, address: str | None = None,
                        metadata: dict[str, Any] | None = None):
        record = await self._map(country, province)
        place = await Place.create(map_id=record.id, name=name.strip(), latitude=latitude,
                                   longitude=longitude, category=category, address=address,
                                   metadata=metadata or {})
        return place.id

    async def import_places(self, country: str, province: str, places: list[dict[str, Any]]):
        """Upsert externally sourced places by their source/type/id identity."""
        record = await self._map(country, province)
        existing_rows = await Place.filter(map_id=record.id).values("id", "metadata")
        existing = {}
        for row in existing_rows:
            meta = row.get("metadata") or {}
            key = (meta.get("source"), meta.get("osm_type"), str(meta.get("osm_id", "")))
            if all(key):
                existing[key] = row
        for item in places:
            meta = item.setdefault("metadata", {})
            key = (meta.get("source"), meta.get("osm_type"), str(meta.get("osm_id", "")))
            previous = existing.get(key)
            if previous:
                previous_translations = (previous.get("metadata") or {}).get("translations")
                if previous_translations:
                    meta.setdefault("translations", previous_translations)
        await asyncio.to_thread(localize_places, places, country, TRANSLATION_SERVICE)
        base_language = languages_for_country(country)[0]
        created = updated = 0
        for item in places:
            meta = item.get("metadata") or {}
            item["name_base"] = item.get("name")
            item["address_base"] = item.get("address")
            item["base_language"] = base_language
            key = (meta.get("source"), meta.get("osm_type"), str(meta.get("osm_id", "")))
            previous = existing.get(key)
            if previous:
                await Place.filter(id=previous["id"]).update(**item, active=True)
                updated += 1
            else:
                await Place.create(map_id=record.id, **item)
                created += 1
        return {"received": len(places), "created": created, "updated": updated}

    async def search_places(self, country: str, province: str, query: str = "", limit: int = 20):
        record, query = await self._map(country, province), query.strip()
        queryset = Place.filter(map_id=record.id, active=True)
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(address__icontains=query) |
                                       Q(category__icontains=query))
        rows = await queryset.limit(max(20, min(limit * 4, 100))).values(
            "id", "name", "name_base", "base_language", "latitude", "longitude",
            "category", "address", "metadata",
            "created_at", "updated_at")
        needle = query.casefold()
        def rank(item):
            name = item["name"].casefold()
            return (0 if name == needle else 1 if name.startswith(needle) else 2,
                    0 if item.get("address") else 1, name)
        return sorted(rows, key=rank)[:max(1, min(limit, 100))]

    async def places_in_viewport(self, country: str, south: float, west: float,
                                 north: float, east: float, limit: int = 500):
        """Return active places across every registered province intersecting a viewport."""
        country = self.validate_slug(country)
        if south > north or not (-90 <= south <= north <= 90):
            raise ValueError("Invalid latitude bounds")
        if not (-180 <= west <= 180 and -180 <= east <= 180):
            raise ValueError("Invalid longitude bounds")
        queryset = Place.filter(
            map__country_slug=country, active=True,
            latitude__gte=south, latitude__lte=north,
        )
        if west <= east:
            queryset = queryset.filter(longitude__gte=west, longitude__lte=east)
        else:
            queryset = queryset.filter(Q(longitude__gte=west) | Q(longitude__lte=east))
        return await queryset.limit(max(1, min(limit, 1000))).values(
            "id", "name", "name_base", "base_language", "latitude", "longitude",
            "category", "address", "metadata", "map__province_slug",
        )

    async def features_in_viewport(self, country: str, south: float, west: float,
                                   north: float, east: float, feature_types: list[str],
                                   limit: int = 2000):
        """Retrieve stored PBF features whose bounding boxes intersect the viewport."""
        country = self.validate_slug(country)
        allowed = {"building", "poi", "boundary", "landuse", "natural"}
        selected = list(dict.fromkeys(feature_types)) if feature_types else ["poi"]
        unknown = sorted(set(selected) - allowed)
        if unknown:
            raise ValueError(f"Unsupported feature type(s): {', '.join(unknown)}")
        if south > north or not (-90 <= south <= north <= 90):
            raise ValueError("Invalid latitude bounds")
        if west > east or not (-180 <= west <= east <= 180):
            raise ValueError("Invalid longitude bounds")
        maximum = max(1, min(limit, 5000))
        rows = await OsmFeature.filter(
            map__country_slug=country, active=True, feature_type__in=selected,
            bbox_max_latitude__gte=south, bbox_min_latitude__lte=north,
            bbox_max_longitude__gte=west, bbox_min_longitude__lte=east,
        ).limit(maximum * 2).values(
            "id", "osm_type", "osm_id", "feature_type", "name", "name_base",
            "base_language", "translated", "category", "geometry", "tags",
            "centroid_latitude", "centroid_longitude", "map__province_slug",
        )
        merged: dict[tuple[str, int, str], dict[str, Any]] = {}
        for row in rows:
            key = (row["osm_type"], row["osm_id"], row["feature_type"])
            if row["feature_type"] == "building":
                tags = row.get("tags") or {}
                levels = self._meters(tags.get("building:levels"))
                min_levels = self._meters(tags.get("building:min_level"))
                row["height_m"] = self._meters(tags.get("height")) or (
                    levels * 3.0 if levels is not None else 6.0
                )
                row["min_height_m"] = self._meters(tags.get("min_height")) or (
                    min_levels * 3.0 if min_levels is not None else 0.0
                )
            merged.setdefault(key, row)
            if len(merged) >= maximum:
                break
        return list(merged.values())

    async def register_three_d_asset(self, country: str, province: str, **values):
        record = await self._map(country, province)
        return await ThreeDAsset.create(map_id=record.id, **values)

    async def three_d_assets_in_viewport(self, country: str, south: float, west: float,
                                         north: float, east: float, limit: int = 100):
        country = self.validate_slug(country)
        if south > north or west > east:
            raise ValueError("Invalid viewport bounds")
        return await ThreeDAsset.filter(
            map__country_slug=country, active=True, latitude__gte=south, latitude__lte=north,
            longitude__gte=west, longitude__lte=east,
        ).limit(max(1, min(limit, 250))).values(
            "id", "name", "model_url", "latitude", "longitude", "altitude",
            "rotation_x", "rotation_y", "rotation_z", "scale", "metadata",
            "map__province_slug",
        )

    async def add_custom_route(self, country: str, province: str, name: str,
                               coordinates: list[list[float]], bidirectional: bool = True,
                               modes: list[str] | None = None,
                               metadata: dict[str, Any] | None = None):
        record = await self._map(country, province)
        route = await CustomRoute.create(map_id=record.id, name=name.strip(), coordinates=coordinates,
                                         bidirectional=bidirectional,
                                         modes=modes or ["car", "motorbike", "bike", "walk"],
                                         metadata=metadata or {})
        return route.id

    async def list_custom_routes(self, country: str, province: str):
        record = await self._map(country, province)
        return await CustomRoute.filter(map_id=record.id, active=True).order_by("id").values(
            "id", "name", "coordinates", "bidirectional", "modes", "metadata",
            "created_at", "updated_at")

    async def add_closure(self, country: str, province: str, source_node: Any, target_node: Any,
                          edge_key: Any = None, reason: str | None = None,
                          starts_at: datetime | None = None, ends_at: datetime | None = None):
        record = await self._map(country, province)
        closure = await RoadClosure.create(map_id=record.id, source_node=source_node,
                                           target_node=target_node, edge_key=edge_key, reason=reason,
                                           starts_at=starts_at, ends_at=ends_at)
        return closure.id

    async def list_closures(self, country: str, province: str, active_now: bool = False):
        record = await self._map(country, province)
        queryset = RoadClosure.filter(map_id=record.id, active=True)
        if active_now:
            now = self._now()
            queryset = queryset.filter((Q(starts_at=None) | Q(starts_at__lte=now)) &
                                       (Q(ends_at=None) | Q(ends_at__gte=now)))
        return await queryset.order_by("id").values("id", "source_node", "target_node", "edge_key",
                                                     "reason", "starts_at", "ends_at", "active", "created_at")

"""Developer-friendly Tortoise ORM repository for incremental map data."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tortoise import Tortoise
from tortoise.expressions import Q
from tortoise.transactions import in_transaction

from services.map_models import CustomRoute, MapImage, MapRecord, MapRevision, Place, RoadClosure
from services.settings import TORTOISE_ORM

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")
MAP_FIELDS = ("id", "country_slug", "province_slug", "display_name", "graph_path", "version",
              "status", "metadata", "created_at", "updated_at")


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

    async def search_places(self, country: str, province: str, query: str = "", limit: int = 20):
        record, query = await self._map(country, province), query.strip()
        queryset = Place.filter(map_id=record.id, active=True)
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(address__icontains=query) |
                                       Q(category__icontains=query))
        return await queryset.order_by("name").limit(max(1, min(limit, 100))).values(
            "id", "name", "latitude", "longitude", "category", "address", "metadata",
            "created_at", "updated_at")

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

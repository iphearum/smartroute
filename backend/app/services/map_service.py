"""Developer-friendly Tortoise ORM repository for incremental map data."""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tortoise import Tortoise
from tortoise.expressions import Q, RawSQL

from app.support.translation import (TranslationOptions, TranslationService, languages_for_country,
                              localize_places)
from tortoise.transactions import in_transaction

from app.models import (CustomRoute, MapImage, MapRecord, MapRevision, OsmFeature,
                        Place, PlaceMedia, PoiTheme, RoadClosure, ShopBranch,
                        ThreeDAsset)
from app.support.slug import validate_slug
from config.database import TORTOISE_ORM
from app.support.tile_cache import TileCache
from config.settings import settings

MAP_FIELDS = ("id", "country_slug", "province_slug", "display_name", "graph_path", "version",
              "status", "metadata", "created_at", "updated_at")
TRANSLATION_SERVICE = TranslationService(TranslationOptions(
    enabled=settings.translation_enabled,
    concurrency=settings.translation_concurrency,
    max_retries=settings.translation_max_retries,
    max_chars=settings.translation_chunk_chars,
))


class MapService:
    def __init__(self, root: Path, database_url: str | None = None):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path = self.root / "maps.db"
        self.database_url = database_url or f"sqlite://{self.database_path}"
        self._place_cache = TileCache(
            ttl_seconds=settings.place_cache_ttl_seconds,
            tile_degrees=settings.place_cache_tile_degrees,
        )
        self._poi_theme_cache: list[dict] | None = None

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

    validate_slug = staticmethod(validate_slug)

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
        """Keep discovery focused on the active GraphHopper/PBF-backed runtime."""
        return 0

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
                        metadata: dict[str, Any] | None = None, source: str = "manual",
                        osm_feature_id: int | None = None):
        record = await self._map(country, province)
        if osm_feature_id is not None and not await OsmFeature.filter(
            id=osm_feature_id, map_id=record.id,
        ).exists():
            raise ValueError("OSM feature does not belong to this map")
        place = await Place.create(map_id=record.id, name=name.strip(), latitude=latitude,
                                   longitude=longitude, category=category, address=address,
                                   metadata=metadata or {}, source=source,
                                   osm_feature_id=osm_feature_id)
        self._place_cache.clear()
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
            item["source"] = "osm"
            key = (meta.get("source"), meta.get("osm_type"), str(meta.get("osm_id", "")))
            previous = existing.get(key)
            if previous:
                await Place.filter(id=previous["id"]).update(**item, active=True)
                updated += 1
            else:
                await Place.create(map_id=record.id, **item)
                created += 1
        if created or updated:
            self._place_cache.clear()
        return {"received": len(places), "created": created, "updated": updated}

    async def search_places(self, country: str, province: str, query: str = "", limit: int = 20):
        record, query = await self._map(country, province), query.strip()
        queryset = Place.filter(map_id=record.id, active=True)
        if query:
            queryset = queryset.filter(Q(name__icontains=query) | Q(address__icontains=query) |
                                       Q(category__icontains=query))
        rows = await queryset.limit(max(20, min(limit * 4, 100))).values(
            "id", "name", "name_base", "base_language", "latitude", "longitude",
            "category", "address", "metadata", "source", "osm_feature_id",
            "created_at", "updated_at")
        needle = query.casefold()
        def rank(item):
            name = item["name"].casefold()
            return (0 if name == needle else 1 if name.startswith(needle) else 2,
                    0 if item.get("address") else 1, name)
        return sorted(rows, key=rank)[:max(1, min(limit, 100))]

    async def places_in_viewport(self, country: str, south: float, west: float,
                                 north: float, east: float, limit: int = 500):
        """Return active places across every registered province intersecting a viewport.

        Requests are snapped to a fixed grid and cached in-process for a few
        hours (see services/place_cache.py), since overlapping/nearby
        viewports are the common case while a client pans the map and place
        data changes rarely.
        """
        country = self.validate_slug(country)
        if south > north or not (-90 <= south <= north <= 90):
            raise ValueError("Invalid latitude bounds")
        if not (-180 <= west <= 180 and -180 <= east <= 180):
            raise ValueError("Invalid longitude bounds")
        bounds = self._place_cache.snap(south, west, north, east)
        rows = self._place_cache.get(country, bounds)
        if rows is None:
            snapped_south, snapped_west, snapped_north, snapped_east = bounds
            queryset = Place.filter(
                map__country_slug=country, active=True,
                latitude__gte=snapped_south, latitude__lte=snapped_north,
            )
            if snapped_west <= snapped_east:
                queryset = queryset.filter(longitude__gte=snapped_west, longitude__lte=snapped_east)
            else:
                queryset = queryset.filter(
                    Q(longitude__gte=snapped_west) | Q(longitude__lte=snapped_east)
                )
            rows = await queryset.limit(8000).values(
                "id", "name", "name_base", "base_language", "latitude", "longitude",
                "category", "address", "metadata", "source", "osm_feature_id",
                "map__province_slug",
            )
            self._place_cache.set(country, bounds, rows)
        # The cache stores/queries the whole snapped tile (bigger than what
        # was actually asked for, so nearby-but-different requests can share
        # it) -- filter back down to the real requested box before limiting,
        # so `limit` picks from what's actually relevant to this call rather
        # than an arbitrary slice of the wider tile.
        if west <= east:
            in_bounds = [
                row for row in rows
                if south <= row["latitude"] <= north and west <= row["longitude"] <= east
            ]
        else:
            in_bounds = [
                row for row in rows
                if south <= row["latitude"] <= north
                and (row["longitude"] >= west or row["longitude"] <= east)
            ]
        # `rows` has no DB-level ordering, so when a request matches far
        # more than `limit` places, slicing naively returns an arbitrary
        # sample. A pure "closest to the box center" sort fixes a tight,
        # already-small box (e.g. a deep zoom) but backfires on a wide,
        # low-zoom box: the matched places tend to cluster near the middle
        # already, so ranking by center-distance just returns that one
        # cluster and leaves the rest of the visible area empty. Instead,
        # bucket the box into a coarse grid and round-robin across cells,
        # so a truncated result stays spread across what's actually visible
        # (matching how e.g. Google Maps keeps a city view informative)
        # rather than concentrated in one spot.
        effective_limit = max(1, min(limit, 3000))
        if len(in_bounds) <= effective_limit:
            return in_bounds
        grid_divisions = 10
        lat_step = (north - south) / grid_divisions or 1
        lon_step = (east - west) / grid_divisions or 1
        buckets: dict[tuple[int, int], list] = {}
        for row in in_bounds:
            cell_lat = min(grid_divisions - 1, int((row["latitude"] - south) / lat_step))
            cell_lon = min(grid_divisions - 1, int((row["longitude"] - west) / lon_step))
            buckets.setdefault((cell_lat, cell_lon), []).append(row)
        ordered: list = []
        round_index = 0
        while len(ordered) < effective_limit:
            added = False
            for bucket in buckets.values():
                if round_index < len(bucket):
                    ordered.append(bucket[round_index])
                    added = True
                    if len(ordered) >= effective_limit:
                        break
            if not added:
                break
            round_index += 1
        return ordered

    async def nearest_place(self, country: str, lat: float, lon: float, box_degrees: float = 0.1):
        """Find the single closest active place to a coordinate.

        Queries with a real `ORDER BY` on squared distance, LIMIT 1 --
        unlike places_in_viewport (which caps an *unordered* result set for
        general viewport rendering), this guarantees the true nearest place
        is found even in dense areas where a plain LIMIT would otherwise
        arbitrarily exclude it.
        """
        country = self.validate_slug(country)
        lat, lon = float(lat), float(lon)
        distance_squared = RawSQL(
            f"(latitude - ({lat})) * (latitude - ({lat})) "
            f"+ (longitude - ({lon})) * (longitude - ({lon}))"
        )
        rows = await Place.filter(
            map__country_slug=country, active=True,
            latitude__gte=lat - box_degrees, latitude__lte=lat + box_degrees,
            longitude__gte=lon - box_degrees, longitude__lte=lon + box_degrees,
        ).annotate(distance_squared=distance_squared).order_by("distance_squared").limit(1).values(
            "id", "name", "name_base", "base_language", "latitude", "longitude",
            "category", "address", "metadata", "source", "osm_feature_id",
            "map__province_slug",
        )
        return rows[0] if rows else None

    async def region_for_point(self, country: str, lat: float, lon: float) -> list[dict]:
        """Administrative boundaries (commune/district/province/...) containing a point.

        Bbox-filters against the already-indexed columns first (cheap), then
        does real point-in-polygon containment on that small candidate set --
        the same geometry format `scripts/seed_cambodia_features.py` writes
        (GeoJSON via shapely's `mapping()`), so it round-trips through
        `shapely.geometry.shape()` the same way. Returns every containing
        boundary sorted most-specific first (highest admin_level, e.g.
        commune before district before province), so a caller can build a
        "District, Province" label instead of only the single narrowest hit.
        """
        from shapely.geometry import Point, shape

        country = self.validate_slug(country)
        candidates = await OsmFeature.filter(
            map__country_slug=country, feature_type="boundary", active=True,
            bbox_min_latitude__lte=lat, bbox_max_latitude__gte=lat,
            bbox_min_longitude__lte=lon, bbox_max_longitude__gte=lon,
        ).values("name", "tags", "geometry")
        point = Point(lon, lat)
        matches = []
        for candidate in candidates:
            try:
                polygon = shape(candidate["geometry"])
            except (ValueError, AttributeError):
                continue
            if polygon.contains(point):
                admin_level = candidate["tags"].get("admin_level")
                try:
                    admin_level = int(admin_level)
                except (TypeError, ValueError):
                    admin_level = 0
                matches.append({"name": candidate["name"], "admin_level": admin_level})
        matches.sort(key=lambda match: match["admin_level"], reverse=True)
        return matches

    async def poi_themes(self) -> list[dict]:
        """Icon/color/priority + matching rules for classifying a place into a POI category.

        Cached for the process lifetime -- this config changes rarely (an
        admin edit, not a per-request concern), so there's no TTL, matching
        how `_place_cache` avoids re-querying static data.
        """
        if self._poi_theme_cache is None:
            self._poi_theme_cache = await PoiTheme.filter(active=True).order_by("match_order").values(
                "key", "label", "icon_svg", "color", "soft_color", "priority", "keywords", "group",
            )
        return self._poi_theme_cache

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
        place_id = values.get("place_id")
        if place_id is not None and not await Place.filter(id=place_id, map_id=record.id).exists():
            raise ValueError("Place does not belong to this map")
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
            "place_id", "map__province_slug",
        )

    async def add_place_media(self, place_id: int, **values):
        if not await Place.filter(id=place_id, active=True).exists():
            raise KeyError("Place not found")
        return await PlaceMedia.create(place_id=place_id, **values)

    async def get_place_profile(self, place_id: int):
        rows = await Place.filter(id=place_id, active=True).values(
            "id", "map_id", "name", "name_base", "address", "address_base",
            "base_language", "latitude", "longitude", "category", "source",
            "osm_feature_id", "metadata", "created_at", "updated_at",
        )
        if not rows:
            raise KeyError("Place not found")
        result = rows[0]
        result["media"] = await PlaceMedia.filter(place_id=place_id).order_by(
            "sort_order", "id"
        ).values("id", "media_type", "url", "thumbnail_url", "caption", "metadata")
        result["three_d_assets"] = await ThreeDAsset.filter(
            place_id=place_id, active=True,
        ).values("id", "name", "model_url", "altitude", "rotation_x", "rotation_y",
                 "rotation_z", "scale", "metadata")
        branches = await ShopBranch.filter(place_id=place_id, active=True).values(
            "id", "business_id", "name", "phone", "email", "opening_hours",
            "pickup_enabled", "delivery_enabled", "metadata",
            "business__display_name", "business__business_type", "business__status",
            "business__verification_status", "business__logo_url",
        )
        result["shops"] = branches
        return result

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

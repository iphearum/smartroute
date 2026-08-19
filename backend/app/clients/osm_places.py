"""Download and normalize searchable OpenStreetMap points of interest."""

from __future__ import annotations

from typing import Any

import osmnx as ox

from app.clients.overpass import call as overpass_call

POI_TAGS = {
    "amenity": True, "shop": True, "tourism": True, "leisure": True,
    "healthcare": True, "office": True, "craft": True, "historic": True,
    "public_transport": True,
}
CATEGORY_KEYS = tuple(POI_TAGS)


def _text(value: Any) -> str | None:
    if value is None or str(value) == "nan":
        return None
    value = str(value).strip()
    return value or None


def _address(row) -> str | None:
    parts = [_text(row.get(key)) for key in (
        "addr:housenumber", "addr:street", "addr:suburb", "addr:city", "addr:postcode"
    )]
    return ", ".join(value for value in parts if value) or None


def _normalize_features(features) -> list[dict[str, Any]]:
    """Convert an OSM feature frame into database-ready place records."""
    results: list[dict[str, Any]] = []
    for index, row in features.iterrows():
        name = _text(row.get("name")) or _text(row.get("name:en")) or _text(row.get("name:km"))
        if not name:
            continue
        geometry = row.get("geometry")
        if geometry is None or geometry.is_empty:
            continue
        point = geometry if geometry.geom_type == "Point" else geometry.representative_point()
        osm_type, osm_id = index if isinstance(index, tuple) else ("feature", index)
        category_key = next((key for key in CATEGORY_KEYS if _text(row.get(key))), None)
        category_value = _text(row.get(category_key)) if category_key else None
        metadata = {
            "source": "openstreetmap", "osm_type": str(osm_type), "osm_id": str(osm_id),
            "category_group": category_key, "name_en": _text(row.get("name:en")),
            "name_km": _text(row.get("name:km")), "alt_name": _text(row.get("alt_name")),
            "opening_hours": _text(row.get("opening_hours")), "phone": _text(row.get("phone")),
            "website": _text(row.get("website")), "brand": _text(row.get("brand")),
            "wheelchair": _text(row.get("wheelchair")), "image": _text(row.get("image")),
            "wikimedia_commons": _text(row.get("wikimedia_commons")),
        }
        results.append({"name": name, "latitude": float(point.y), "longitude": float(point.x),
                        "category": category_value, "address": _address(row),
                        "metadata": {key: value for key, value in metadata.items() if value is not None}})
    return results


def download_osm_places(place_query: str) -> list[dict[str, Any]]:
    """Fetch named POIs for a geocoded place boundary."""
    features = overpass_call(
        lambda: ox.features_from_place(place_query, tags=POI_TAGS),
        f"places in {place_query}",
    )
    return _normalize_features(features)


def download_osm_places_from_polygon(polygon) -> list[dict[str, Any]]:
    """Fetch named POIs from an already validated administrative polygon."""
    features = overpass_call(
        lambda: ox.features_from_polygon(polygon, tags=POI_TAGS),
        "places in province polygon",
    )
    return _normalize_features(features)

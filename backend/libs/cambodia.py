"""Cambodia administrative-region names and validated OSM boundary lookup."""

from __future__ import annotations

import osmnx as ox

REGIONS = {
    "banteay_meanchey": "Banteay Meanchey Province", "battambang": "Battambang Province",
    "kampong_cham": "Kampong Cham Province", "kampong_chhnang": "Kampong Chhnang Province",
    "kampong_speu": "Kampong Speu Province", "kampong_thom": "Kampong Thom Province",
    "kampot": "Kampot Province", "kandal": "Kandal Province", "kep": "Kep Province",
    "koh_kong": "Koh Kong Province", "kratie": "Kratie Province",
    "mondulkiri": "Mondulkiri Province", "oddar_meanchey": "Oddar Meanchey Province",
    "pailin": "Pailin Province", "phnom_penh": "Phnom Penh",
    "preah_sihanouk": "Preah Sihanouk Province", "preah_vihear": "Preah Vihear Province",
    "prey_veng": "Prey Veng Province", "pursat": "Pursat Province",
    "ratanakiri": "Ratanakiri Province", "siem_reap": "Siem Reap Province",
    "stung_treng": "Stung Treng Province", "svay_rieng": "Svay Rieng Province",
    "takeo": "Takeo Province", "tboung_khmum": "Tboung Khmum Province",
}
OSM_RELATIONS = {
    "Siem Reap Province": "R2200393",
    "Battambang Province": "R6608542",
    "Kampot Province": "R2200183",
}


def province_name(display_name: str) -> str:
    return display_name.removesuffix(" Province").strip()


def province_polygon(display_name: str):
    """Resolve an administrative polygon and reject city/POI false positives."""
    name = province_name(display_name)
    queries: list[tuple[object, bool]] = []
    if display_name in OSM_RELATIONS:
        queries.append((OSM_RELATIONS[display_name], True))
    queries.extend([
        ({"state": name, "country": "Cambodia"}, False),
        ({"county": name, "country": "Cambodia"}, False),
        (f"{name}, Cambodia", False),
    ])
    failures = []
    for query, by_osmid in queries:
        try:
            boundary = ox.geocode_to_gdf(query, by_osmid=by_osmid)
            if boundary.empty:
                raise ValueError("no geocoder result")
            geometry = boundary.geometry.iloc[0]
            if geometry.geom_type not in {"Polygon", "MultiPolygon"}:
                raise ValueError(f"returned {geometry.geom_type}, not a polygon")
            center = geometry.representative_point()
            if not (102.0 <= center.x <= 108.0 and 9.5 <= center.y <= 15.0):
                raise ValueError("polygon is outside Cambodia")
            projected = boundary.to_crs(boundary.estimate_utm_crs())
            area_km2 = float(projected.geometry.iloc[0].area / 1_000_000)
            if area_km2 < 100:
                raise ValueError(f"polygon is only {area_km2:.1f} km²")
            return geometry, area_km2, query
        except Exception as exc:
            failures.append(f"{query!r}: {exc}")
    raise ValueError("Could not resolve a province boundary. " + " | ".join(failures))

import asyncio

from services.map_models import OsmFeature
from app.services.map.map_service import MapService


def _square(min_lon, min_lat, max_lon, max_lat):
    return {
        "type": "Polygon",
        "coordinates": [[
            [min_lon, min_lat], [max_lon, min_lat],
            [max_lon, max_lat], [min_lon, max_lat], [min_lon, min_lat],
        ]],
    }


async def _seed_boundary(map_id, name, admin_level, min_lon, min_lat, max_lon, max_lat):
    await OsmFeature.create(
        map_id=map_id, osm_type="relation", osm_id=abs(hash(name)) % 10_000_000,
        feature_type="boundary", category="administrative", name=name,
        geometry=_square(min_lon, min_lat, max_lon, max_lat),
        bbox_min_longitude=min_lon, bbox_min_latitude=min_lat,
        bbox_max_longitude=max_lon, bbox_max_latitude=max_lat,
        tags={"admin_level": admin_level},
    )


def test_region_for_point_picks_most_specific_boundary_first(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            map_record = await store.register_map("cambodia", "phnom_penh", "Phnom Penh")
            await _seed_boundary(map_record["id"], "Test Province", 4, 0, 0, 10, 10)
            await _seed_boundary(map_record["id"], "Test District", 6, 1, 1, 2, 2)

            inside_both = await store.region_for_point("cambodia", lat=1.5, lon=1.5)
            assert [m["name"] for m in inside_both] == ["Test District", "Test Province"]

            inside_province_only = await store.region_for_point("cambodia", lat=5, lon=5)
            assert [m["name"] for m in inside_province_only] == ["Test Province"]

            outside_everything = await store.region_for_point("cambodia", lat=50, lon=50)
            assert outside_everything == []
        finally:
            await store.close()

    asyncio.run(scenario())

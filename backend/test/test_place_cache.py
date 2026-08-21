import asyncio

from app.services.map.map_service import MapService
from app.support.tile_cache import TileCache


def test_viewport_places_reuses_cache_for_overlapping_requests(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            await store.register_map("cambodia", "phnom_penh", "Phnom Penh")
            await store.add_place("cambodia", "phnom_penh", "Riverside Cafe", 11.53, 104.93,
                                  category="cafe")
            cache = store._place_cache
            assert len(cache._store) == 0

            # Both requests fall well inside the same 0.05deg grid cell.
            first = await store.places_in_viewport("cambodia", 11.52, 104.92, 11.54, 104.94)
            assert len(first) == 1
            assert len(cache._store) == 1

            second = await store.places_in_viewport("cambodia", 11.525, 104.925, 11.535, 104.935)
            assert second == first
            assert len(cache._store) == 1

            # A viewport far away lands in a different tile and does query.
            await store.places_in_viewport("cambodia", 20.0, 104.9, 20.1, 105.0)
            assert len(cache._store) == 2
        finally:
            await store.close()

    asyncio.run(scenario())


def test_viewport_places_respects_requested_limit_from_cache(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            await store.register_map("cambodia", "phnom_penh", "Phnom Penh")
            for index in range(5):
                await store.add_place(
                    "cambodia", "phnom_penh", f"Place {index}",
                    11.56 + index * 0.001, 104.93, category="shop",
                )
            full = await store.places_in_viewport("cambodia", 11.5, 104.9, 11.6, 104.95, limit=100)
            assert len(full) == 5
            limited = await store.places_in_viewport("cambodia", 11.5, 104.9, 11.6, 104.95, limit=2)
            assert len(limited) == 2
        finally:
            await store.close()

    asyncio.run(scenario())


def test_add_place_invalidates_cache(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            await store.register_map("cambodia", "phnom_penh", "Phnom Penh")
            assert await store.places_in_viewport("cambodia", 11.5, 104.9, 11.6, 104.95) == []
            assert len(store._place_cache._store) == 1

            await store.add_place("cambodia", "phnom_penh", "New Shop", 11.56, 104.93)
            assert len(store._place_cache._store) == 0

            refreshed = await store.places_in_viewport("cambodia", 11.5, 104.9, 11.6, 104.95)
            assert len(refreshed) == 1
        finally:
            await store.close()

    asyncio.run(scenario())


def test_tile_cache_expires_after_ttl():
    cache = TileCache(ttl_seconds=0.05, tile_degrees=0.05)
    bounds = cache.snap(11.5, 104.9, 11.6, 104.95)
    cache.set("cambodia", bounds, ["stub"])
    assert cache.get("cambodia", bounds) == ["stub"]
    import time

    time.sleep(0.1)
    assert cache.get("cambodia", bounds) is None


def test_tile_cache_snap_buckets_nearby_bounds_together():
    cache = TileCache(ttl_seconds=100, tile_degrees=0.05)
    a = cache.snap(11.52, 104.92, 11.54, 104.94)
    b = cache.snap(11.525, 104.925, 11.535, 104.935)
    assert a == b
    far = cache.snap(20.0, 104.9, 20.1, 105.0)
    assert far != a

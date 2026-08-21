import asyncio

from services.map_models import PoiTheme
from app.services.map.map_service import MapService


def test_poi_themes_returns_active_rows_ordered_by_match_order(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            await PoiTheme.create(
                key="cafe", label="Cafe", icon_svg="<path/>", color="#a16207",
                soft_color="#fef3c7", priority=16, match_order=1, keywords=["cafe", "coffee"],
            )
            await PoiTheme.create(
                key="food", label="Food", icon_svg="<path/>", color="#e85d04",
                soft_color="#fff1e8", priority=15, match_order=0, keywords=["restaurant"],
            )
            await PoiTheme.create(
                key="retired", label="Retired", icon_svg="<path/>", color="#000000",
                soft_color="#ffffff", priority=99, match_order=2, keywords=[], active=False,
            )

            themes = await store.poi_themes()
            assert [theme["key"] for theme in themes] == ["food", "cafe"]
            assert themes[0]["keywords"] == ["restaurant"]
        finally:
            await store.close()

    asyncio.run(scenario())


def test_poi_themes_caches_after_first_call(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            await PoiTheme.create(
                key="food", label="Food", icon_svg="<path/>", color="#e85d04",
                soft_color="#fff1e8", priority=15, match_order=0, keywords=["restaurant"],
            )

            first = await store.poi_themes()
            assert len(first) == 1

            await PoiTheme.create(
                key="cafe", label="Cafe", icon_svg="<path/>", color="#a16207",
                soft_color="#fef3c7", priority=16, match_order=1, keywords=["cafe"],
            )
            second = await store.poi_themes()
            assert second is first
            assert len(second) == 1
        finally:
            await store.close()

    asyncio.run(scenario())

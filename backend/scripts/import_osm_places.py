"""Import rich OSM POIs into SmartRoute's configured database."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from services.map_store import MapStore
from services.osm_places import download_osm_places
from services.settings import settings


async def run(args):
    places = await asyncio.to_thread(download_osm_places, args.query)
    store = MapStore(Path("maps"), settings.database_url)
    await store.initialize()
    try:
        result = await store.import_places(args.country, args.province, places)
        print(f"POI import complete: {result}")
    finally:
        await store.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="Phnom Penh, Cambodia", help="OSM geocoding area")
    parser.add_argument("--country", default="cambodia")
    parser.add_argument("--province", default="phnom_penh")
    asyncio.run(run(parser.parse_args()))

"""Import rich OSM POIs into SmartRoute's configured database."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from app.services.map_service import MapService
from app.clients.osm_places import download_osm_places
from config.settings import settings


async def run(args):
    places = await asyncio.to_thread(download_osm_places, args.query)
    async with MapService(Path("maps"), settings.database_url) as store:
        result = await store.import_places(args.country, args.province, places)
        print(f"POI import complete: {result}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--query", default="Phnom Penh, Cambodia", help="OSM geocoding area")
    parser.add_argument("--country", default="cambodia")
    parser.add_argument("--province", default="phnom_penh")
    asyncio.run(run(parser.parse_args()))

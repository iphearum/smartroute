"""Register a georeferenced GLB/GLTF landmark model."""

from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from services.map_store import MapStore
from services.settings import settings


async def run(args) -> None:
    store = MapStore(Path("maps"), settings.database_url)
    await store.initialize()
    try:
        asset = await store.register_three_d_asset(
            args.country, args.province, name=args.name, model_url=args.model_url,
            latitude=args.latitude, longitude=args.longitude, altitude=args.altitude,
            rotation_x=args.rotation_x, rotation_y=args.rotation_y,
            rotation_z=args.rotation_z, scale=args.scale,
        )
        print(f"3D asset registered: id={asset.id}, name={asset.name!r}")
    finally:
        await store.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("name")
    parser.add_argument("model_url", help="Public/CORS-enabled GLB or GLTF URL")
    parser.add_argument("latitude", type=float)
    parser.add_argument("longitude", type=float)
    parser.add_argument("--country", default="cambodia")
    parser.add_argument("--province", default="phnom_penh")
    parser.add_argument("--altitude", type=float, default=0)
    parser.add_argument("--rotation-x", type=float, default=90)
    parser.add_argument("--rotation-y", type=float, default=0)
    parser.add_argument("--rotation-z", type=float, default=0)
    parser.add_argument("--scale", type=float, default=1)
    asyncio.run(run(parser.parse_args()))

"""SmartRoutePP FastAPI application entry point.

Assembly and startup only. Road-graph loading and caching live in
`app/routing/registry.py`; route declarations live in `app/routes/`.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.clients.graphhopper import GraphHopperClient
from app.routes.api import register_routes
from app.routing.pbf import DEFAULT_PBF_PATH, MAPS_DIR
from app.routing.registry import GraphRegistry, resolve_map_region
from app.services.map_service import MapService
from config.settings import settings
from scripts.convert_cambodia_pbf import DEFAULT_PBF, load_province_boundaries

logger = logging.getLogger(__name__)


async def _load_province_boundaries() -> dict:
    if settings.graphhopper_url:
        logger.info("GraphHopper active; skipping expensive local province-boundary import.")
        return {}
    return await asyncio.to_thread(load_province_boundaries, DEFAULT_PBF)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.route_suggestion_jobs = {}
    app.state.poi_import_jobs = {}
    app.state.poi_import_tasks = set()
    app.state.graphhopper = (
        GraphHopperClient(settings.graphhopper_url, settings.graphhopper_timeout)
        if settings.graphhopper_url else None
    )

    app.state.map_store = MapService(MAPS_DIR, settings.database_url)
    await app.state.map_store.initialize()
    discovered = await app.state.map_store.discover_maps()
    if discovered:
        logger.info("Auto-registered %s province map file(s)", discovered)

    registry = GraphRegistry(
        app.state.map_store,
        graphhopper_enabled=bool(settings.graphhopper_url),
        province_boundaries=await _load_province_boundaries(),
    )
    app.state.graph_registry = registry
    app.state.graph_service_loader = registry.services_for_coordinates

    map_region = resolve_map_region(settings.map_region)
    app.state.map_region = map_region  # always set, for place lookups
    pbf_path = Path(settings.graph_path) if settings.graph_path else DEFAULT_PBF_PATH
    services = await registry.load_primary_region(map_region, pbf_path=pbf_path)
    # Routing endpoints read these three off app.state directly and treat
    # None as "road graph is not loaded" (503).
    app.state.graph_data, app.state.router_engine, app.state.graph_helper = (
        services if services else (None, None, None)
    )
    app.state.graph_sources = [str(pbf_path)] if services else []

    try:
        yield
    finally:
        await app.state.map_store.close()


app = FastAPI(title="SmartRoutePP", lifespan=lifespan)
register_routes(app)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload)

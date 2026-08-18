"""SmartRoute FastAPI application backed by the Java GraphHopper service."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from api.graph_routes import router
from api.map_catalog import router as map_catalog_router
from api.agent import router as agents
from services.graphhopper import GraphHopperClient
from services.map_store import MapStore
from services.settings import settings

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
MAPS_DIR = BASE_DIR / "maps"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize persistence and the lightweight GraphHopper HTTP client."""
    app.state.route_suggestion_jobs = {}
    app.state.poi_import_jobs = {}
    app.state.poi_import_tasks = set()
    app.state.map_store = MapStore(MAPS_DIR, settings.database_url)
    await app.state.map_store.initialize()
    app.state.map_region = tuple(
        (settings.map_region or "cambodia/phnom_penh").split("/", 1)
    )
    if not await app.state.map_store.get_map(*app.state.map_region):
        country, province = app.state.map_region
        await app.state.map_store.register_map(
            country,
            province,
            f"{province.replace('_', ' ').title()}, {country.title()}",
            metadata={"routing_provider": "graphhopper", "network_type": "all"},
        )
    app.state.graphhopper = GraphHopperClient(
        settings.graphhopper_url, settings.graphhopper_timeout_seconds
    )
    app.state.routing_provider = "graphhopper"
    app.state.routing_source = str(MAPS_DIR / "cambodia-latest.osm.pbf")
    logger.info(
        "Routing delegated to GraphHopper at %s using %s",
        settings.graphhopper_url,
        app.state.routing_source,
    )
    try:
        yield
    finally:
        await app.state.map_store.close()


app = FastAPI(title="SmartRoutePP", lifespan=lifespan)
app.include_router(router)
app.include_router(map_catalog_router)
app.include_router(agents)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload)

"""SmartRoutePP FastAPI application entry point."""

from __future__ import annotations

import gc
import logging
from contextlib import asynccontextmanager
from pathlib import Path

import osmnx as ox
import networkx as nx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from api.graph_routes import build_graph_services, router
from api.map_catalog import router as map_catalog_router
from services.map_store import MapStore
from services.database_overlays import apply_database_overlays
from services.settings import settings

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
MAPS_DIR = BASE_DIR / "maps"
DEFAULT_GRAPH_PATH = MAPS_DIR / "cambodia" / "phnom_penh" / "base" / "my_phnom_penh.graphml"


async def load_graph(app: FastAPI) -> None:
    """Load and index the road network once during application startup."""
    configured_region = settings.map_region
    if configured_region:
        try:
            country, province = configured_region.split("/", 1)
        except ValueError as exc:
            raise RuntimeError("SMARTROUTE_MAP_REGION must use country/province") from exc
        registered = await app.state.map_store.get_map(country, province)
        if not registered or not registered.get("graph_path"):
            raise RuntimeError(f"No graph is registered for {configured_region}")
        graph_path = Path(registered["graph_path"])
        map_region = (country, province)
    else:
        graph_path = Path(settings.graph_path or DEFAULT_GRAPH_PATH).expanduser()
        map_region = ("cambodia", "phnom_penh")
    if not graph_path.is_file():
        raise RuntimeError(
            f"Graph file not found: {graph_path}. Set SMARTROUTE_GRAPH to a valid GraphML file."
        )
    graph = ox.load_graphml(graph_path)
    overlay_directory = graph_path.parent.parent / "overlays"
    automatic_overlays = [str(path) for path in sorted(overlay_directory.glob("*.graphml")) if path.stat().st_size > 0]
    configured_overlays = list(settings.custom_graphs)
    custom_paths = list(dict.fromkeys([*automatic_overlays, *configured_overlays]))
    loaded_paths = []
    for custom_value in custom_paths:
        custom_path = Path(custom_value).expanduser()
        if not custom_path.is_file():
            raise RuntimeError(f"Custom graph file not found: {custom_path}")
        try:
            custom_graph = ox.load_graphml(custom_path)
        except Exception as exc:
            logger.warning("Skipping invalid graph overlay %s: %s", custom_path, exc)
            continue
        if custom_graph.number_of_nodes():
            graph = nx.compose(graph, custom_graph)
            loaded_paths.append(str(custom_path))
    await apply_database_overlays(graph, app.state.map_store, *map_region)
    app.state.map_region = map_region
    app.state.graph_sources = [str(graph_path), *loaded_paths]
    app.state.graph_data, app.state.router_engine, app.state.graph_helper = build_graph_services(graph)
    del graph
    gc.collect()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.route_suggestion_jobs = {}
    app.state.map_store = MapStore(MAPS_DIR, settings.database_url)
    await app.state.map_store.initialize()
    phnom_penh = await app.state.map_store.get_map("cambodia", "phnom_penh")
    if not phnom_penh:
        await app.state.map_store.register_map(
            "cambodia", "phnom_penh", "Phnom Penh, Cambodia", str(DEFAULT_GRAPH_PATH),
            metadata={"center": [11.5564, 104.9282], "network_type": "drive"},
        )
    elif not phnom_penh.get("graph_path") or not Path(phnom_penh["graph_path"]).is_file():
        # Migrate catalogs created before GraphML files moved under maps/.
        await app.state.map_store.register_map(
            "cambodia", "phnom_penh", phnom_penh["display_name"], str(DEFAULT_GRAPH_PATH),
            version=phnom_penh["version"], metadata=phnom_penh["metadata"],
        )
    await load_graph(app)
    try:
        yield
    finally:
        await app.state.map_store.close()


app = FastAPI(title="SmartRoutePP", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
app.include_router(router)
app.include_router(map_catalog_router)
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))


@app.get("/home", response_class=HTMLResponse, name="home")
async def home(request: Request):
    return templates.TemplateResponse(request, "selectPoint.html")


@app.get("/about", response_class=HTMLResponse, name="about")
async def about(request: Request):
    return templates.TemplateResponse(request, "home.html", {"active_page": "about"})


@app.get("/contact", response_class=HTMLResponse, name="contact")
async def contact(request: Request):
    return templates.TemplateResponse(request, "home.html", {"active_page": "contact"})


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload)

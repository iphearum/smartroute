"""SmartRoutePP FastAPI application entry point."""

from __future__ import annotations

import asyncio
import gc
import logging
from collections import OrderedDict
from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path

import osmnx as ox
import networkx as nx
from fastapi import FastAPI

from api.graph_routes import build_graph_services, router
from api.map_catalog import router as map_catalog_router
from services.graph_helper import GraphHelper
from services.map_store import MapStore
from services.database_overlays import apply_database_overlays
from services.settings import settings
from services.spatial_graph import SpatialGraphIndex, route_bounds
from scripts.convert_cambodia_pbf import DEFAULT_PBF, load_province_boundaries
from shapely.geometry import Point

logger = logging.getLogger(__name__)

BASE_DIR = Path(__file__).resolve().parent
MAPS_DIR = BASE_DIR / "maps"
DEFAULT_GRAPH_PATH = MAPS_DIR / "cambodia" / "phnom_penh" / "base" / "phnom_penh.graphml"


def load_graphml(path: Path):
    """Load generated GraphML while accepting nullable OSM boolean tags."""
    def nullable_bool(value):
        normalized = str(value).strip().lower()
        if normalized in {"yes", "true", "1", "-1"} or any(
            token in normalized for token in ("'yes'", '"yes"', "'true'", '"true"')
        ):
            return True
        return False

    return ox.load_graphml(
        path,
        edge_dtypes={"oneway": nullable_bool, "reversed": nullable_bool},
        graph_dtypes={"consolidated": nullable_bool, "simplified": nullable_bool},
    )


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
    graph = load_graphml(graph_path)
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
            custom_graph = load_graphml(custom_path)
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
    app.state.graph_services[map_region] = (
        app.state.graph_data, app.state.router_engine, app.state.graph_helper,
    )
    app.state.graph_objects[map_region] = graph
    gc.collect()


async def load_region_graph_object(app: FastAPI, country: str, province: str):
    """Load and cache a province's raw graph without building routing indexes."""
    key = (country, province)
    if key in app.state.graph_objects:
        return app.state.graph_objects[key]
    async with app.state.graph_load_lock:
        if key in app.state.graph_objects:
            return app.state.graph_objects[key]
        registered = await app.state.map_store.get_map(country, province)
        graph_path = Path((registered or {}).get("graph_path") or "")
        if not graph_path.is_file():
            raise RuntimeError(f"No usable GraphML file is registered for {country}/{province}")
        graph = await asyncio.to_thread(load_graphml, graph_path)
        overlay_directory = graph_path.parent.parent / "overlays"
        for overlay_path in sorted(overlay_directory.glob("*.graphml")):
            if overlay_path.stat().st_size <= 0:
                continue
            try:
                overlay = await asyncio.to_thread(load_graphml, overlay_path)
                if overlay.number_of_nodes():
                    graph = nx.compose(graph, overlay)
            except Exception as exc:
                logger.warning("Skipping invalid graph overlay %s: %s", overlay_path, exc)
        await apply_database_overlays(graph, app.state.map_store, country, province)
        app.state.graph_objects[key] = graph
        logger.info("Loaded raw routing graph %s/%s from %s", country, province, graph_path)
        return graph


async def load_region_graph(app: FastAPI, country: str, province: str):
    """Load one registered province graph once and return its routing services."""
    key = (country, province)
    if key in app.state.graph_services:
        return app.state.graph_services[key]
    graph = await load_region_graph_object(app, country, province)
    async with app.state.graph_load_lock:
        if key not in app.state.graph_services:
            app.state.graph_services[key] = await asyncio.to_thread(build_graph_services, graph)
    return app.state.graph_services[key]


async def graph_services_for_coordinates(app: FastAPI, coordinates, scope_padding_km=None):
    """Load relevant provinces and optionally build a bounded routing subgraph."""
    provinces = []
    for latitude, longitude in coordinates:
        point = Point(longitude, latitude)
        province = next((slug for slug, polygon in app.state.province_boundaries.items()
                         if polygon.covers(point)), None)
        if province is None:
            raise ValueError(f"No downloaded Cambodia province contains {latitude}, {longitude}")
        provinces.append(province)
    unique = list(dict.fromkeys(provinces))
    # Select provinces against broad route bounds once. Province extracts
    # overlap at their borders, so shared OSM node IDs connect after composition.
    if len(unique) == 1:
        selected = tuple(unique)
    else:
        west, south, east, north = route_bounds(coordinates, 50)
        crossed = [
            slug for slug, province_shape in app.state.province_boundaries.items()
            if not (
                province_shape.bounds[2] < west or province_shape.bounds[0] > east
                or province_shape.bounds[3] < south or province_shape.bounds[1] > north
            )
        ]
        selected = tuple(sorted(set(unique + crossed)))
    cache_key = ("cambodia", *selected)
    await asyncio.gather(*(
        load_region_graph_object(app, "cambodia", slug) for slug in selected
    ))
    if len(selected) > 1 and cache_key not in app.state.graph_objects:
        async with app.state.graph_load_lock:
            if cache_key not in app.state.graph_objects:
                graphs = [app.state.graph_objects[("cambodia", slug)] for slug in selected]
                combined = await asyncio.to_thread(nx.compose_all, graphs)
                app.state.graph_objects[cache_key] = combined
                logger.info("Composed cross-province routing graph: %s", ", ".join(selected))
    label = " → ".join(unique)
    if scope_padding_km is None:
        if cache_key not in app.state.graph_services:
            async with app.state.graph_load_lock:
                if cache_key not in app.state.graph_services:
                    app.state.graph_services[cache_key] = await asyncio.to_thread(
                        build_graph_services, app.state.graph_objects[cache_key]
                    )
        return (*app.state.graph_services[cache_key], label)

    coordinate_key = tuple(
        (round(float(latitude), 4), round(float(longitude), 4))
        for latitude, longitude in coordinates
    )
    subset_key = (cache_key, float(scope_padding_km), coordinate_key)
    cached = app.state.bounded_graph_services.get(subset_key)
    if cached is not None:
        app.state.bounded_graph_services.move_to_end(subset_key)
        return (*cached, label)

    spatial_index = app.state.graph_spatial_indexes.get(cache_key)
    if spatial_index is None:
        spatial_index = await asyncio.to_thread(
            SpatialGraphIndex, app.state.graph_objects[cache_key]
        )
        app.state.graph_spatial_indexes[cache_key] = spatial_index
    bounds = route_bounds(coordinates, scope_padding_km)
    direct_metres = GraphHelper._haversine(
        coordinates[0][1], coordinates[0][0], coordinates[-1][1], coordinates[-1][0]
    )
    include_backbone = direct_metres >= 50_000
    subgraph = await asyncio.to_thread(
        spatial_index.bounds_subgraph, bounds, include_backbone
    )
    services = await asyncio.to_thread(build_graph_services, subgraph)
    app.state.bounded_graph_services[subset_key] = services
    app.state.bounded_graph_services.move_to_end(subset_key)
    while len(app.state.bounded_graph_services) > 24:
        app.state.bounded_graph_services.popitem(last=False)
    logger.info(
        "Built %.0f km route scope%s: %s nodes, %s edges",
        scope_padding_km, " with national-road backbone" if include_backbone else "",
        subgraph.number_of_nodes(), subgraph.number_of_edges(),
    )
    return (*services, label)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.route_suggestion_jobs = {}
    app.state.poi_import_jobs = {}
    app.state.poi_import_tasks = set()
    app.state.graph_services = {}
    app.state.graph_objects = {}
    app.state.graph_spatial_indexes = {}
    app.state.bounded_graph_services = OrderedDict()
    app.state.graph_load_lock = asyncio.Lock()
    app.state.map_store = MapStore(MAPS_DIR, settings.database_url)
    await app.state.map_store.initialize()
    discovered = await app.state.map_store.discover_maps()
    if discovered:
        logger.info("Auto-registered %s province map file(s)", discovered)
    app.state.province_boundaries = await asyncio.to_thread(
        load_province_boundaries, DEFAULT_PBF
    )
    app.state.graph_service_loader = partial(graph_services_for_coordinates, app)
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
app.include_router(router)
app.include_router(map_catalog_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.reload)

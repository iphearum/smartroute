"""Loads, composes, and caches province road graphs and their routing services.

This was four module-level functions in `main.py` mutating five parallel
dicts on `app.state` (`graph_objects`, `graph_services`,
`graph_spatial_indexes`, `bounded_graph_services`, `graph_load_lock`). Those
five always changed together and were only ever touched by those four
functions, which is a class -- so they are fields here and the functions are
methods. `app.state` now holds one object instead of five caches plus a lock.
"""

from __future__ import annotations

import asyncio
import gc
import logging
from collections import OrderedDict
from pathlib import Path

import networkx as nx
from shapely.geometry import Point

from app.routing.graph_builder import build_graph_services
from app.routing.graph_helper import GraphHelper
from app.routing.overlays import apply_database_overlays
from app.routing.pbf import DEFAULT_PBF_PATH, empty_graph, load_region_graph_from_pbf
from app.routing.spatial_graph import SpatialGraphIndex, route_bounds

logger = logging.getLogger(__name__)

#: Bounded-subgraph service cache size. Each entry holds a full routing index,
#: so this trades memory for avoiding repeated subgraph construction.
MAX_BOUNDED_SERVICES = 24

#: Routes at least this long get the national-road backbone merged into their
#: bounded subgraph, so long trips are not forced onto local roads.
BACKBONE_DISTANCE_METRES = 50_000

DEFAULT_REGION = ("cambodia", "phnom_penh")


class GraphRegistry:
    """Owns every loaded road graph and the routing services built from them."""

    def __init__(self, map_service, *, graphhopper_enabled: bool,
                 province_boundaries: dict | None = None):
        self.map_service = map_service
        self.graphhopper_enabled = graphhopper_enabled
        self.province_boundaries = province_boundaries or {}
        self.graphs: dict[tuple, nx.MultiDiGraph] = {}
        self.services: dict[tuple, tuple] = {}
        self.spatial_indexes: dict[tuple, SpatialGraphIndex] = {}
        self.bounded: OrderedDict[tuple, tuple] = OrderedDict()
        self._lock = asyncio.Lock()

    # --- single region ----------------------------------------------------
    async def region_graph(self, country: str, province: str) -> nx.MultiDiGraph:
        """Load and cache a province's raw graph without routing indexes."""
        key = (country, province)
        if key in self.graphs:
            return self.graphs[key]
        async with self._lock:
            if key in self.graphs:
                return self.graphs[key]
            if self.graphhopper_enabled:
                # GraphHopper owns routing in this mode, so the backend
                # deliberately does not rebuild a local PBF graph.
                self.graphs[key] = empty_graph()
                return self.graphs[key]
            try:
                graph = await asyncio.to_thread(
                    load_region_graph_from_pbf, country, province, DEFAULT_PBF_PATH,
                )
            except Exception as exc:
                logger.warning("No usable OSM PBF graph for %s/%s: %s", country, province, exc)
                graph = empty_graph()
            await apply_database_overlays(graph, self.map_service, country, province)
            self.graphs[key] = graph
            logger.info("Loaded raw routing graph %s/%s from %s",
                        country, province, DEFAULT_PBF_PATH)
            return graph

    async def region_services(self, country: str, province: str) -> tuple:
        """Return (data, engine, helper) for one province, building once."""
        key = (country, province)
        if key in self.services:
            return self.services[key]
        graph = await self.region_graph(country, province)
        async with self._lock:
            if key not in self.services:
                self.services[key] = await asyncio.to_thread(build_graph_services, graph)
        return self.services[key]

    # --- startup ----------------------------------------------------------
    async def load_primary_region(self, map_region: tuple[str, str],
                                  pbf_path: Path | None = None) -> tuple | None:
        """Build the startup graph for the configured region.

        Returns (data, engine, helper) once loaded, or None when routing is
        intentionally unavailable -- GraphHopper is active, the PBF is
        missing, or conversion failed. Callers treat all three the same way,
        so they share one return shape instead of three sentinel branches.
        """
        country, province = map_region
        if self.graphhopper_enabled:
            logger.info("GraphHopper URL configured; skipping local OSM/PBF graph import.")
            return None

        pbf_path = (pbf_path or DEFAULT_PBF_PATH).expanduser()
        if not pbf_path.is_file():
            logger.warning(
                "No OSM PBF graph source found for %s/%s at %s; "
                "leaving routing services unloaded.", country, province, pbf_path,
            )
            return None

        try:
            graph = await asyncio.to_thread(
                load_region_graph_from_pbf, country, province, pbf_path,
            )
        except Exception as exc:
            logger.warning("Unable to build routing graph from %s for %s/%s: %s",
                           pbf_path, country, province, exc)
            return None

        await apply_database_overlays(graph, self.map_service, *map_region)
        services = build_graph_services(graph)
        self.services[map_region] = services
        self.graphs[map_region] = graph
        gc.collect()
        return services

    # --- multi-province ---------------------------------------------------
    def _provinces_for(self, coordinates) -> tuple[list[str], tuple[str, ...]]:
        provinces = []
        for latitude, longitude in coordinates:
            point = Point(longitude, latitude)
            province = next((slug for slug, polygon in self.province_boundaries.items()
                             if polygon.covers(point)), None)
            if province is None:
                raise ValueError(
                    f"No downloaded Cambodia province contains {latitude}, {longitude}"
                )
            provinces.append(province)

        unique = list(dict.fromkeys(provinces))
        if len(unique) == 1:
            return unique, tuple(unique)

        # A route between two provinces can still pass through a third, so
        # include every province whose bounds intersect the padded corridor.
        west, south, east, north = route_bounds(coordinates, 50)
        crossed = [
            slug for slug, shape in self.province_boundaries.items()
            if not (shape.bounds[2] < west or shape.bounds[0] > east
                    or shape.bounds[3] < south or shape.bounds[1] > north)
        ]
        return unique, tuple(sorted(set(unique + crossed)))

    async def services_for_coordinates(self, coordinates, scope_padding_km=None) -> tuple:
        """Return (data, engine, helper, label) covering every coordinate."""
        unique, selected = self._provinces_for(coordinates)
        cache_key = ("cambodia", *selected)
        label = " → ".join(unique)

        await asyncio.gather(*(self.region_graph("cambodia", slug) for slug in selected))

        if len(selected) > 1 and cache_key not in self.graphs:
            async with self._lock:
                if cache_key not in self.graphs:
                    graphs = [self.graphs[("cambodia", slug)] for slug in selected]
                    self.graphs[cache_key] = await asyncio.to_thread(nx.compose_all, graphs)
                    logger.info("Composed cross-province routing graph: %s", ", ".join(selected))

        if cache_key not in self.graphs:
            self.graphs[cache_key] = empty_graph()
            self.services[cache_key] = build_graph_services(self.graphs[cache_key])
            return (*self.services[cache_key], label)

        if scope_padding_km is None:
            if cache_key not in self.services:
                async with self._lock:
                    if cache_key not in self.services:
                        self.services[cache_key] = await asyncio.to_thread(
                            build_graph_services, self.graphs[cache_key],
                        )
            return (*self.services[cache_key], label)

        return (*await self._bounded_services(cache_key, coordinates, scope_padding_km), label)

    async def _bounded_services(self, cache_key: tuple, coordinates,
                                scope_padding_km: float) -> tuple:
        coordinate_key = tuple(
            (round(float(latitude), 4), round(float(longitude), 4))
            for latitude, longitude in coordinates
        )
        subset_key = (cache_key, float(scope_padding_km), coordinate_key)
        cached = self.bounded.get(subset_key)
        if cached is not None:
            self.bounded.move_to_end(subset_key)
            return cached

        spatial_index = self.spatial_indexes.get(cache_key)
        if spatial_index is None:
            spatial_index = await asyncio.to_thread(SpatialGraphIndex, self.graphs[cache_key])
            self.spatial_indexes[cache_key] = spatial_index

        bounds = route_bounds(coordinates, scope_padding_km)
        direct_metres = GraphHelper._haversine(
            coordinates[0][1], coordinates[0][0], coordinates[-1][1], coordinates[-1][0]
        )
        include_backbone = direct_metres >= BACKBONE_DISTANCE_METRES
        subgraph = await asyncio.to_thread(
            spatial_index.bounds_subgraph, bounds, include_backbone,
        )
        services = await asyncio.to_thread(build_graph_services, subgraph)

        self.bounded[subset_key] = services
        self.bounded.move_to_end(subset_key)
        while len(self.bounded) > MAX_BOUNDED_SERVICES:
            self.bounded.popitem(last=False)
        logger.info(
            "Built %.0f km route scope%s: %s nodes, %s edges",
            scope_padding_km, " with national-road backbone" if include_backbone else "",
            subgraph.number_of_nodes(), subgraph.number_of_edges(),
        )
        return services


def resolve_map_region(configured: str | None) -> tuple[str, str]:
    """Parse SMARTROUTE_MAP_REGION ("country/province") with a default."""
    if not configured:
        return DEFAULT_REGION
    try:
        country, province = configured.split("/", 1)
    except ValueError as exc:
        raise RuntimeError("SMARTROUTE_MAP_REGION must use country/province") from exc
    return country, province

"""HTTP routes for graph lookup, routing, and map rendering."""

from __future__ import annotations

import time
import secrets
import asyncio
from pathlib import Path
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, Request
from pydantic import BaseModel, Field
from requests import RequestException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from networkx.readwrite import json_graph
from shapely.geometry import LineString

from services.graph_helper import GraphHelper
from services.route_finder import RouterEngine
from services.google_maps import parse_google_maps_place, parse_google_maps_route

router = APIRouter()
templates = Jinja2Templates(directory=str(Path(__file__).resolve().parents[1] / "templates"))


class GoogleMapsRouteImport(BaseModel):
    url: str = Field(min_length=10, max_length=4096)


def normalize_geometry(geometry):
    """Convert OSM's (longitude, latitude) coordinates to Leaflet's order."""
    return [[lat, lon] for lon, lat in geometry]


def get_graph_data(graph):
    data = json_graph.node_link_data(graph, edges="links")
    for edge in data.get("links", []):
        if isinstance(edge.get("geometry"), LineString):
            edge["geometry"] = list(edge["geometry"].coords)
    return data


def build_graph_services(graph):
    data = get_graph_data(graph)
    return data, RouterEngine(data), GraphHelper(data)


def _state(request: Request, name: str):
    value = getattr(request.app.state, name, None)
    if value is None:
        raise HTTPException(status_code=503, detail="Road graph is not loaded")
    return value


def _route_or_400(engine: RouterEngine, start_id: int, end_id: int, algorithm="astar"):
    try:
        return engine.route(start_id, end_id, algorithm)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _route_set(engine, start_id, end_id, legs, mode, traffic, limit):
    if legs:
        parsed = [tuple(int(value) for value in pair.split(":")) for pair in legs.split(",")]
        return engine.route_legs_options(parsed, mode, traffic, limit)
    if start_id is None or end_id is None:
        raise ValueError("start_id and end_id are required")
    return engine.route_options(start_id, end_id, mode, traffic, limit)


def _calculate_suggestions(app, job_id, start_id, end_id, legs, mode, traffic, limit):
    job = app.state.route_suggestion_jobs[job_id]
    job["status"] = "running"
    try:
        routes = _route_set(app.state.router_engine, start_id, end_id, legs, mode, traffic, limit)
        job.update(status="complete", routes=routes, recommended_rank=routes[0]["rank"])
    except (TypeError, ValueError) as exc:
        job.update(status="failed", error=str(exc))


@router.post("/route/import/google-maps")
async def import_google_maps_route(payload: GoogleMapsRouteImport):
    try:
        return await asyncio.to_thread(parse_google_maps_route, payload.url)
    except (RequestException, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/location/import/google-maps")
async def import_google_maps_place(payload: GoogleMapsRouteImport):
    try:
        return await asyncio.to_thread(parse_google_maps_place, payload.url)
    except (RequestException, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def _coordinate_route(helper: GraphHelper, engine: RouterEngine, s_lat, s_lon, d_lat, d_lon):
    """Snap coordinates using multiple candidates and include connector costs."""
    direct_distance = helper._haversine(s_lon, s_lat, d_lon, d_lat)
    best = None
    for source_id, source_snap in helper.closest_nodes(s_lat, s_lon, 5):
        if source_snap > 500:
            continue
        for dest_id, dest_snap in helper.closest_nodes(d_lat, d_lon, 5):
            if dest_snap > 500:
                continue
            # Distant coordinates must not silently collapse onto one graph node.
            if source_id == dest_id and direct_distance > 100:
                continue
            try:
                result = engine.route(source_id, dest_id)
            except ValueError:
                continue
            total = source_snap + result["length"] + dest_snap
            if best is None or total < best[0]:
                best = (total, source_id, dest_id, source_snap, dest_snap, result)
    if best is None:
        raise HTTPException(
            status_code=400,
            detail="No connected road route was found within 500 m of both selected points",
        )
    total, source_id, dest_id, source_snap, dest_snap, result = best
    result = dict(result)
    result.update({
        "length": total,
        "network_length": result["length"],
        "source_snap_distance": source_snap,
        "destination_snap_distance": dest_snap,
    })
    return source_id, dest_id, result


@router.get("/readroot")
def read_root(request: Request):
    return _state(request, "graph_data")


@router.get("/")
def homepage(request: Request):
    return templates.TemplateResponse(request, "selectPoint.html")


@router.get("/getPoint")
def get_point_from_id(request: Request, id: int):
    point = _state(request, "graph_helper").get_point_from_node_id(id)
    if point is None:
        raise HTTPException(status_code=404, detail=f"Node {id} not found")
    return point


@router.get("/getAdj")
def get_adjacency_list(request: Request):
    return _state(request, "router_engine").adj


@router.get("/route")
def get_route(
    request: Request,
    start_id: int,
    end_id: int,
    algorithm: Literal["astar", "dijkstra"] = "astar",
):
    return _route_or_400(_state(request, "router_engine"), start_id, end_id, algorithm)


@router.get("/route/alternatives")
def route_alternatives(
    request: Request,
    start_id: int,
    end_id: int,
    mode: Literal["car", "motorbike", "bike", "walk"] = "motorbike",
    traffic: Literal["normal", "heavy"] = "normal",
    limit: int = 3,
):
    try:
        routes = _state(request, "router_engine").route_options(start_id, end_id, mode, traffic, limit)
        return {
            "mode": mode,
            "traffic": traffic,
            "traffic_source": "profile",
            "recommended_rank": routes[0]["rank"],
            "recommended_route": routes[0],
            "routes": routes,
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/route/recommended")
def recommended_route(
    request: Request,
    start_id: int | None = None,
    end_id: int | None = None,
    legs: str = "",
    mode: Literal["car", "motorbike", "bike", "walk"] = "motorbike",
    traffic: Literal["normal", "heavy"] = "normal",
):
    """Return only the recommended route without calculating detours."""
    try:
        route = _route_set(_state(request, "router_engine"), start_id, end_id, legs, mode, traffic, 1)[0]
        return {"mode": mode, "traffic": traffic, "recommended_rank": 1, "recommended_route": route,
                "routes": [route], "suggestions_status": "not_started"}
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/route/suggestions", status_code=202)
def queue_route_suggestions(
    request: Request,
    background_tasks: BackgroundTasks,
    start_id: int | None = None,
    end_id: int | None = None,
    legs: str = "",
    mode: Literal["car", "motorbike", "bike", "walk"] = "motorbike",
    traffic: Literal["normal", "heavy"] = "normal",
    limit: int = 3,
):
    """Queue slower alternative discovery after the recommended route is visible."""
    try:
        if legs:
            [tuple(int(value) for value in pair.split(":")) for pair in legs.split(",")]
        elif start_id is None or end_id is None:
            raise ValueError("start_id and end_id are required")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    jobs = request.app.state.route_suggestion_jobs
    if len(jobs) >= 128:
        oldest = next(iter(jobs))
        jobs.pop(oldest, None)
    job_id = secrets.token_urlsafe(12)
    jobs[job_id] = {"status": "queued", "routes": []}
    background_tasks.add_task(_calculate_suggestions, request.app, job_id, start_id, end_id,
                              legs, mode, traffic, max(2, min(limit, 5)))
    return {"job_id": job_id, "status": "queued"}


@router.get("/route/suggestions/{job_id}")
def route_suggestion_status(request: Request, job_id: str):
    job = request.app.state.route_suggestion_jobs.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Suggestion job not found or expired")
    return job


@router.get("/route/via")
def route_via(
    request: Request,
    stop_ids: str = "",
    legs: str = "",
    mode: Literal["car", "motorbike", "bike", "walk"] = "motorbike",
    traffic: Literal["normal", "heavy"] = "normal",
    limit: int = 3,
):
    try:
        if legs:
            parsed_legs = [tuple(int(value) for value in pair.split(":")) for pair in legs.split(",")]
            routes = _state(request, "router_engine").route_legs_options(parsed_legs, mode, traffic, limit)
        else:
            stops = [int(value) for value in stop_ids.split(",") if value.strip()]
            routes = _state(request, "router_engine").route_via_options(stops, mode, traffic, limit)
        return {
            "mode": mode,
            "traffic": traffic,
            "traffic_source": "profile",
            "recommended_rank": routes[0]["rank"],
            "recommended_route": routes[0],
            "routes": routes,
        }
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/location/nearest")
def nearest_location(request: Request, lat: float, lon: float):
    helper = _state(request, "graph_helper")
    engine = _state(request, "router_engine")
    node_id = helper.closest_node(lat, lon)
    if node_id is None:
        raise HTTPException(status_code=404, detail="The map contains no nodes")
    return {
        "node_id": node_id,
        "name": engine.location_name(node_id),
        **helper.get_point_from_node_id(node_id),
        **helper.distance_to_the_point(lat, lon),
    }


@router.get("/location/search")
async def search_locations(request: Request, q: str, limit: int = 8):
    limit = max(1, min(limit, 20))
    results = []
    map_store = getattr(request.app.state, "map_store", None)
    region = getattr(request.app.state, "map_region", None)
    if map_store and region and len(q.strip()) >= 2:
        for place in await map_store.search_places(*region, q, limit):
            results.append({**place, "node_id": None, "source": "custom_place"})
    remaining = limit - len(results)
    if remaining > 0:
        results.extend(_state(request, "router_engine").search_locations(q, remaining))
    return {"query": q, "results": results}


@router.get("/map/summary")
def map_summary(request: Request):
    data = _state(request, "graph_data")
    engine = _state(request, "router_engine")
    return {
        "nodes": len(data.get("nodes", [])),
        "edges": len(data.get("links", [])),
        "directed": data.get("directed", True),
        "sources": getattr(request.app.state, "graph_sources", []),
        "route_cache": engine._cached_route.cache_info()._asdict(),
        "location_cache": _state(request, "graph_helper").closest_node.cache_info()._asdict(),
    }


@router.get("/map", response_class=HTMLResponse)
def render_map(request: Request, start_id: Optional[int] = None, end_id: Optional[int] = None):
    return templates.TemplateResponse(request, "map.html", {"start_id": start_id, "end_id": end_id})


@router.get("/request-route-id", response_class=HTMLResponse, name="request-route-id")
def request_route_by_id(request: Request):
    return templates.TemplateResponse(request, "route_form.html")


@router.get("/request-route-latlon", response_class=HTMLResponse, name="request-route-latlon")
def request_route_by_latlon(request: Request):
    return templates.TemplateResponse(request, "route-request.html")


@router.get("/base")
def base_page(request: Request):
    return templates.TemplateResponse(request, "base.html")


@router.get("/visual", response_class=HTMLResponse)
def visual_map(request: Request, start_id: int, end_id: int):
    engine = _state(request, "router_engine")
    result = _route_or_400(engine, start_id, end_id)
    return templates.TemplateResponse(request, "map_view.html", {
        "start_id": start_id,
        "end_id": end_id,
        "start_name": engine.location_name(start_id),
        "end_name": engine.location_name(end_id),
        "geometry": normalize_geometry(result["geometry"]),
    })


@router.get("/point_on_edge")
def is_on_edge(request: Request, lat: float, lon: float):
    return _state(request, "graph_helper").is_point_on_edge(lat, lon)


@router.get("/distance")
def distance_to_point(request: Request, lat: float, lon: float):
    return _state(request, "graph_helper").distance_to_the_point(lat, lon)


@router.get("/temp_route", response_class=HTMLResponse)
def route_from_temp_point(request: Request, lat: float, lon: float, dest_id: int):
    helper = _state(request, "graph_helper")
    engine = _state(request, "router_engine")
    source_id = helper.closest_node(lat, lon)
    result = _route_or_400(engine, source_id, dest_id)
    geometry = [[lon, lat], *result["geometry"]]
    return templates.TemplateResponse(request, "map_view.html", {
        "start_id": source_id,
        "end_id": dest_id,
        "start_name": engine.location_name(source_id),
        "end_name": engine.location_name(dest_id),
        "geometry": normalize_geometry(geometry),
        "length": result["length"],
    })


@router.get("/closest-node")
def closest_node(request: Request, lat: float, lon: float):
    return _state(request, "graph_helper").closest_node(lat, lon)


@router.post("/full_temp_route", response_class=HTMLResponse)
async def full_route_from_temp_point(
    request: Request,
    s_lat: float = Form(...),
    s_lon: float = Form(...),
    d_lat: list[float] = Form(...),
    d_lon: list[float] = Form(...),
):
    if len(d_lat) != len(d_lon) or not d_lat:
        raise HTTPException(status_code=400, detail="Every destination requires latitude and longitude")
    if len(d_lat) > 6:
        raise HTTPException(status_code=400, detail="A route may contain at most six destinations")
    started = time.perf_counter()
    helper = _state(request, "graph_helper")
    engine = _state(request, "router_engine")
    coordinates = [(s_lat, s_lon), *zip(d_lat, d_lon)]
    total_length, geometry, stop_ids, stop_names, route_legs = 0.0, [[s_lon, s_lat]], [], [], []
    for (from_lat, from_lon), (to_lat, to_lon) in zip(coordinates, coordinates[1:]):
        source_id, dest_id, leg = _coordinate_route(helper, engine, from_lat, from_lon, to_lat, to_lon)
        route_legs.append([source_id, dest_id])
        if not stop_ids:
            stop_ids.append(source_id)
            stop_names.append(engine.location_name(source_id))
        stop_ids.append(dest_id)
        stop_names.append(engine.location_name(dest_id))
        geometry.extend(leg["geometry"])
        geometry.append([to_lon, to_lat])
        total_length += leg["length"]
    source_id, dest_id = stop_ids[0], stop_ids[-1]
    return templates.TemplateResponse(request, "map_view.html", {
        "start_id": source_id,
        "end_id": dest_id,
        "start_name": stop_names[0],
        "end_name": stop_names[-1],
        "stops": stop_names,
        "stop_coordinates": [[lat, lon] for lat, lon in coordinates],
        "stop_ids": stop_ids,
        "route_legs": route_legs,
        "multi_stop": len(d_lat) > 1,
        "geometry": normalize_geometry(geometry),
        "length": total_length,
        "duration": (time.perf_counter() - started) * 1000,
    })


@router.get("/selecting-route", name="selecting-route")
def selecting_route(request: Request):
    return templates.TemplateResponse(request, "selectPoint.html")

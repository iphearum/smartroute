"""HTTP routes for graph lookup, routing, and map rendering."""

from __future__ import annotations

import secrets
import asyncio
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, ValidationError
from requests import RequestException
from networkx.readwrite import json_graph
from shapely.geometry import LineString

from services.graph_helper import GraphHelper
from services.route_finder import RouterEngine
from services.google_maps import parse_google_maps_place, parse_google_maps_route

router = APIRouter()


class GoogleMapsRouteImport(BaseModel):
    url: str = Field(min_length=10, max_length=4096)


class CoordinateRouteRequest(BaseModel):
    coordinates: list[tuple[float, float]] = Field(min_length=2, max_length=7)
    mode: Literal["car", "motorbike", "bike", "walk"] = "motorbike"
    traffic: Literal["normal", "heavy"] = "normal"


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
    """Project coordinates onto road edges, then choose the cheapest directed A* endpoints."""
    direct_distance = helper._haversine(s_lon, s_lat, d_lon, d_lat)
    source_edge, destination_edge = helper.closest_edge(s_lat, s_lon), helper.closest_edge(d_lat, d_lon)
    if not source_edge or not destination_edge:
        raise HTTPException(status_code=400, detail="No routable road edge was found near both points")
    if source_edge["snap_distance"] > 500 or destination_edge["snap_distance"] > 500:
        raise HTTPException(
            status_code=400,
            detail="No connected road route was found within 500 m of both selected points",
        )

    source_options = [(
        source_edge["target"], source_edge["to_target_length"], source_edge["point_to_target"],
    )]
    if (source_edge["target"], source_edge["source"]) in engine.edges:
        source_options.append((
            source_edge["source"], source_edge["to_source_length"],
            list(reversed(source_edge["source_to_point"])),
        ))
    destination_options = [(
        destination_edge["source"], destination_edge["to_source_length"],
        destination_edge["source_to_point"],
    )]
    if (destination_edge["target"], destination_edge["source"]) in engine.edges:
        destination_options.append((
            destination_edge["target"], destination_edge["to_target_length"],
            list(reversed(destination_edge["point_to_target"])),
        ))

    best = None
    for source_id, source_partial, source_geometry in source_options:
        for dest_id, destination_partial, destination_geometry in destination_options:
            # Distant coordinates must not silently collapse onto one graph node.
            if source_id == dest_id and direct_distance > 100:
                continue
            try:
                result = engine.route(source_id, dest_id)
            except ValueError:
                continue
            total = (source_edge["snap_distance"] + source_partial + result["length"]
                     + destination_partial + destination_edge["snap_distance"])
            if best is None or total < best[0]:
                best = (total, source_id, dest_id, source_partial, destination_partial,
                        source_geometry, destination_geometry, result)
    if best is None:
        raise HTTPException(
            status_code=400,
            detail="No connected road route was found within 500 m of both selected points",
        )
    (total, source_id, dest_id, source_partial, destination_partial,
     source_geometry, destination_geometry, result) = best
    result = dict(result)
    result.update({
        "length": total,
        "network_length": result["length"],
        "source_snap_distance": source_edge["snap_distance"],
        "destination_snap_distance": destination_edge["snap_distance"],
    })
    snap = {
        "source_point": source_edge["point"],
        "destination_point": destination_edge["point"],
        "source_road": source_geometry,
        "destination_road": destination_geometry,
        "source_snap_distance": source_edge["snap_distance"],
        "destination_snap_distance": destination_edge["snap_distance"],
        "source_partial_length": source_partial,
        "destination_partial_length": destination_partial,
    }
    return source_id, dest_id, result, snap


@router.get("/readroot")
def read_root(request: Request):
    return _state(request, "graph_data")


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


@router.post("/route/by-coordinates")
async def route_by_coordinates(request: Request, payload: CoordinateRouteRequest):
    try:
        return await calculate_coordinate_routes(request.app, payload)
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def calculate_coordinate_routes(app, payload: CoordinateRouteRequest, on_graph_ready=None):
    """Load the relevant province and calculate routes without blocking the event loop."""
    if any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for lat, lon in payload.coordinates):
        raise ValueError("Invalid latitude or longitude")
    _, engine, helper, province = await app.state.graph_service_loader(payload.coordinates)
    if on_graph_ready is not None:
        await on_graph_ready(province)

    def calculate():
        legs, leg_snaps = [], []
        for (s_lat, s_lon), (d_lat, d_lon) in zip(payload.coordinates, payload.coordinates[1:]):
            source_id, dest_id, _, snap = _coordinate_route(
                helper, engine, s_lat, s_lon, d_lat, d_lon
            )
            legs.append([source_id, dest_id])
            leg_snaps.append(snap)
        # Return the recommended route immediately. Alternative discovery is
        # intentionally handled by /route/suggestions outside the critical path.
        routes = engine.route_legs_options(legs, payload.mode, payload.traffic, 1)
        for route in routes:
            connected_geometry, connectors = [], []
            for index, leg_geometry in enumerate(route.pop("leg_geometries", [])):
                start_lat, start_lon = payload.coordinates[index]
                end_lat, end_lon = payload.coordinates[index + 1]
                snap = leg_snaps[index]
                if not leg_geometry:
                    continue
                leg_geometry = [*snap["source_road"], *leg_geometry, *snap["destination_road"]]
                if snap["source_snap_distance"] > 8:
                    connectors.append([[start_lon, start_lat], snap["source_point"]])
                if snap["destination_snap_distance"] > 8:
                    connectors.append([snap["destination_point"], [end_lon, end_lat]])
                if connected_geometry and leg_geometry[0] == connected_geometry[-1]:
                    leg_geometry = leg_geometry[1:]
                connected_geometry.extend(leg_geometry)
            if connected_geometry:
                route["geometry"] = connected_geometry
                route["segments"] = [{"type": "road", "geometry": connected_geometry}]
            route["connectors"] = connectors
            route["length"] += sum(
                snap["source_partial_length"] + snap["destination_partial_length"]
                + snap["source_snap_distance"] + snap["destination_snap_distance"]
                for snap in leg_snaps
            )
        return {"routes": routes, "recommended_rank": routes[0]["rank"],
                "route_legs": legs, "province": province}

    return await asyncio.to_thread(calculate)


@router.websocket("/ws/routes")
async def route_socket(websocket: WebSocket):
    """Persistent route channel with progress events and per-request correlation IDs."""
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            request_id = str(message.get("request_id") or secrets.token_urlsafe(8))
            try:
                payload = CoordinateRouteRequest.model_validate(message)
                await websocket.send_json({"type": "map_loading", "request_id": request_id})
                async def graph_ready(province):
                    await websocket.send_json({"type": "route_calculating",
                                               "request_id": request_id, "province": province})
                result = await calculate_coordinate_routes(websocket.app, payload, graph_ready)
                await websocket.send_json({"type": "route_ready", "request_id": request_id,
                                           "data": result})
            except (HTTPException, RuntimeError, ValueError, ValidationError) as exc:
                detail = exc.detail if isinstance(exc, HTTPException) else str(exc)
                await websocket.send_json({"type": "error", "request_id": request_id,
                                           "message": detail})
    except WebSocketDisconnect:
        return


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
async def nearest_location(request: Request, lat: float, lon: float):
    try:
        _, engine, helper, province = await request.app.state.graph_service_loader([(lat, lon)])
    except (RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    node_id = helper.closest_node(lat, lon)
    if node_id is None:
        raise HTTPException(status_code=404, detail="The map contains no nodes")
    return {
        "node_id": node_id,
        "name": engine.location_name(node_id),
        "province": province,
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


@router.get("/point_on_edge")
def is_on_edge(request: Request, lat: float, lon: float):
    return _state(request, "graph_helper").is_point_on_edge(lat, lon)


@router.get("/distance")
def distance_to_point(request: Request, lat: float, lon: float):
    return _state(request, "graph_helper").distance_to_the_point(lat, lon)


@router.get("/closest-node")
def closest_node(request: Request, lat: float, lon: float):
    return _state(request, "graph_helper").closest_node(lat, lon)

"""Map assistant tool contracts and browser-facing action validation."""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException
TOOLS = [
    {"type": "function", "function": {"name": "search_places", "description": "Find places in the Smart map.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "search_web", "description": "Search the public web for current facts, news, policies, statistics, or sources.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "plot_route", "description": "Plot a route when the user has provided known places and coordinates.", "parameters": {"type": "object", "properties": {"stops": {"type": "array", "items": {"type": "object", "properties": {"name": {"type": "string"}, "latitude": {"type": "number"}, "longitude": {"type": "number"}}, "required": ["name", "latitude", "longitude"], "additionalProperties": False}}, "mode": {"type": "string", "enum": ["car", "motorbike", "combined", "bike", "walk"]}}, "required": ["stops"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "add_map_point", "description": "Add a known place as a point on the map.", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "latitude": {"type": "number"}, "longitude": {"type": "number"}, "address": {"type": "string"}}, "required": ["name", "latitude", "longitude"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "focus_coordinate", "description": "Move the map camera to a known coordinate.", "parameters": {"type": "object", "properties": {"latitude": {"type": "number"}, "longitude": {"type": "number"}}, "required": ["latitude", "longitude"], "additionalProperties": False}}},
    {"type": "function", "function": {"name": "reset_map_view", "description": "Reset the map camera to the default view.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    {"type": "function", "function": {"name": "clear_route_points", "description": "Remove all route points from the map.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
    {"type": "function", "function": {"name": "get_current_location", "description": "Request the browser to ask the user for their current location. The server never reads device GPS directly.", "parameters": {"type": "object", "properties": {}, "additionalProperties": False}}},
]


async def execute_tool(app: Any, name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Validate a model request and return a browser-facing map command."""
    if name == "search_places":
        query = str(args.get("query", "")).strip()[:200]
        if not query:
            raise HTTPException(status_code=422, detail="query is required")
        store = getattr(app.state, "map_store", None)
        region = getattr(app.state, "map_region", None)
        results = (
            []
            if not store or not region
            else [
                {**place, "node_id": None, "source": "custom_place"}
                for place in await store.search_places(*region, query, 8)
            ]
        )
        return {"action": {"type": "search", "query": query, "results": results}}

    if name == "search_web":
        query = str(args.get("query", "")).strip()[:400]
        if not query:
            raise HTTPException(status_code=422, detail="query is required")
        from app.services.assistant.web_search import search_web

        result = await search_web(query, 6)
        if result.get("error"):
            return result
        return {
            "action": {
                "type": "web_search",
                "query": query,
                "results": result.get("results", []),
            }
        }

    if name == "plot_route":
        stops = args.get("stops")
        if not isinstance(stops, list) or not 2 <= len(stops) <= 7:
            raise HTTPException(status_code=422, detail="plot_route requires 2 to 7 stops")
        for stop in stops:
            if not isinstance(stop, dict) or not isinstance(stop.get("name"), str):
                raise HTTPException(status_code=422, detail="each stop needs a name")
            if not all(
                isinstance(stop.get(key), (int, float))
                for key in ("latitude", "longitude")
            ):
                raise HTTPException(status_code=422, detail="each stop needs coordinates")
        return {"accepted": True, "action": {"type": "route", "stops": stops, "mode": args.get("mode")}}

    if name == "add_map_point":
        if not isinstance(args.get("name"), str) or not all(
            isinstance(args.get(key), (int, float)) for key in ("latitude", "longitude")
        ):
            raise HTTPException(status_code=422, detail="add_map_point needs name and coordinates")
        return {"accepted": True, "action": {"type": "point", "place": args}}

    if name == "focus_coordinate":
        if not all(
            isinstance(args.get(key), (int, float)) for key in ("latitude", "longitude")
        ):
            raise HTTPException(status_code=422, detail="focus_coordinate needs coordinates")
        return {"accepted": True, "action": {"type": "focus", "latitude": args["latitude"], "longitude": args["longitude"]}}

    if name in {"reset_map_view", "clear_route_points"}:
        return {"accepted": True, "action": {"type": "map_command", "command": name}}

    if name == "get_current_location":
        return {"accepted": True, "action": {"type": "location_request"}}

    raise HTTPException(status_code=404, detail=f"Unsupported assistant tool: {name}")

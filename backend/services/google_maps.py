"""Safely parse copied Google Maps direction links into ordered route stops."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, unquote, urlparse

import requests

ALLOWED_HOSTS = {"google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl", "goo.gl"}
COORDINATES = re.compile(r"^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$")
MODE_MAP = {"driving": "car", "walking": "walk", "bicycling": "bike", "two-wheeler": "motorbike"}
DATA_COORDINATES = re.compile(r"!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)")
VIEW_COORDINATES = re.compile(r"@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)")


def _validate_url(value: str):
    parsed = urlparse(value.strip())
    if parsed.scheme != "https" or (parsed.hostname or "").lower() not in ALLOWED_HOSTS:
        raise ValueError("Only HTTPS Google Maps links are accepted")
    return parsed


def _resolve_short_link(value: str):
    parsed = _validate_url(value)
    if parsed.hostname not in {"maps.app.goo.gl", "goo.gl"}:
        return value
    response = requests.get(value, allow_redirects=True, timeout=6, stream=True,
                            headers={"User-Agent": "SmartRoutePP/1.0"})
    response.close()
    _validate_url(response.url)
    return response.url


def _location(value: str):
    label = unquote(value).replace("+", " ").strip()
    match = COORDINATES.match(label)
    if match:
        latitude, longitude = float(match.group(1)), float(match.group(2))
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return {"label": label, "latitude": latitude, "longitude": longitude}
    return {"label": label, "latitude": None, "longitude": None}


def parse_google_maps_route(value: str):
    resolved_url = _resolve_short_link(value)
    parsed = _validate_url(resolved_url)
    query = parse_qs(parsed.query)
    stops = []
    if query.get("origin") and query.get("destination"):
        stops.append(_location(query["origin"][0]))
        for waypoint in query.get("waypoints", [""])[0].split("|"):
            if waypoint.strip():
                stops.append(_location(waypoint))
        stops.append(_location(query["destination"][0]))
        google_mode = query.get("travelmode", [""])[0]
    else:
        segments = [unquote(segment) for segment in parsed.path.split("/") if segment]
        try:
            index = segments.index("dir")
        except ValueError as exc:
            raise ValueError("The link is not a Google Maps directions link") from exc
        route_segments = []
        for segment in segments[index + 1:]:
            if segment.startswith(("data=", "@")):
                break
            if segment:
                route_segments.append(segment)
        stops = [_location(segment) for segment in route_segments]
        google_mode = ""
    if len(stops) < 2:
        raise ValueError("The Google Maps link must contain an origin and destination")
    if len(stops) > 7:
        raise ValueError("SmartRoute supports at most seven imported route points")
    return {
        "source": "google_maps_url",
        "stops": stops,
        "mode": MODE_MAP.get(google_mode, "motorbike"),
        "resolved_short_link": resolved_url != value,
    }


def parse_google_maps_place(value: str):
    """Extract a single place from Google search/place/directions links."""
    resolved_url = _resolve_short_link(value)
    parsed = _validate_url(resolved_url)
    query = parse_qs(parsed.query)
    candidate = next((query[key][0] for key in ("query", "destination", "origin") if query.get(key)), None)
    location = _location(candidate) if candidate else None
    path = unquote(parsed.path)
    precise = DATA_COORDINATES.search(path) or DATA_COORDINATES.search(parsed.query)
    if precise:
        latitude, longitude = float(precise.group(1)), float(precise.group(2))
        label = location["label"] if location else "Google Maps place"
        location = {"label": label, "latitude": latitude, "longitude": longitude}
    if location is None and "/place/" in path:
        label = path.split("/place/", 1)[1].split("/", 1)[0].replace("+", " ").strip()
        view = VIEW_COORDINATES.search(path)
        location = {"label": label, "latitude": float(view.group(1)) if view else None,
                    "longitude": float(view.group(2)) if view else None}
    if location is None:
        view = VIEW_COORDINATES.search(path)
        if view:
            location = {"label": "Google Maps location", "latitude": float(view.group(1)),
                        "longitude": float(view.group(2))}
    if location is None:
        raise ValueError("The Google Maps link does not contain a searchable place")
    return {"source": "google_maps_url", "location": location,
            "resolved_short_link": resolved_url != value}

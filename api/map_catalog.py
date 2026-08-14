"""Map catalog, revision history, and image storage API."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

from services.map_store import MapStore

router = APIRouter(prefix="/maps", tags=["maps"])
MAX_IMAGE_BYTES = 10 * 1024 * 1024


class MapRegistration(BaseModel):
    country: str
    province: str
    display_name: str = Field(min_length=1, max_length=120)
    graph_path: str | None = None
    version: str = "1.0.0"
    metadata: dict[str, Any] = Field(default_factory=dict)


class MapUpdate(BaseModel):
    version: str
    change_type: str = "data"
    summary: str = Field(min_length=1, max_length=500)
    graph_path: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class PlaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    category: str | None = None
    address: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class CustomRouteCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    coordinates: list[tuple[float, float]] = Field(min_length=2)
    bidirectional: bool = True
    modes: list[str] = Field(default_factory=lambda: ["car", "motorbike", "bike", "walk"])
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClosureCreate(BaseModel):
    source_node: int | str
    target_node: int | str
    edge_key: int | str | None = None
    reason: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None


def store(request: Request) -> MapStore:
    value = getattr(request.app.state, "map_store", None)
    if value is None:
        raise HTTPException(status_code=503, detail="Map catalog is unavailable")
    return value


@router.get("")
async def list_maps(request: Request):
    return await store(request).list_maps()


@router.post("", status_code=201)
async def register_map(request: Request, payload: MapRegistration):
    try:
        return await store(request).register_map(**payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/{country}/{province}")
async def get_map(request: Request, country: str, province: str):
    try:
        result = await store(request).get_map(country, province)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="Map is not registered")
    return result


@router.get("/{country}/{province}/updates")
async def list_updates(request: Request, country: str, province: str):
    try:
        return await store(request).list_updates(country, province)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{country}/{province}/updates", status_code=201)
async def add_update(request: Request, country: str, province: str, payload: MapUpdate):
    try:
        update_id = await store(request).add_update(country, province, **payload.model_dump())
        return {"id": update_id, "status": "recorded"}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{country}/{province}/places")
async def list_places(request: Request, country: str, province: str, q: str = "", limit: int = 20):
    try:
        return await store(request).search_places(country, province, q, limit)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{country}/{province}/places", status_code=201)
async def add_place(request: Request, country: str, province: str, payload: PlaceCreate):
    try:
        item_id = await store(request).add_place(country, province, **payload.model_dump())
        return {"id": item_id, "status": "active", "requires_map_download": False}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{country}/{province}/custom-routes")
async def list_custom_routes(request: Request, country: str, province: str):
    try:
        return await store(request).list_custom_routes(country, province)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{country}/{province}/custom-routes", status_code=201)
async def add_custom_route(request: Request, country: str, province: str, payload: CustomRouteCreate):
    allowed = {"car", "motorbike", "bike", "walk"}
    if not payload.modes or set(payload.modes) - allowed:
        raise HTTPException(status_code=400, detail="Modes must be car, motorbike, bike, or walk")
    if any(not (-90 <= lat <= 90 and -180 <= lon <= 180) for lat, lon in payload.coordinates):
        raise HTTPException(status_code=400, detail="Route coordinates must be [latitude, longitude]")
    try:
        item_id = await store(request).add_custom_route(country, province, **payload.model_dump())
        return {"id": item_id, "status": "active", "requires_map_download": False,
                "applied_after_restart": True}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{country}/{province}/closures")
async def list_closures(request: Request, country: str, province: str):
    try:
        return await store(request).list_closures(country, province)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{country}/{province}/closures", status_code=201)
async def add_closure(request: Request, country: str, province: str, payload: ClosureCreate):
    try:
        item_id = await store(request).add_closure(country, province, **payload.model_dump())
        return {"id": item_id, "status": "active", "requires_map_download": False,
                "applied_after_restart": True}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/{country}/{province}/images")
async def list_images(request: Request, country: str, province: str):
    try:
        return await store(request).list_images(country, province)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/{country}/{province}/images", status_code=201)
async def upload_image(request: Request, country: str, province: str, image: UploadFile = File(...),
                       caption: str | None = Form(None)):
    if not image.content_type or not image.content_type.startswith("image/"):
        raise HTTPException(status_code=415, detail="Only image uploads are accepted")
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image exceeds the 10 MB limit")
    try:
        image_id = await store(request).add_image(country, province, image.filename or "map-image", image.content_type, data, caption)
        return {"id": image_id, "filename": image.filename, "byte_size": len(data)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/assets/images/{image_id}")
async def get_image(request: Request, image_id: int):
    image = await store(request).get_image(image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return Response(image["image_data"], media_type=image["content_type"], headers={
        "Content-Disposition": f'inline; filename="{image["filename"]}"',
        "Cache-Control": "public, max-age=86400",
    })

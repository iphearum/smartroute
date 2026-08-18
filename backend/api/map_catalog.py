"""Map catalog, revision history, and image storage API."""

from __future__ import annotations

import asyncio
import secrets
from datetime import datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from services.map_store import MapStore
from services.osm_places import download_osm_places

router = APIRouter(prefix="/maps", tags=["maps"])
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAPS_DIR = Path(__file__).resolve().parents[1] / "maps"
CAMBODIA_PMTILES = MAPS_DIR / "cambodia.pmtiles"


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
    source: Literal["manual", "merchant", "admin"] = "manual"
    osm_feature_id: int | None = Field(default=None, gt=0)


class OsmPlaceImport(BaseModel):
    query: str = Field(min_length=2, max_length=200)


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


class ThreeDAssetCreate(BaseModel):
    country: str = "cambodia"
    province: str
    name: str = Field(min_length=1, max_length=255)
    model_url: str = Field(min_length=1, max_length=2000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    altitude: float = 0
    rotation_x: float = 90
    rotation_y: float = 0
    rotation_z: float = 0
    scale: float = Field(default=1, gt=0)
    metadata: dict[str, Any] = Field(default_factory=dict)
    place_id: int | None = Field(default=None, gt=0)


def store(request: Request) -> MapStore:
    value = getattr(request.app.state, "map_store", None)
    if value is None:
        raise HTTPException(status_code=503, detail="Map catalog is unavailable")
    return value


@router.get("")
async def list_maps(request: Request):
    return await store(request).list_maps()


@router.get("/viewport/places", include_in_schema=False)
@router.get("/data/viewport/places")
async def viewport_places(request: Request, country: str = "cambodia", south: float = -90,
                          west: float = -180, north: float = 90, east: float = 180,
                          limit: int = 500):
    try:
        return await store(request).places_in_viewport(
            country, south, west, north, east, limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/viewport/features", include_in_schema=False)
@router.get("/data/viewport/features")
async def viewport_features(request: Request, country: str = "cambodia", south: float = -90,
                            west: float = -180, north: float = 90, east: float = 180,
                            types: str = "poi", limit: int = 2000):
    try:
        selected = [value.strip() for value in types.split(",") if value.strip()]
        return await store(request).features_in_viewport(
            country, south, west, north, east, selected, limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/viewport/3d-assets", include_in_schema=False)
@router.get("/data/viewport/3d-assets")
async def viewport_three_d_assets(request: Request, country: str = "cambodia",
                                  south: float = -90, west: float = -180,
                                  north: float = 90, east: float = 180, limit: int = 100):
    try:
        return await store(request).three_d_assets_in_viewport(
            country, south, west, north, east, limit,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/tiles/cambodia.pmtiles", response_class=FileResponse)
async def cambodia_vector_tiles():
    """Serve the locally generated PMTiles archive with HTTP range support."""
    if not CAMBODIA_PMTILES.is_file() or CAMBODIA_PMTILES.stat().st_size == 0:
        raise HTTPException(
            status_code=503,
            detail="Cambodia basemap is not built; run backend/scripts/build_pmtiles.sh",
        )
    return FileResponse(
        CAMBODIA_PMTILES,
        media_type="application/vnd.pmtiles",
        headers={
            "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
            "Content-Disposition": 'inline; filename="cambodia.pmtiles"',
        },
    )


@router.post("/3d-assets", status_code=201)
async def register_three_d_asset(request: Request, payload: ThreeDAssetCreate):
    values = payload.model_dump()
    country, province = values.pop("country"), values.pop("province")
    try:
        asset = await store(request).register_three_d_asset(country, province, **values)
        return {"id": asset.id, "status": "active"}
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


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


@router.get("/{country}/{province}/graphml", response_class=FileResponse)
async def download_graphml(request: Request, country: str, province: str):
    """Download a registered province road graph without exposing arbitrary paths."""
    try:
        catalog = store(request)
        result = await catalog.get_map(country, province)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not result:
        raise HTTPException(status_code=404, detail="Map is not registered")
    if not result.get("graph_path"):
        raise HTTPException(status_code=404, detail="Map has no GraphML file")

    graph_path = Path(result["graph_path"]).resolve()
    maps_root = catalog.root.resolve()
    if maps_root not in graph_path.parents or graph_path.suffix.lower() != ".graphml":
        raise HTTPException(status_code=403, detail="Registered graph path is not downloadable")
    if not graph_path.is_file() or graph_path.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="GraphML file is missing or empty")

    filename = f"{country}_{province}.graphml"
    return FileResponse(
        graph_path,
        media_type="application/graphml+xml",
        filename=filename,
        headers={"Cache-Control": "private, max-age=3600"},
    )


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


async def _import_osm_job(app, job_id: str, country: str, province: str, query: str):
    job = app.state.poi_import_jobs[job_id]
    try:
        job.update(status="downloading", message=f"Downloading places for {query}…")
        places = await asyncio.to_thread(download_osm_places, query)
        job.update(status="saving", found=len(places), message=f"Saving {len(places)} places…")
        result = await app.state.map_store.import_places(country, province, places)
        job.update(status="complete", message="Place import complete", **result)
    except Exception as exc:
        job.update(status="failed", message=str(exc))


@router.post("/{country}/{province}/places/import-osm", status_code=202)
async def import_osm_places(request: Request, country: str, province: str, payload: OsmPlaceImport):
    try:
        await store(request)._map(country, province)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    running = next((key for key, value in request.app.state.poi_import_jobs.items()
                    if value["status"] in {"queued", "downloading", "saving"}), None)
    if running:
        raise HTTPException(status_code=409, detail="A place import is already running")
    job_id = secrets.token_urlsafe(12)
    request.app.state.poi_import_jobs[job_id] = {
        "id": job_id, "query": payload.query.strip(), "status": "queued",
        "message": "Import queued", "found": 0, "created": 0, "updated": 0,
    }
    task = asyncio.create_task(_import_osm_job(request.app, job_id, country, province,
                                               payload.query.strip()))
    request.app.state.poi_import_tasks.add(task)
    task.add_done_callback(request.app.state.poi_import_tasks.discard)
    return request.app.state.poi_import_jobs[job_id]


@router.get("/{country}/{province}/places/import-osm/{job_id}")
async def osm_place_import_status(request: Request, country: str, province: str, job_id: str):
    job = request.app.state.poi_import_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Import job not found")
    return job


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

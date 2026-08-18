"""Place-linked business, storefront, catalog, and inventory APIs."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from tortoise.exceptions import IntegrityError

from services.map_store import MapStore

router = APIRouter(prefix="/commerce", tags=["commerce"])


def store(request: Request) -> MapStore:
    value = getattr(request.app.state, "map_store", None)
    if value is None:
        raise HTTPException(status_code=503, detail="Commerce storage is unavailable")
    return value


class BusinessCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    owner_user_id: str | None = Field(default=None, max_length=100)
    business_type: str = Field(default="shop", min_length=1, max_length=80)
    description: str | None = None
    logo_url: str | None = Field(default=None, max_length=2000)
    status: Literal["draft", "active", "suspended"] = "draft"
    verification_status: Literal["unverified", "pending", "verified", "rejected"] = "unverified"
    metadata: dict[str, Any] = Field(default_factory=dict)


class BranchCreate(BaseModel):
    place_id: int = Field(gt=0)
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=80)
    email: str | None = Field(default=None, max_length=255)
    opening_hours: dict[str, Any] = Field(default_factory=dict)
    pickup_enabled: bool = False
    delivery_enabled: bool = False
    metadata: dict[str, Any] = Field(default_factory=dict)


class StorefrontCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=120, pattern=r"^[a-z0-9]+(?:[-_][a-z0-9]+)*$")
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    currency: str = Field(default="USD", min_length=3, max_length=3)
    theme: dict[str, Any] = Field(default_factory=dict)
    published: bool = False


class ProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=120)
    status: Literal["draft", "active", "archived"] = "draft"
    metadata: dict[str, Any] = Field(default_factory=dict)


class ProductVariantCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=120)
    title: str | None = Field(default=None, max_length=255)
    price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    compare_at_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    attributes: dict[str, Any] = Field(default_factory=dict)
    weight_grams: int | None = Field(default=None, ge=0)
    active: bool = True

    @model_validator(mode="after")
    def compare_price_is_not_lower(self):
        if self.compare_at_price is not None and self.compare_at_price < self.price:
            raise ValueError("compare_at_price must be greater than or equal to price")
        return self


class InventoryUpdate(BaseModel):
    quantity_available: int = Field(default=0, ge=0)
    quantity_reserved: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def reserved_does_not_exceed_available(self):
        if self.quantity_reserved > self.quantity_available:
            raise ValueError("Reserved quantity cannot exceed available quantity")
        return self


class PlaceMediaCreate(BaseModel):
    media_type: Literal["image", "video", "document", "virtual-tour"] = "image"
    url: str = Field(min_length=1, max_length=2000)
    thumbnail_url: str | None = Field(default=None, max_length=2000)
    caption: str | None = None
    sort_order: int = Field(default=0, ge=0)
    metadata: dict[str, Any] = Field(default_factory=dict)


def _error(exc: Exception):
    if isinstance(exc, KeyError):
        return HTTPException(status_code=404, detail=exc.args[0])
    if isinstance(exc, IntegrityError):
        return HTTPException(status_code=409, detail="A record with these identifiers already exists")
    return HTTPException(status_code=400, detail=str(exc))


@router.post("/businesses", status_code=201)
async def create_business(request: Request, payload: BusinessCreate):
    try:
        business = await store(request).create_business(**payload.model_dump())
        return {"id": business.id, "status": business.status}
    except (ValueError, IntegrityError) as exc:
        raise _error(exc) from exc


@router.get("/businesses/{business_id}")
async def get_business(request: Request, business_id: int):
    try:
        return await store(request).get_business(business_id)
    except KeyError as exc:
        raise _error(exc) from exc


@router.post("/businesses/{business_id}/branches", status_code=201)
async def create_branch(request: Request, business_id: int, payload: BranchCreate):
    values = payload.model_dump()
    place_id = values.pop("place_id")
    try:
        branch = await store(request).create_shop_branch(business_id, place_id, **values)
        return {"id": branch.id, "business_id": business_id, "place_id": place_id}
    except (KeyError, ValueError, IntegrityError) as exc:
        raise _error(exc) from exc


@router.post("/businesses/{business_id}/storefronts", status_code=201)
async def create_storefront(request: Request, business_id: int, payload: StorefrontCreate):
    try:
        storefront = await store(request).create_storefront(business_id, **payload.model_dump())
        return {"id": storefront.id, "slug": storefront.slug, "published": storefront.published}
    except (KeyError, ValueError, IntegrityError) as exc:
        raise _error(exc) from exc


@router.post("/businesses/{business_id}/products", status_code=201)
async def create_product(request: Request, business_id: int, payload: ProductCreate):
    try:
        product = await store(request).create_product(business_id, **payload.model_dump())
        return {"id": product.id, "status": product.status}
    except (KeyError, ValueError, IntegrityError) as exc:
        raise _error(exc) from exc


@router.get("/businesses/{business_id}/products")
async def list_products(request: Request, business_id: int):
    try:
        return await store(request).list_products(business_id)
    except KeyError as exc:
        raise _error(exc) from exc


@router.post("/products/{product_id}/variants", status_code=201)
async def create_product_variant(request: Request, product_id: int,
                                 payload: ProductVariantCreate):
    try:
        variant = await store(request).create_product_variant(product_id, **payload.model_dump())
        return {"id": variant.id, "sku": variant.sku, "price": variant.price}
    except (KeyError, ValueError, IntegrityError) as exc:
        raise _error(exc) from exc


@router.put("/branches/{branch_id}/inventory/{variant_id}")
async def set_inventory(request: Request, branch_id: int, variant_id: int,
                        payload: InventoryUpdate):
    try:
        item = await store(request).set_inventory(branch_id, variant_id, **payload.model_dump())
        return {
            "id": item.id,
            "branch_id": branch_id,
            "variant_id": variant_id,
            "quantity_available": item.quantity_available,
            "quantity_reserved": item.quantity_reserved,
        }
    except (KeyError, ValueError, IntegrityError) as exc:
        raise _error(exc) from exc


@router.get("/places/{place_id}")
async def get_place_commerce_profile(request: Request, place_id: int):
    try:
        return await store(request).get_place_profile(place_id)
    except KeyError as exc:
        raise _error(exc) from exc


@router.post("/places/{place_id}/media", status_code=201)
async def add_place_media(request: Request, place_id: int, payload: PlaceMediaCreate):
    try:
        media = await store(request).add_place_media(place_id, **payload.model_dump())
        return {"id": media.id, "place_id": place_id, "media_type": media.media_type}
    except (KeyError, ValueError, IntegrityError) as exc:
        raise _error(exc) from exc

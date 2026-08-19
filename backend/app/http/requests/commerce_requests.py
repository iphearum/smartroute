"""Validation schemas for commerce endpoints (Laravel's Form Requests)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


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


class BusinessUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=255)
    legal_name: str | None = Field(default=None, max_length=255)
    description: str | None = None
    logo_url: str | None = Field(default=None, max_length=2000)
    status: Literal["draft", "active", "suspended"] | None = None


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


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    category: str | None = Field(default=None, max_length=120)
    status: Literal["draft", "active", "archived"] | None = None


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


class ProductVariantUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    compare_at_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    active: bool | None = None


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

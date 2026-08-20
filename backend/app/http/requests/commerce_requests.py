"""Validation schemas for commerce endpoints (Laravel's Form Requests)."""

from __future__ import annotations

from datetime import datetime
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


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=80)
    email: str | None = Field(default=None, max_length=255)
    opening_hours: dict[str, Any] | None = None
    pickup_enabled: bool | None = None
    delivery_enabled: bool | None = None
    active: bool | None = None
    metadata: dict[str, Any] | None = None


PLACE_STATUSES = ("active", "temporarily_closed", "permanently_closed", "moved", "nonexistent", "disabled")


class PlaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    address: str | None = None
    category: str | None = Field(default=None, max_length=100)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    status: Literal["active", "temporarily_closed", "permanently_closed", "moved", "nonexistent", "disabled"] | None = None
    moved_to_place_id: int | None = Field(default=None, gt=0)


class BranchScheduleCreate(BaseModel):
    kind: Literal["holiday", "closure", "fire", "maintenance", "event", "other"] = "closure"
    title: str = Field(min_length=1, max_length=255)
    starts_at: datetime
    ends_at: datetime
    all_day: bool = True
    is_closed: bool = True
    notes: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def ends_after_start(self):
        if self.ends_at <= self.starts_at:
            raise ValueError("Schedule end must be after its start")
        return self


class OrderLineCreate(BaseModel):
    variant_id: int = Field(gt=0)
    quantity: int = Field(gt=0, le=1000)


class OrderCreate(BaseModel):
    branch_id: int = Field(gt=0)
    order_type: Literal["dine_in", "takeaway", "delivery"] = "dine_in"
    lines: list[OrderLineCreate] = Field(min_length=1, max_length=100)


class StaffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="Staff", min_length=1, max_length=120)
    hourly_rate: Decimal = Field(default=0, ge=0, max_digits=14, decimal_places=2)
    hours_this_week: Decimal = Field(default=0, ge=0, max_digits=8, decimal_places=2)
    clocked_in: bool = False


class StaffUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    role: str | None = Field(default=None, min_length=1, max_length=120)
    hourly_rate: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    hours_this_week: Decimal | None = Field(default=None, ge=0, max_digits=8, decimal_places=2)
    clocked_in: bool | None = None
    active: bool | None = None


class PayrollRunCreate(BaseModel):
    period_start: str = Field(min_length=10, max_length=10)
    period_end: str = Field(min_length=10, max_length=10)

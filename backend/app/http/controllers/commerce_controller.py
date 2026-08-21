"""Businesses, storefronts, catalog, inventory, imports, and currency rates.

Each action delegates to a focused service; the per-file `store()` and
`_error()` helpers the old `api/commerce.py` carried are now
`BaseController.state()` and `ResponseMixin.error()`.
"""

from __future__ import annotations

import asyncio
from datetime import date, datetime, timezone

from fastapi import HTTPException, Request, UploadFile
from tortoise.exceptions import IntegrityError

from app.http.controllers.auth_controller import AuthController
from app.http.controllers.base_controller import BaseController
from app.http.requests.commerce_requests import (BranchCreate, BusinessCreate,
                                                 BusinessUpdate, InventoryUpdate,
                                                 PlaceMediaCreate, ProductCreate,
                                                 ProductUpdate, ProductVariantCreate,
                                                 ProductVariantUpdate, StorefrontCreate,
                                                 BranchUpdate, OrderCreate, PayrollRunCreate,
                                                 StaffCreate, StaffUpdate, PlaceUpdate,
                                                 BranchScheduleCreate)
from app.services.commerce.business_service import BusinessService
from app.services.commerce.exchange_rate_service import ExchangeRateService
from app.services.commerce.inventory_service import InventoryService
from app.services.commerce.product_service import ProductService
from app.services.commerce.operations_service import OperationsService
from app.services.commerce.availability_service import AvailabilityService
from app.clients.nbc_exchange import NbcExchangeRateError, fetch_nbc_rates
from app.support.product_import import (MAX_UPLOAD_BYTES, ImportRow, ProductImportError,
                                     parse_products)

DOMAIN_ERRORS = (KeyError, ValueError, IntegrityError)


class CommerceController(BaseController[BusinessService]):
    service_class = BusinessService

    def __init__(self, service: BusinessService | None = None) -> None:
        super().__init__(service)
        self.products = ProductService()
        self.inventory = InventoryService()
        self.rates = ExchangeRateService()
        self.operations = OperationsService()
        self.availability = AvailabilityService()

    def _map_store(self, request: Request):
        """Place media/profile still live on MapService (place domain)."""
        return self.state(request, "map_store", "Commerce storage is unavailable")

    # --- businesses -------------------------------------------------------
    async def create_business(self, payload: BusinessCreate):
        try:
            business = await self.service.create_business(**payload.model_dump())
            return {"id": business.id, "status": business.status}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def get_business(self, business_id: int):
        try:
            return await self.service.get_business(business_id)
        except KeyError as exc:
            raise self.error(exc) from exc

    async def my_business(self, request: Request):
        user_id = AuthController.current_user_id(request)
        if user_id is None:
            raise HTTPException(status_code=401, detail="Not authenticated")
        business = await self.service.get_business_for_owner(str(user_id))
        if business is None:
            raise HTTPException(status_code=404, detail="No business owned by this account")
        return business

    async def update_business(self, business_id: int, payload: BusinessUpdate):
        try:
            business = await self.service.update_business(
                business_id, **payload.model_dump(exclude_unset=True),
            )
            return {"id": business.id, "status": business.status}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def create_branch(self, business_id: int, payload: BranchCreate):
        values = payload.model_dump()
        place_id = values.pop("place_id")
        try:
            branch = await self.service.create_shop_branch(business_id, place_id, **values)
            return {"id": branch.id, "business_id": business_id, "place_id": place_id}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def create_storefront(self, business_id: int, payload: StorefrontCreate):
        try:
            storefront = await self.service.create_storefront(business_id, **payload.model_dump())
            return {"id": storefront.id, "slug": storefront.slug,
                    "published": storefront.published}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def update_branch(self, branch_id: int, payload: BranchUpdate):
        try:
            branch = await self.service.update_shop_branch(
                branch_id, **payload.model_dump(exclude_unset=True),
            )
            return {"id": branch.id, "business_id": branch.business_id}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def list_branch_schedules(self, branch_id: int):
        try:
            return await self.availability.list_schedules(branch_id)
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def create_branch_schedule(self, branch_id: int, payload: BranchScheduleCreate):
        try:
            event = await self.availability.create_schedule(
                branch_id, **payload.model_dump(),
            )
            return {"id": event.id, "branch_id": branch_id, "kind": event.kind}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def delete_branch_schedule(self, schedule_id: int):
        try:
            await self.availability.delete_schedule(schedule_id)
            return {"id": schedule_id, "active": False}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def dashboard(self, business_id: int):
        try:
            return await self.operations.dashboard(business_id)
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def create_order(self, business_id: int, payload: OrderCreate):
        try:
            return await self.operations.create_order(
                business_id, payload.branch_id, payload.order_type,
                [line.model_dump() for line in payload.lines],
            )
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def list_staff(self, business_id: int):
        try:
            return await self.operations.list_staff(business_id)
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def create_staff(self, business_id: int, payload: StaffCreate):
        try:
            staff = await self.operations.create_staff(business_id, **payload.model_dump())
            return {"id": staff.id, "name": staff.name}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def update_staff(self, staff_id: int, payload: StaffUpdate):
        try:
            staff = await self.operations.update_staff(
                staff_id, **payload.model_dump(exclude_unset=True),
            )
            return {"id": staff.id, "name": staff.name}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def run_payroll(self, business_id: int, payload: PayrollRunCreate):
        try:
            return await self.operations.run_payroll(
                business_id, date.fromisoformat(payload.period_start),
                date.fromisoformat(payload.period_end),
            )
        except (ValueError, KeyError) as exc:
            raise self.error(exc) from exc

    # --- catalog ----------------------------------------------------------
    async def create_product(self, business_id: int, payload: ProductCreate):
        try:
            product = await self.products.create_product(business_id, **payload.model_dump())
            return {"id": product.id, "status": product.status}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def list_products(self, business_id: int):
        try:
            return await self.products.list_products(business_id)
        except KeyError as exc:
            raise self.error(exc) from exc

    async def update_product(self, product_id: int, payload: ProductUpdate):
        try:
            product = await self.products.update_product(
                product_id, **payload.model_dump(exclude_unset=True),
            )
            return {"id": product.id, "status": product.status}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def create_variant(self, product_id: int, payload: ProductVariantCreate):
        try:
            variant = await self.products.create_product_variant(
                product_id, **payload.model_dump(),
            )
            return {"id": variant.id, "sku": variant.sku, "price": variant.price}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def update_variant(self, variant_id: int, payload: ProductVariantUpdate):
        try:
            variant = await self.products.update_product_variant(
                variant_id, **payload.model_dump(exclude_unset=True),
            )
            return {"id": variant.id, "sku": variant.sku, "price": variant.price}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    # --- inventory --------------------------------------------------------
    async def list_branch_inventory(self, branch_id: int):
        try:
            return await self.inventory.list_branch_inventory(branch_id)
        except KeyError as exc:
            raise self.error(exc) from exc

    async def set_inventory(self, branch_id: int, variant_id: int, payload: InventoryUpdate):
        try:
            item = await self.inventory.set_inventory(
                branch_id, variant_id, **payload.model_dump(),
            )
            return {
                "id": item.id, "branch_id": branch_id, "variant_id": variant_id,
                "quantity_available": item.quantity_available,
                "quantity_reserved": item.quantity_reserved,
            }
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    # --- places (still served by MapService) --------------------------------
    async def get_place_profile(self, request: Request, place_id: int):
        try:
            return await self._map_store(request).get_place_profile(place_id)
        except KeyError as exc:
            raise self.error(exc) from exc

    async def add_place_media(self, request: Request, place_id: int, payload: PlaceMediaCreate):
        try:
            media = await self._map_store(request).add_place_media(
                place_id, **payload.model_dump(),
            )
            return {"id": media.id, "place_id": place_id, "media_type": media.media_type}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    async def update_place(self, request: Request, place_id: int, payload: PlaceUpdate):
        try:
            place = await self._map_store(request).update_place(
                place_id, **payload.model_dump(exclude_unset=True),
            )
            return {"id": place.id, "status": place.status, "active": place.active}
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc

    # --- bulk import ------------------------------------------------------
    @staticmethod
    def _row_json(row: ImportRow) -> dict:
        return {
            "row": row.row_number, "name": row.name, "sku": row.sku,
            "price": str(row.price),
            "compare_at_price": str(row.compare_at_price) if row.compare_at_price else None,
            "category": row.category, "variant_title": row.variant_title,
            "quantity": row.quantity,
        }

    @staticmethod
    async def _parse_upload(file: UploadFile):
        payload = await file.read(MAX_UPLOAD_BYTES + 1)
        if len(payload) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)}MB",
            )
        try:
            return parse_products(file.filename or "", payload)
        except ProductImportError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

    async def preview_import(self, business_id: int, file: UploadFile):
        try:
            await self.service.get_business(business_id)
        except KeyError as exc:
            raise self.error(exc) from exc
        preview = await self._parse_upload(file)
        return {
            "columns": preview.columns,
            "ignored_columns": preview.ignored_columns,
            "valid_count": preview.valid_count,
            "errors": preview.errors,
            "rows": [self._row_json(row) for row in preview.rows[:20]],
        }

    async def commit_import(self, business_id: int, file: UploadFile,
                            branch_id: int | None = None):
        preview = await self._parse_upload(file)
        if not preview.rows:
            raise HTTPException(
                status_code=422,
                detail="No valid rows to import. Fix the reported errors and try again.",
            )
        try:
            result = await self.products.import_products(business_id, preview.rows, branch_id)
        except DOMAIN_ERRORS as exc:
            raise self.error(exc) from exc
        return {**result, "errors": preview.errors, "columns": preview.columns}

    # --- currency ---------------------------------------------------------
    async def latest_exchange_rates(self):
        return await self.rates.latest_exchange_rates()

    async def refresh_exchange_rates(self):
        try:
            rates = await asyncio.to_thread(fetch_nbc_rates)
        except NbcExchangeRateError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        saved = await self.rates.upsert_exchange_rates(
            rates, effective_date=datetime.now(timezone.utc).date(),
        )
        return {"count": len(saved.data), "currencies": sorted(saved.data)}

"""Commerce endpoints: businesses, catalog, inventory, operations, imports, currency."""

from __future__ import annotations

from fastapi import APIRouter, File, Form, Request, UploadFile

from app.http.controllers.commerce_controller import CommerceController
from app.http.requests.commerce_requests import (BranchCreate, BusinessCreate,
                                                 BusinessUpdate, InventoryUpdate,
                                                 PlaceMediaCreate, ProductCreate,
                                                 ProductUpdate, ProductVariantCreate,
                                                 ProductVariantUpdate, StorefrontCreate,
                                                 BranchUpdate, OrderCreate, PayrollRunCreate,
                                                 StaffCreate, StaffUpdate, PlaceUpdate,
                                                 BranchScheduleCreate)

commerce = APIRouter(prefix="/commerce", tags=["commerce"])
commerce_controller = CommerceController()


@commerce.post("/businesses", status_code=201)
async def create_business(payload: BusinessCreate):
    return await commerce_controller.create_business(payload)


@commerce.get("/businesses/mine")
async def my_business(request: Request):
    return await commerce_controller.my_business(request)


@commerce.get("/businesses/{business_id}")
async def get_business(business_id: int):
    return await commerce_controller.get_business(business_id)


@commerce.patch("/businesses/{business_id}")
async def update_business(business_id: int, payload: BusinessUpdate):
    return await commerce_controller.update_business(business_id, payload)


@commerce.post("/businesses/{business_id}/branches", status_code=201)
async def create_branch(business_id: int, payload: BranchCreate):
    return await commerce_controller.create_branch(business_id, payload)


@commerce.post("/businesses/{business_id}/storefronts", status_code=201)
async def create_storefront(business_id: int, payload: StorefrontCreate):
    return await commerce_controller.create_storefront(business_id, payload)


@commerce.patch("/branches/{branch_id}")
async def update_branch(branch_id: int, payload: BranchUpdate):
    return await commerce_controller.update_branch(branch_id, payload)


@commerce.get("/branches/{branch_id}/schedules")
async def list_branch_schedules(branch_id: int):
    return await commerce_controller.list_branch_schedules(branch_id)


@commerce.post("/branches/{branch_id}/schedules", status_code=201)
async def create_branch_schedule(branch_id: int, payload: BranchScheduleCreate):
    return await commerce_controller.create_branch_schedule(branch_id, payload)


@commerce.delete("/schedules/{schedule_id}")
async def delete_branch_schedule(schedule_id: int):
    return await commerce_controller.delete_branch_schedule(schedule_id)


@commerce.get("/businesses/{business_id}/dashboard")
async def dashboard(business_id: int):
    return await commerce_controller.dashboard(business_id)


@commerce.post("/businesses/{business_id}/orders", status_code=201)
async def create_order(business_id: int, payload: OrderCreate):
    return await commerce_controller.create_order(business_id, payload)


@commerce.get("/businesses/{business_id}/staff")
async def list_staff(business_id: int):
    return await commerce_controller.list_staff(business_id)


@commerce.post("/businesses/{business_id}/staff", status_code=201)
async def create_staff(business_id: int, payload: StaffCreate):
    return await commerce_controller.create_staff(business_id, payload)


@commerce.patch("/staff/{staff_id}")
async def update_staff(staff_id: int, payload: StaffUpdate):
    return await commerce_controller.update_staff(staff_id, payload)


@commerce.post("/businesses/{business_id}/payroll/runs", status_code=201)
async def run_payroll(business_id: int, payload: PayrollRunCreate):
    return await commerce_controller.run_payroll(business_id, payload)


@commerce.post("/businesses/{business_id}/products", status_code=201)
async def create_product(business_id: int, payload: ProductCreate):
    return await commerce_controller.create_product(business_id, payload)


@commerce.get("/businesses/{business_id}/products")
async def list_products(business_id: int):
    return await commerce_controller.list_products(business_id)


@commerce.patch("/products/{product_id}")
async def update_product(product_id: int, payload: ProductUpdate):
    return await commerce_controller.update_product(product_id, payload)


@commerce.post("/products/{product_id}/variants", status_code=201)
async def create_variant(product_id: int, payload: ProductVariantCreate):
    return await commerce_controller.create_variant(product_id, payload)


@commerce.patch("/variants/{variant_id}")
async def update_variant(variant_id: int, payload: ProductVariantUpdate):
    return await commerce_controller.update_variant(variant_id, payload)


@commerce.get("/branches/{branch_id}/inventory")
async def list_branch_inventory(branch_id: int):
    return await commerce_controller.list_branch_inventory(branch_id)


@commerce.put("/branches/{branch_id}/inventory/{variant_id}")
async def set_inventory(branch_id: int, variant_id: int, payload: InventoryUpdate):
    return await commerce_controller.set_inventory(branch_id, variant_id, payload)


@commerce.get("/places/{place_id}")
async def get_place_profile(request: Request, place_id: int):
    return await commerce_controller.get_place_profile(request, place_id)


@commerce.patch("/places/{place_id}")
async def update_place(request: Request, place_id: int, payload: PlaceUpdate):
    return await commerce_controller.update_place(request, place_id, payload)


@commerce.post("/places/{place_id}/media", status_code=201)
async def add_place_media(request: Request, place_id: int, payload: PlaceMediaCreate):
    return await commerce_controller.add_place_media(request, place_id, payload)


@commerce.post("/businesses/{business_id}/products/import/preview")
async def preview_product_import(business_id: int, file: UploadFile = File(...)):
    return await commerce_controller.preview_import(business_id, file)


@commerce.post("/businesses/{business_id}/products/import")
async def commit_product_import(business_id: int, file: UploadFile = File(...),
                                branch_id: int | None = Form(default=None)):
    return await commerce_controller.commit_import(business_id, file, branch_id)


@commerce.get("/exchange-rates/latest")
async def latest_exchange_rates():
    return await commerce_controller.latest_exchange_rates()


@commerce.post("/exchange-rates/refresh")
async def refresh_exchange_rates():
    return await commerce_controller.refresh_exchange_rates()

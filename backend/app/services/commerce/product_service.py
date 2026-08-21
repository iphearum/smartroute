"""Catalog: products, their variants, and bulk spreadsheet import."""

from __future__ import annotations

import re

from tortoise.transactions import in_transaction

from app.models.commerce import (Business, InventoryItem, Product, ProductVariant,
                                 ShopBranch)
from app.services.base_service import BaseService
from app.support.product_import import ImportRow

VARIANT_FIELDS = ("id", "sku", "title", "price", "compare_at_price", "attributes",
                  "weight_grams", "active")


class ProductService(BaseService[Product]):
    model = Product

    @staticmethod
    async def _require_business(business_id: int) -> None:
        if not await Business.filter(id=business_id).exists():
            raise KeyError("Business not found")

    async def create_product(self, business_id: int, **values) -> Product:
        await self._require_business(business_id)
        values["name"] = values["name"].strip()
        return await self.create(business_id=business_id, **values)

    async def list_products(self, business_id: int) -> list[dict]:
        await self._require_business(business_id)
        products = await self.values(
            "id", "name", "description", "category", "status", "metadata",
            "created_at", "updated_at",
            business_id=business_id,
        )
        if not products:
            return products
        # One query for every variant in the catalog, grouped in memory.
        # The previous implementation issued one query per product, so a
        # 200-item catalog cost 201 round trips.
        variants = await ProductVariant.filter(
            product__business_id=business_id, active=True,
        ).order_by("id").values("product_id", *VARIANT_FIELDS)
        grouped: dict[int, list[dict]] = {}
        for variant in variants:
            grouped.setdefault(variant.pop("product_id"), []).append(variant)
        for product in products:
            product["variants"] = grouped.get(product["id"], [])
        return products

    async def update_product(self, product_id: int, **values) -> Product:
        product = await self.find(product_id)
        if product is None:
            raise KeyError("Product not found")
        if values.get("name") is not None:
            values["name"] = values["name"].strip()
        for field, value in values.items():
            if value is not None:
                setattr(product, field, value)
        await product.save()
        return product

    async def create_product_variant(self, product_id: int, **values) -> ProductVariant:
        if not await self.exists(id=product_id):
            raise KeyError("Product not found")
        values["sku"] = values["sku"].strip().upper()
        return await ProductVariant.create(product_id=product_id, **values)

    async def update_product_variant(self, variant_id: int, **values) -> ProductVariant:
        variant = await ProductVariant.get_or_none(id=variant_id)
        if variant is None:
            raise KeyError("Product variant not found")
        price = values.get("price") if values.get("price") is not None else variant.price
        compare_at_price = (
            values["compare_at_price"] if values.get("compare_at_price") is not None
            else variant.compare_at_price
        )
        if compare_at_price is not None and compare_at_price < price:
            raise ValueError("compare_at_price must be greater than or equal to price")
        for field, value in values.items():
            if value is not None:
                setattr(variant, field, value)
        await variant.save()
        return variant

    async def import_products(self, business_id: int, rows: list[ImportRow],
                              branch_id: int | None = None) -> dict:
        """Bulk-create products/variants from a parsed spreadsheet.

        Rows naming an existing product attach another variant to it rather
        than creating a duplicate product. Runs in one transaction so a
        mid-file failure cannot leave a half-imported catalog behind.
        """
        await self._require_business(business_id)
        if branch_id is not None:
            branch = await ShopBranch.get_or_none(id=branch_id)
            if branch is None:
                raise KeyError("Branch not found")
            if branch.business_id != business_id:
                raise ValueError("Branch belongs to a different business")

        created_products = created_variants = stocked = 0
        skipped: list[dict] = []
        async with in_transaction():
            existing = {
                row["name"].casefold(): row["id"]
                for row in await Product.filter(business_id=business_id).values("id", "name")
            }
            taken_skus = set(await ProductVariant.filter(
                product__business_id=business_id,
            ).values_list("sku", flat=True))

            for row in rows:
                product_id = existing.get(row.name.casefold())
                if product_id is None:
                    product = await Product.create(
                        business_id=business_id, name=row.name,
                        description=row.description, category=row.category,
                        status="active",
                    )
                    product_id = product.id
                    existing[row.name.casefold()] = product_id
                    created_products += 1

                sku = row.sku or (
                    f"{re.sub(r'[^A-Z0-9]+', '-', row.name.upper()).strip('-') or 'ITEM'}"
                    f"-{product_id}"
                )
                if sku in taken_skus:
                    # SKU is globally unique in the schema, so a collision
                    # would abort the whole transaction; report it per-row
                    # instead of failing the entire import.
                    skipped.append({"row": row.row_number, "message": f"SKU already exists: {sku}"})
                    continue
                taken_skus.add(sku)

                variant = await ProductVariant.create(
                    product_id=product_id, sku=sku, title=row.variant_title,
                    price=row.price, compare_at_price=row.compare_at_price,
                )
                created_variants += 1

                if branch_id is not None and row.quantity is not None:
                    await InventoryItem.update_or_create(
                        defaults={"quantity_available": row.quantity},
                        branch_id=branch_id, variant_id=variant.id,
                    )
                    stocked += 1

        return {
            "created_products": created_products,
            "created_variants": created_variants,
            "stocked_variants": stocked,
            "skipped": skipped,
        }

"""Per-branch stock levels."""

from __future__ import annotations

from app.models.commerce import InventoryItem, ProductVariant, ShopBranch
from app.services.base_service import BaseService


class InventoryService(BaseService[InventoryItem]):
    model = InventoryItem

    async def set_inventory(self, branch_id: int, variant_id: int,
                            quantity_available: int,
                            quantity_reserved: int = 0) -> InventoryItem:
        branch = await ShopBranch.get_or_none(id=branch_id)
        variant = await ProductVariant.get_or_none(id=variant_id).prefetch_related("product")
        if branch is None:
            raise KeyError("Branch not found")
        if variant is None:
            raise KeyError("Product variant not found")
        if branch.business_id != variant.product.business_id:
            raise ValueError("Inventory variant belongs to a different business")
        item, _ = await InventoryItem.update_or_create(
            defaults={
                "quantity_available": quantity_available,
                "quantity_reserved": quantity_reserved,
            },
            branch_id=branch_id, variant_id=variant_id,
        )
        return item

    async def list_branch_inventory(self, branch_id: int) -> list[dict]:
        if not await ShopBranch.filter(id=branch_id).exists():
            raise KeyError("Branch not found")
        return await self.values(
            "id", "variant_id", "quantity_available", "quantity_reserved", "updated_at",
            "variant__sku", "variant__title", "variant__product_id",
            "variant__product__name",
            branch_id=branch_id,
        )

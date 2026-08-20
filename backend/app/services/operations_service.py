"""Orders, dashboard reporting, staff, and payroll operations."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import uuid4

from tortoise.transactions import in_transaction

from app.models.commerce import (
    Business,
    InventoryItem,
    Order,
    OrderItem,
    PayrollRun,
    ProductVariant,
    ShopBranch,
    StaffMember,
)
from app.services.base_service import BaseService


class OperationsService(BaseService[Order]):
    model = Order
    tax_rate = Decimal("0.10")

    async def create_order(self, business_id: int, branch_id: int, order_type: str,
                           lines: list[dict]) -> dict:
        business = await Business.get_or_none(id=business_id)
        if business is None:
            raise KeyError("Business not found")
        branch = await ShopBranch.get_or_none(id=branch_id, business_id=business_id, active=True)
        if branch is None:
            raise KeyError("Branch not found")

        quantities: dict[int, int] = defaultdict(int)
        for line in lines:
            quantities[line["variant_id"]] += line["quantity"]
        variants = await ProductVariant.filter(
            id__in=list(quantities), product__business_id=business_id, active=True,
        ).prefetch_related("product")
        by_id = {variant.id: variant for variant in variants}
        if len(by_id) != len(quantities):
            raise ValueError("One or more products are unavailable")

        item_data = []
        subtotal = Decimal("0")
        for variant_id, quantity in quantities.items():
            variant = by_id[variant_id]
            inventory = await InventoryItem.get_or_none(branch_id=branch_id, variant_id=variant_id)
            if inventory is not None and inventory.quantity_available < quantity:
                raise ValueError(f"Not enough stock for {variant.product.name}")
            unit_price = Decimal(variant.price)
            line_total = unit_price * quantity
            subtotal += line_total
            item_data.append((variant, quantity, unit_price, line_total))

        tax = (subtotal * self.tax_rate).quantize(Decimal("0.01"))
        total = subtotal + tax
        async with in_transaction():
            order = await Order.create(
                business_id=business_id,
                branch_id=branch_id,
                order_number=f"ORD-{uuid4().hex[:10].upper()}",
                order_type=order_type,
                subtotal=subtotal,
                tax=tax,
                total=total,
            )
            for variant, quantity, unit_price, line_total in item_data:
                await OrderItem.create(
                    order_id=order.id,
                    variant_id=variant.id,
                    product_name=variant.product.name,
                    variant_title=variant.title,
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                )
                inventory = await InventoryItem.get_or_none(
                    branch_id=branch_id, variant_id=variant.id,
                )
                if inventory is not None:
                    inventory.quantity_available -= quantity
                    await inventory.save()
        return await self.order_detail(order.id)

    async def order_detail(self, order_id: int) -> dict:
        order = await Order.get_or_none(id=order_id).prefetch_related("items")
        if order is None:
            raise KeyError("Order not found")
        return {
            "id": order.id,
            "order_number": order.order_number,
            "order_type": order.order_type,
            "status": order.status,
            "subtotal": float(order.subtotal),
            "tax": float(order.tax),
            "total": float(order.total),
            "created_at": order.created_at.isoformat(),
            "items": [
                {"product_name": item.product_name, "variant_title": item.variant_title,
                 "quantity": item.quantity, "unit_price": float(item.unit_price),
                 "line_total": float(item.line_total)}
                for item in order.items
            ],
        }

    async def dashboard(self, business_id: int) -> dict:
        if not await Business.filter(id=business_id).exists():
            raise KeyError("Business not found")
        now = datetime.now(timezone.utc)
        start = (now - timedelta(days=6)).date()
        orders = await Order.filter(business_id=business_id, created_at__gte=datetime.combine(
            start, datetime.min.time(), tzinfo=timezone.utc,
        )).prefetch_related("items")
        daily: dict[date, dict[str, float | int]] = {
            start + timedelta(days=i): {"total_sales": 0.0, "order_count": 0}
            for i in range(7)
        }
        for order in orders:
            day = order.created_at.date()
            if day in daily:
                daily[day]["total_sales"] += float(order.total)
                daily[day]["order_count"] += 1
        recent = sorted(orders, key=lambda order: order.created_at, reverse=True)[:10]
        top: dict[str, dict[str, float | int | str]] = {}
        for order in orders:
            for item in order.items:
                entry = top.setdefault(item.product_name, {"name": item.product_name, "units_sold": 0, "sales": 0.0})
                entry["units_sold"] += item.quantity
                entry["sales"] += float(item.line_total)
        low_stock = await InventoryItem.filter(
            branch__business_id=business_id, quantity_available__lte=10,
        ).values("variant__product__name", "variant__title", "quantity_available")
        return {
            "daily_sales": [
                {"date": day.strftime("%a"), "total_sales": values["total_sales"],
                 "order_count": values["order_count"]}
                for day, values in daily.items()
            ],
            "recent_orders": [
                {"id": order.id, "label": order.order_number, "type": order.order_type,
                 "items": [item.product_name for item in order.items],
                 "total": float(order.total), "status": order.status,
                 "placed_minutes_ago": max(0, int((now - order.created_at).total_seconds() // 60))}
                for order in recent
            ],
            "top_sellers": sorted(top.values(), key=lambda item: item["units_sold"], reverse=True)[:5],
            "low_stock": low_stock,
        }

    async def list_staff(self, business_id: int) -> list[dict]:
        if not await Business.filter(id=business_id).exists():
            raise KeyError("Business not found")
        return await StaffMember.filter(business_id=business_id, active=True).order_by("id").values(
            "id", "name", "role", "hourly_rate", "hours_this_week", "clocked_in", "active",
        )

    async def create_staff(self, business_id: int, **values) -> StaffMember:
        if not await Business.filter(id=business_id).exists():
            raise KeyError("Business not found")
        values["name"] = values["name"].strip()
        return await StaffMember.create(business_id=business_id, **values)

    async def update_staff(self, staff_id: int, **values) -> StaffMember:
        staff = await StaffMember.get_or_none(id=staff_id)
        if staff is None:
            raise KeyError("Staff member not found")
        if values.get("name") is not None:
            values["name"] = values["name"].strip()
        for field, value in values.items():
            if value is not None:
                setattr(staff, field, value)
        await staff.save()
        return staff

    async def run_payroll(self, business_id: int, period_start: date, period_end: date) -> dict:
        staff = await StaffMember.filter(business_id=business_id, active=True)
        total = sum((member.hourly_rate * member.hours_this_week for member in staff), Decimal("0"))
        run = await PayrollRun.create(
            business_id=business_id, period_start=period_start, period_end=period_end,
            total=total, status="paid",
        )
        return {"id": run.id, "total": float(total), "status": run.status,
                "period_start": period_start.isoformat(), "period_end": period_end.isoformat()}

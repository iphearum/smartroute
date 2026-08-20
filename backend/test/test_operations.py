from datetime import date
from decimal import Decimal

from app.models.commerce import InventoryItem
from app.models.map import MapRecord
from app.models.place import Place
from app.services.business_service import BusinessService
from app.services.inventory_service import InventoryService
from app.services.operations_service import OperationsService
from app.services.product_service import ProductService
from app.services.map_service import MapService


def _run(scenario):
    import asyncio

    asyncio.run(scenario())


def test_pos_order_decrements_inventory_and_feeds_dashboard(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            map_record = await MapRecord.create(
                country_slug="cambodia", province_slug="phnom_penh", display_name="Phnom Penh",
            )
            place = await Place.create(
                map_id=map_record.id, name="Test Market", latitude=11.58, longitude=104.89,
            )
            business = await BusinessService().create_business(display_name="POS Shop")
            branch = await BusinessService().create_shop_branch(business.id, place.id)
            product = await ProductService().create_product(business.id, name="Coffee", status="active")
            variant = await ProductService().create_product_variant(product.id, sku="COFFEE", price=Decimal("2.00"))
            await InventoryService().set_inventory(branch.id, variant.id, quantity_available=10)

            order = await OperationsService().create_order(
                business.id, branch.id, "takeaway", [{"variant_id": variant.id, "quantity": 2}],
            )
            assert order["total"] == 4.40
            inventory = await InventoryItem.get(branch_id=branch.id, variant_id=variant.id)
            assert inventory.quantity_available == 8
            dashboard = await OperationsService().dashboard(business.id)
            assert dashboard["recent_orders"][0]["label"] == order["order_number"]
            assert dashboard["top_sellers"][0]["units_sold"] == 2
        finally:
            await store.close()

    _run(scenario)


def test_staff_and_payroll_are_persisted(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            business = await BusinessService().create_business(display_name="Payroll Shop")
            operations = OperationsService()
            staff = await operations.create_staff(
                business.id, name="Dara", role="Cook", hourly_rate=Decimal("2.50"),
                hours_this_week=Decimal("38"), clocked_in=True,
            )
            assert staff.name == "Dara"
            rows = await operations.list_staff(business.id)
            assert rows[0]["hours_this_week"] == Decimal("38")
            run = await operations.run_payroll(business.id, date(2026, 8, 14), date(2026, 8, 20))
            assert run["total"] == 95.0
        finally:
            await store.close()

    _run(scenario)

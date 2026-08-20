import asyncio
from datetime import date
from decimal import Decimal

from services.map_models import MapRecord, Place
from app.services.business_service import BusinessService
from app.models.exchange_rate import ExchangeRate
from app.services.exchange_rate_service import ExchangeRateService
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService
from app.services.map_service import MapService
from app.clients.nbc_exchange import NbcRate
from app.support.product_import import ImportRow


def _run(scenario):
    asyncio.run(scenario())


def test_business_update_only_changes_provided_fields(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            business = await BusinessService().create_business(
                display_name="Boeung Kak Noodle House", business_type="restaurant",
            )
            updated = await BusinessService().update_business(business.id, description="Best kuy teav in town")
            assert updated.display_name == "Boeung Kak Noodle House"
            assert updated.description == "Best kuy teav in town"

            renamed = await BusinessService().update_business(business.id, display_name="  Renamed Shop  ")
            assert renamed.display_name == "Renamed Shop"
            assert renamed.description == "Best kuy teav in town"
        finally:
            await store.close()

    _run(scenario)


def test_product_and_variant_lifecycle(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            business = await BusinessService().create_business(display_name="Test Shop")
            product = await ProductService().create_product(business.id, name="Kuy Teav")

            variant = await ProductService().create_product_variant(
                product.id, sku="kt-pork", price=3.5,
            )
            assert variant.sku == "KT-PORK"

            products = await ProductService().list_products(business.id)
            assert products[0]["variants"][0]["sku"] == "KT-PORK"

            updated_product = await ProductService().update_product(product.id, status="active")
            assert updated_product.status == "active"
            assert updated_product.name == "Kuy Teav"

            updated_variant = await ProductService().update_product_variant(variant.id, price=4.25)
            assert float(updated_variant.price) == 4.25

            try:
                await ProductService().update_product_variant(
                    variant.id, compare_at_price=1.0,
                )
                raised = False
            except ValueError:
                raised = True
            assert raised, "lowering compare_at_price below price must be rejected"
        finally:
            await store.close()

    _run(scenario)


def test_branch_inventory_round_trip(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            map_record = await MapRecord.create(
                country_slug="cambodia", province_slug="phnom_penh", display_name="Phnom Penh",
            )
            place = await Place.create(
                map_id=map_record.id, name="Boeung Kak Market", latitude=11.58, longitude=104.89,
            )
            business = await BusinessService().create_business(display_name="Test Shop")
            branch = await BusinessService().create_shop_branch(business.id, place.id)
            product = await ProductService().create_product(business.id, name="Kuy Teav")
            variant = await ProductService().create_product_variant(product.id, sku="kt-pork", price=3.5)

            assert await InventoryService().list_branch_inventory(branch.id) == []

            await InventoryService().set_inventory(branch.id, variant.id, quantity_available=20)
            inventory = await InventoryService().list_branch_inventory(branch.id)
            assert len(inventory) == 1
            assert inventory[0]["quantity_available"] == 20
            assert inventory[0]["variant__sku"] == "KT-PORK"
            assert inventory[0]["variant__product__name"] == "Kuy Teav"

            await InventoryService().set_inventory(branch.id, variant.id, quantity_available=5)
            inventory = await InventoryService().list_branch_inventory(branch.id)
            assert len(inventory) == 1
            assert inventory[0]["quantity_available"] == 5
        finally:
            await store.close()

    _run(scenario)


def test_list_branch_inventory_rejects_unknown_branch(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            try:
                await InventoryService().list_branch_inventory(999)
                raised = False
            except KeyError:
                raised = True
            assert raised
        finally:
            await store.close()

    _run(scenario)


def test_upsert_exchange_rates_updates_same_day_in_place(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            today = date(2026, 8, 19)
            first = [NbcRate("USD", Decimal("4095"), Decimal("4105"), Decimal("4100"))]
            saved = await ExchangeRateService().upsert_exchange_rates(first, effective_date=today)
            assert saved.data["USD"]["average_rate"] == "4100"

            revised = [NbcRate("USD", Decimal("4090"), Decimal("4110"), Decimal("4100"))]
            await ExchangeRateService().upsert_exchange_rates(revised, effective_date=today)

            latest = await ExchangeRateService().latest_exchange_rates()
            assert len(latest) == 1, "same-day refetch must update, not duplicate"
            assert latest[0]["buy_rate"] == Decimal("4090.0000")
        finally:
            await store.close()

    _run(scenario)


def test_latest_exchange_rates_only_returns_most_recent_date(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            await ExchangeRateService().upsert_exchange_rates(
                [NbcRate("USD", Decimal("4000"), Decimal("4010"), Decimal("4005"))],
                effective_date=date(2026, 8, 18),
            )
            await ExchangeRateService().upsert_exchange_rates(
                [
                    NbcRate("USD", Decimal("4095"), Decimal("4105"), Decimal("4100")),
                    NbcRate("THB", Decimal("112"), Decimal("114"), Decimal("113")),
                ],
                effective_date=date(2026, 8, 19),
            )

            latest = await ExchangeRateService().latest_exchange_rates()
            assert {row["currency"] for row in latest} == {"USD", "THB"}
            assert all(row["effective_date"] == date(2026, 8, 19) for row in latest)
            assert await ExchangeRate.all().count() == 2, "one row per day, not per currency"
        finally:
            await store.close()

    _run(scenario)


def test_latest_exchange_rates_empty_before_any_fetch(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            assert await ExchangeRateService().latest_exchange_rates() == []
        finally:
            await store.close()

    _run(scenario)


def test_import_products_creates_products_and_variants(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            business = await BusinessService().create_business(display_name="Import Shop")
            rows = [
                ImportRow(row_number=2, name="Kuy Teav", price=Decimal("3.50"), category="food"),
                ImportRow(row_number=3, name="Iced Coffee", price=Decimal("1.50"), sku="IC-01"),
            ]
            result = await ProductService().import_products(business.id, rows)
            assert result["created_products"] == 2
            assert result["created_variants"] == 2
            assert result["skipped"] == []

            products = await ProductService().list_products(business.id)
            assert {p["name"] for p in products} == {"Kuy Teav", "Iced Coffee"}
            coffee = next(p for p in products if p["name"] == "Iced Coffee")
            assert coffee["variants"][0]["sku"] == "IC-01"
        finally:
            await store.close()

    _run(scenario)


def test_import_products_attaches_variant_to_existing_product(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            business = await BusinessService().create_business(display_name="Import Shop")
            await ProductService().import_products(business.id, [
                ImportRow(row_number=2, name="Kuy Teav", price=Decimal("3.50"), sku="KT-S"),
            ])
            result = await ProductService().import_products(business.id, [
                ImportRow(row_number=2, name="kuy teav", price=Decimal("4.50"), sku="KT-L",
                          variant_title="Large"),
            ])
            assert result["created_products"] == 0, "existing product must be reused"
            assert result["created_variants"] == 1

            products = await ProductService().list_products(business.id)
            assert len(products) == 1
            assert {v["sku"] for v in products[0]["variants"]} == {"KT-S", "KT-L"}
        finally:
            await store.close()

    _run(scenario)


def test_import_products_reports_sku_collision_without_aborting(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            business = await BusinessService().create_business(display_name="Import Shop")
            await ProductService().import_products(business.id, [
                ImportRow(row_number=2, name="Existing", price=Decimal("1.00"), sku="TAKEN"),
            ])
            result = await ProductService().import_products(business.id, [
                ImportRow(row_number=2, name="Clashing", price=Decimal("2.00"), sku="TAKEN"),
                ImportRow(row_number=3, name="Fine", price=Decimal("3.00"), sku="FRESH"),
            ])
            assert result["created_variants"] == 1
            assert len(result["skipped"]) == 1
            assert "TAKEN" in result["skipped"][0]["message"]
        finally:
            await store.close()

    _run(scenario)


def test_import_products_sets_branch_inventory_from_quantity(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            map_record = await MapRecord.create(
                country_slug="cambodia", province_slug="phnom_penh", display_name="Phnom Penh",
            )
            place = await Place.create(
                map_id=map_record.id, name="Market", latitude=11.58, longitude=104.89,
            )
            business = await BusinessService().create_business(display_name="Import Shop")
            branch = await BusinessService().create_shop_branch(business.id, place.id)

            result = await ProductService().import_products(business.id, [
                ImportRow(row_number=2, name="Kuy Teav", price=Decimal("3.50"), quantity=25),
                ImportRow(row_number=3, name="No Stock Column", price=Decimal("1.00")),
            ], branch_id=branch.id)
            assert result["stocked_variants"] == 1

            inventory = await InventoryService().list_branch_inventory(branch.id)
            assert len(inventory) == 1
            assert inventory[0]["quantity_available"] == 25
        finally:
            await store.close()

    _run(scenario)


def test_import_products_rejects_branch_from_another_business(tmp_path):
    async def scenario():
        store = MapService(tmp_path / "maps")
        try:
            await store.initialize(generate_schemas=True)
            map_record = await MapRecord.create(
                country_slug="cambodia", province_slug="phnom_penh", display_name="Phnom Penh",
            )
            place = await Place.create(
                map_id=map_record.id, name="Market", latitude=11.58, longitude=104.89,
            )
            owner = await BusinessService().create_business(display_name="Owner Shop")
            other = await BusinessService().create_business(display_name="Other Shop")
            branch = await BusinessService().create_shop_branch(owner.id, place.id)

            try:
                await ProductService().import_products(other.id, [
                    ImportRow(row_number=2, name="X", price=Decimal("1.00"), quantity=5),
                ], branch_id=branch.id)
                raised = False
            except ValueError:
                raised = True
            assert raised, "importing into another business's branch must be rejected"
        finally:
            await store.close()

    _run(scenario)

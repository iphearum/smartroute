"""Merchant identity, branches, storefronts, catalog, and inventory."""

from __future__ import annotations

from tortoise import fields, models


class Business(models.Model):
    """Merchant identity that may operate multiple physical or online shops."""

    id = fields.BigIntField(pk=True)
    owner_user_id = fields.CharField(max_length=100, null=True)
    legal_name = fields.CharField(max_length=255, null=True)
    display_name = fields.CharField(max_length=255)
    business_type = fields.CharField(max_length=80, default="shop")
    description = fields.TextField(null=True)
    logo_url = fields.TextField(null=True)
    status = fields.CharField(max_length=32, default="draft")
    verification_status = fields.CharField(max_length=32, default="unverified")
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "businesses"
        indexes = (("status", "business_type"), ("owner_user_id",))


class ShopBranch(models.Model):
    """A business operating at an existing or manually-created place."""

    id = fields.BigIntField(pk=True)
    business = fields.ForeignKeyField(
        "models.Business", related_name="branches", source_field="business_id",
        on_delete=fields.CASCADE,
    )
    place = fields.ForeignKeyField(
        "models.Place", related_name="shop_branches", source_field="place_id",
        on_delete=fields.RESTRICT,
    )
    name = fields.CharField(max_length=255, null=True)
    phone = fields.CharField(max_length=80, null=True)
    email = fields.CharField(max_length=255, null=True)
    opening_hours = fields.JSONField(default=dict, source_field="opening_hours_json")
    pickup_enabled = fields.BooleanField(default=False)
    delivery_enabled = fields.BooleanField(default=False)
    active = fields.BooleanField(default=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "shop_branches"
        unique_together = (("business_id", "place_id"),)
        indexes = (("place_id", "active"), ("business_id", "active"))


class BranchSchedule(models.Model):
    """A dated operational override such as a holiday or emergency closure."""

    id = fields.BigIntField(pk=True)
    branch = fields.ForeignKeyField(
        "models.ShopBranch", related_name="schedules", source_field="branch_id",
        on_delete=fields.CASCADE,
    )
    kind = fields.CharField(max_length=32, default="closure")
    title = fields.CharField(max_length=255)
    starts_at = fields.DatetimeField()
    ends_at = fields.DatetimeField()
    all_day = fields.BooleanField(default=True)
    is_closed = fields.BooleanField(default=True)
    notes = fields.TextField(null=True)
    active = fields.BooleanField(default=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "branch_schedules"
        indexes = (("branch_id", "active", "starts_at", "ends_at"),)


class Storefront(models.Model):
    id = fields.BigIntField(pk=True)
    business = fields.ForeignKeyField(
        "models.Business", related_name="storefronts", source_field="business_id",
        on_delete=fields.CASCADE,
    )
    slug = fields.CharField(max_length=120, unique=True)
    title = fields.CharField(max_length=255)
    description = fields.TextField(null=True)
    currency = fields.CharField(max_length=3, default="USD")
    theme = fields.JSONField(default=dict, source_field="theme_json")
    published = fields.BooleanField(default=False)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "storefronts"
        indexes = (("business_id", "published"),)


class Product(models.Model):
    id = fields.BigIntField(pk=True)
    business = fields.ForeignKeyField(
        "models.Business", related_name="products", source_field="business_id",
        on_delete=fields.CASCADE,
    )
    name = fields.CharField(max_length=255)
    description = fields.TextField(null=True)
    category = fields.CharField(max_length=120, null=True)
    status = fields.CharField(max_length=32, default="draft")
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "products"
        indexes = (("business_id", "status"), ("business_id", "category"))


class ProductVariant(models.Model):
    id = fields.BigIntField(pk=True)
    product = fields.ForeignKeyField(
        "models.Product", related_name="variants", source_field="product_id",
        on_delete=fields.CASCADE,
    )
    sku = fields.CharField(max_length=120, unique=True)
    title = fields.CharField(max_length=255, null=True)
    price = fields.DecimalField(max_digits=14, decimal_places=2)
    compare_at_price = fields.DecimalField(max_digits=14, decimal_places=2, null=True)
    attributes = fields.JSONField(default=dict, source_field="attributes_json")
    weight_grams = fields.IntField(null=True)
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "product_variants"
        indexes = (("product_id", "active"),)


class InventoryItem(models.Model):
    id = fields.BigIntField(pk=True)
    branch = fields.ForeignKeyField(
        "models.ShopBranch", related_name="inventory", source_field="branch_id",
        on_delete=fields.CASCADE,
    )
    variant = fields.ForeignKeyField(
        "models.ProductVariant", related_name="inventory", source_field="variant_id",
        on_delete=fields.CASCADE,
    )
    quantity_available = fields.IntField(default=0)
    quantity_reserved = fields.IntField(default=0)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "inventory_items"
        unique_together = (("branch_id", "variant_id"),)
        indexes = (("branch_id",), ("variant_id",))


class Order(models.Model):
    """A merchant order created by the POS or a future customer channel."""

    id = fields.BigIntField(pk=True)
    business = fields.ForeignKeyField(
        "models.Business", related_name="orders", source_field="business_id",
        on_delete=fields.CASCADE,
    )
    branch = fields.ForeignKeyField(
        "models.ShopBranch", related_name="orders", source_field="branch_id",
        on_delete=fields.CASCADE,
    )
    order_number = fields.CharField(max_length=40, unique=True)
    order_type = fields.CharField(max_length=32, default="dine_in")
    status = fields.CharField(max_length=32, default="preparing")
    subtotal = fields.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax = fields.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = fields.DecimalField(max_digits=14, decimal_places=2, default=0)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "commerce_orders"
        indexes = (("business_id", "created_at"), ("branch_id", "status"))


class OrderItem(models.Model):
    id = fields.BigIntField(pk=True)
    order = fields.ForeignKeyField(
        "models.Order", related_name="items", source_field="order_id",
        on_delete=fields.CASCADE,
    )
    variant = fields.ForeignKeyField(
        "models.ProductVariant", related_name="order_items", source_field="variant_id",
        on_delete=fields.RESTRICT,
    )
    product_name = fields.CharField(max_length=255)
    variant_title = fields.CharField(max_length=255, null=True)
    quantity = fields.IntField()
    unit_price = fields.DecimalField(max_digits=14, decimal_places=2)
    line_total = fields.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        table = "commerce_order_items"
        indexes = (("order_id",), ("variant_id",))


class StaffMember(models.Model):
    """A staff record used by the merchant payroll workspace."""

    id = fields.BigIntField(pk=True)
    business = fields.ForeignKeyField(
        "models.Business", related_name="staff", source_field="business_id",
        on_delete=fields.CASCADE,
    )
    name = fields.CharField(max_length=255)
    role = fields.CharField(max_length=120, default="Staff")
    hourly_rate = fields.DecimalField(max_digits=14, decimal_places=2, default=0)
    hours_this_week = fields.DecimalField(max_digits=8, decimal_places=2, default=0)
    clocked_in = fields.BooleanField(default=False)
    active = fields.BooleanField(default=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "staff_members"
        indexes = (("business_id", "active"),)


class PayrollRun(models.Model):
    """An auditable payroll action for a business."""

    id = fields.BigIntField(pk=True)
    business = fields.ForeignKeyField(
        "models.Business", related_name="payroll_runs", source_field="business_id",
        on_delete=fields.CASCADE,
    )
    period_start = fields.DateField()
    period_end = fields.DateField()
    total = fields.DecimalField(max_digits=14, decimal_places=2)
    status = fields.CharField(max_length=32, default="paid")
    paid_at = fields.DatetimeField(auto_now_add=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")

    class Meta:
        table = "payroll_runs"
        indexes = (("business_id", "paid_at"),)

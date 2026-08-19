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

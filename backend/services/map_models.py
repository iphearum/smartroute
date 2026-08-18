"""Tortoise ORM models for regional maps and incremental map changes."""

from __future__ import annotations

from tortoise import fields, models


def default_travel_modes():
    return ["car", "motorbike", "bike", "walk"]


class MapRecord(models.Model):
    id = fields.IntField(pk=True)
    country_slug = fields.CharField(max_length=100)
    province_slug = fields.CharField(max_length=100)
    display_name = fields.CharField(max_length=120)
    graph_path = fields.TextField(null=True)
    version = fields.CharField(max_length=40, default="1.0.0")
    status = fields.CharField(max_length=30, default="active")
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "maps"
        unique_together = (("country_slug", "province_slug"),)


class MapRevision(models.Model):
    id = fields.IntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="updates", source_field="map_id",
                                 on_delete=fields.CASCADE)
    version = fields.CharField(max_length=40)
    change_type = fields.CharField(max_length=50)
    summary = fields.CharField(max_length=500)
    graph_path = fields.TextField(null=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "map_updates"
        indexes = (("map_id", "created_at"),)


class MapImage(models.Model):
    id = fields.IntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="images", source_field="map_id",
                                 on_delete=fields.CASCADE)
    filename = fields.CharField(max_length=255)
    content_type = fields.CharField(max_length=120)
    image_data = fields.BinaryField()
    byte_size = fields.IntField()
    caption = fields.TextField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "map_images"
        indexes = (("map_id", "created_at"),)


class Place(models.Model):
    id = fields.IntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="places", source_field="map_id",
                                 on_delete=fields.CASCADE)
    osm_feature = fields.ForeignKeyField(
        "models.OsmFeature", related_name="places", source_field="osm_feature_id",
        null=True, on_delete=fields.SET_NULL,
    )
    source = fields.CharField(max_length=24, default="manual")
    name = fields.CharField(max_length=160)
    name_base = fields.CharField(max_length=255, null=True)
    address_base = fields.TextField(null=True)
    base_language = fields.CharField(max_length=12, null=True)
    latitude = fields.FloatField()
    longitude = fields.FloatField()
    category = fields.CharField(max_length=100, null=True)
    address = fields.TextField(null=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "map_places"
        indexes = (("map_id", "active", "name"), ("map_id", "active", "category"))


class OsmFeature(models.Model):
    """Searchable OSM feature; Postgres migrations also materialize PostGIS geometry."""

    id = fields.BigIntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="osm_features",
                                 source_field="map_id", on_delete=fields.CASCADE)
    osm_type = fields.CharField(max_length=16)
    osm_id = fields.BigIntField()
    feature_type = fields.CharField(max_length=32)
    name = fields.CharField(max_length=255, null=True)
    name_base = fields.CharField(max_length=255, null=True)
    base_language = fields.CharField(max_length=12, null=True)
    translated = fields.BooleanField(default=False)
    category = fields.CharField(max_length=120, null=True)
    geometry = fields.JSONField(source_field="geometry_json")
    centroid_latitude = fields.FloatField(null=True)
    centroid_longitude = fields.FloatField(null=True)
    bbox_min_latitude = fields.FloatField(null=True)
    bbox_min_longitude = fields.FloatField(null=True)
    bbox_max_latitude = fields.FloatField(null=True)
    bbox_max_longitude = fields.FloatField(null=True)
    tags = fields.JSONField(default=dict, source_field="tags_json")
    active = fields.BooleanField(default=True)
    source_updated_at = fields.DatetimeField(null=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "osm_features"
        unique_together = (("map_id", "osm_type", "osm_id", "feature_type"),)
        indexes = (
            ("map_id", "feature_type", "active"),
            ("map_id", "feature_type", "category"),
            ("map_id", "name"),
            ("centroid_latitude", "centroid_longitude"),
            ("feature_type", "bbox_min_latitude", "bbox_max_latitude"),
            ("feature_type", "bbox_min_longitude", "bbox_max_longitude"),
        )


class ThreeDAsset(models.Model):
    """Georeferenced GLB/GLTF landmark rendered above the generic map scene."""

    id = fields.BigIntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="three_d_assets",
                                 source_field="map_id", on_delete=fields.CASCADE)
    place = fields.ForeignKeyField(
        "models.Place", related_name="three_d_assets", source_field="place_id",
        null=True, on_delete=fields.SET_NULL,
    )
    name = fields.CharField(max_length=255)
    model_url = fields.TextField()
    latitude = fields.FloatField()
    longitude = fields.FloatField()
    altitude = fields.FloatField(default=0)
    rotation_x = fields.FloatField(default=90)
    rotation_y = fields.FloatField(default=0)
    rotation_z = fields.FloatField(default=0)
    scale = fields.FloatField(default=1)
    active = fields.BooleanField(default=True)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "three_d_assets"
        indexes = (("map_id", "active"), ("latitude", "longitude"))


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


class PlaceMedia(models.Model):
    id = fields.BigIntField(pk=True)
    place = fields.ForeignKeyField(
        "models.Place", related_name="media", source_field="place_id", on_delete=fields.CASCADE,
    )
    media_type = fields.CharField(max_length=32, default="image")
    url = fields.TextField()
    thumbnail_url = fields.TextField(null=True)
    caption = fields.TextField(null=True)
    sort_order = fields.IntField(default=0)
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "place_media"
        indexes = (("place_id", "sort_order"),)


class CustomRoute(models.Model):
    id = fields.IntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="custom_routes", source_field="map_id",
                                 on_delete=fields.CASCADE)
    name = fields.CharField(max_length=160)
    coordinates = fields.JSONField(source_field="coordinates_json")
    bidirectional = fields.BooleanField(default=True)
    modes = fields.JSONField(default=default_travel_modes, source_field="modes_json")
    metadata = fields.JSONField(default=dict, source_field="metadata_json")
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "map_custom_routes"
        indexes = (("map_id", "active"),)


class RoadClosure(models.Model):
    id = fields.IntField(pk=True)
    map = fields.ForeignKeyField("models.MapRecord", related_name="closures", source_field="map_id",
                                 on_delete=fields.CASCADE)
    source_node = fields.JSONField(source_field="source_node_json")
    target_node = fields.JSONField(source_field="target_node_json")
    edge_key = fields.JSONField(null=True, source_field="edge_key_json")
    reason = fields.TextField(null=True)
    starts_at = fields.DatetimeField(null=True)
    ends_at = fields.DatetimeField(null=True)
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)

    class Meta:
        table = "map_closures"
        indexes = (("map_id", "active"), ("map_id", "active", "starts_at", "ends_at"))

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
    name = fields.CharField(max_length=160)
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

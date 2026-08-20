"""Places, OSM features, media, 3D assets, and POI theming."""

from __future__ import annotations

from tortoise import fields, models


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
    status = fields.CharField(max_length=32, default="active")
    moved_to_place = fields.ForeignKeyField(
        "models.Place", related_name="moved_from_places", source_field="moved_to_place_id",
        null=True, on_delete=fields.SET_NULL,
    )
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "map_places"
        indexes = (
            ("map_id", "active", "name"),
            ("map_id", "active", "category"),
            ("latitude", "longitude"),
        )


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


class PoiTheme(models.Model):
    """Icon/color/priority + matching rules for a POI category, editable without a redeploy."""

    id = fields.BigIntField(pk=True)
    key = fields.CharField(max_length=40, unique=True)
    label = fields.CharField(max_length=60)
    icon_svg = fields.TextField()
    color = fields.CharField(max_length=16)
    soft_color = fields.CharField(max_length=16)
    priority = fields.IntField()
    match_order = fields.IntField()
    keywords = fields.JSONField(default=list, source_field="keywords_json")
    group = fields.CharField(max_length=40, default="other", db_default="other")
    active = fields.BooleanField(default=True)
    created_at = fields.DatetimeField(auto_now_add=True)
    updated_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "poi_themes"
        indexes = (("active", "match_order"),)

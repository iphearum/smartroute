from json import dumps, loads
import functools

from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.indexes import Index
from tortoise.migrations import operations as ops


async def add_postgis_columns(apps, schema_editor):
    """Add production spatial indexes without breaking SQLite/MySQL development."""
    client = schema_editor.client
    if client.capabilities.dialect != "postgres":
        return
    available = await client.execute_query_dict(
        "SELECT 1 FROM pg_available_extensions WHERE name = 'postgis' LIMIT 1"
    )
    if not available:
        await client.execute_script(
            "CREATE INDEX IF NOT EXISTS osm_features_tags_gin "
            "ON osm_features USING GIN (tags_json);"
        )
        return
    await client.execute_script(
        """
        CREATE EXTENSION IF NOT EXISTS postgis;

        ALTER TABLE osm_features
        ADD COLUMN IF NOT EXISTS geometry geometry(Geometry, 4326)
        GENERATED ALWAYS AS (
            ST_SetSRID(ST_GeomFromGeoJSON(geometry_json::text), 4326)
        ) STORED;

        CREATE INDEX IF NOT EXISTS osm_features_geometry_gix
        ON osm_features USING GIST (geometry);

        CREATE INDEX IF NOT EXISTS osm_features_tags_gin
        ON osm_features USING GIN (tags_json);
        """
    )


class Migration(migrations.Migration):
    dependencies = [("models", "0001_initial")]

    operations = [
        ops.CreateModel(
            name="OsmFeature",
            fields=[
                ("id", fields.BigIntField(generated=True, primary_key=True, unique=True,
                                           db_index=True)),
                ("map", fields.ForeignKeyField(
                    "models.MapRecord", source_field="map_id", db_constraint=True,
                    to_field="id", related_name="osm_features", on_delete=OnDelete.CASCADE,
                )),
                ("osm_type", fields.CharField(max_length=16)),
                ("osm_id", fields.BigIntField()),
                ("feature_type", fields.CharField(max_length=32)),
                ("name", fields.CharField(max_length=255, null=True)),
                ("name_base", fields.CharField(max_length=255, null=True)),
                ("base_language", fields.CharField(max_length=12, null=True)),
                ("translated", fields.BooleanField(default=False)),
                ("category", fields.CharField(max_length=120, null=True)),
                ("geometry", fields.JSONField(
                    source_field="geometry_json", encoder=functools.partial(
                        dumps, separators=(",", ":")), decoder=loads,
                )),
                ("centroid_latitude", fields.FloatField(null=True)),
                ("centroid_longitude", fields.FloatField(null=True)),
                ("bbox_min_latitude", fields.FloatField(null=True)),
                ("bbox_min_longitude", fields.FloatField(null=True)),
                ("bbox_max_latitude", fields.FloatField(null=True)),
                ("bbox_max_longitude", fields.FloatField(null=True)),
                ("tags", fields.JSONField(
                    source_field="tags_json", default=dict, encoder=functools.partial(
                        dumps, separators=(",", ":")), decoder=loads,
                )),
                ("active", fields.BooleanField(default=True)),
                ("source_updated_at", fields.DatetimeField(null=True, auto_now=False,
                                                             auto_now_add=False)),
                ("created_at", fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={
                "table": "osm_features",
                "app": "models",
                "unique_together": (("map_id", "osm_type", "osm_id", "feature_type"),),
                "indexes": [
                    Index(fields=["map_id", "feature_type", "active"]),
                    Index(fields=["map_id", "feature_type", "category"]),
                    Index(fields=["map_id", "name"]),
                    Index(fields=["centroid_latitude", "centroid_longitude"]),
                    Index(fields=["feature_type", "bbox_min_latitude", "bbox_max_latitude"]),
                    Index(fields=["feature_type", "bbox_min_longitude", "bbox_max_longitude"]),
                ],
                "pk_attr": "id",
            },
            bases=["Model"],
        ),
        ops.AddField("Place", "name_base", fields.CharField(max_length=255, null=True)),
        ops.AddField("Place", "address_base", fields.TextField(null=True)),
        ops.AddField("Place", "base_language", fields.CharField(max_length=12, null=True)),
        ops.RunPython(add_postgis_columns, reverse_code=ops.RunPython.noop),
    ]

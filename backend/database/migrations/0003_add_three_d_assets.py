from json import dumps, loads
import functools

from tortoise import fields, migrations
from tortoise.fields.base import OnDelete
from tortoise.indexes import Index
from tortoise.migrations import operations as ops


class Migration(migrations.Migration):
    dependencies = [("models", "0002_add_osm_features")]

    operations = [
        ops.CreateModel(
            name="ThreeDAsset",
            fields=[
                ("id", fields.BigIntField(generated=True, primary_key=True, unique=True,
                                           db_index=True)),
                ("map", fields.ForeignKeyField(
                    "models.MapRecord", source_field="map_id", db_constraint=True,
                    to_field="id", related_name="three_d_assets", on_delete=OnDelete.CASCADE,
                )),
                ("name", fields.CharField(max_length=255)),
                ("model_url", fields.TextField()),
                ("latitude", fields.FloatField()),
                ("longitude", fields.FloatField()),
                ("altitude", fields.FloatField(default=0)),
                ("rotation_x", fields.FloatField(default=90)),
                ("rotation_y", fields.FloatField(default=0)),
                ("rotation_z", fields.FloatField(default=0)),
                ("scale", fields.FloatField(default=1)),
                ("active", fields.BooleanField(default=True)),
                ("metadata", fields.JSONField(
                    source_field="metadata_json", default=dict,
                    encoder=functools.partial(dumps, separators=(",", ":")), decoder=loads,
                )),
                ("created_at", fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ("updated_at", fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={
                "table": "three_d_assets", "app": "models",
                "indexes": [Index(fields=["map_id", "active"]),
                            Index(fields=["latitude", "longitude"])],
                "pk_attr": "id",
            },
            bases=["Model"],
        ),
    ]

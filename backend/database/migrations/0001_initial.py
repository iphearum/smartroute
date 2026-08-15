from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from services.map_models import default_travel_modes
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    initial = True

    operations = [
        ops.CreateModel(
            name='MapRecord',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('country_slug', fields.CharField(max_length=100)),
                ('province_slug', fields.CharField(max_length=100)),
                ('display_name', fields.CharField(max_length=120)),
                ('graph_path', fields.TextField(null=True, unique=False)),
                ('version', fields.CharField(default='1.0.0', max_length=40)),
                ('status', fields.CharField(default='active', max_length=30)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'maps', 'app': 'models', 'unique_together': (('country_slug', 'province_slug'),), 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='CustomRoute',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('map', fields.ForeignKeyField('models.MapRecord', source_field='map_id', db_constraint=True, to_field='id', related_name='custom_routes', on_delete=OnDelete.CASCADE)),
                ('name', fields.CharField(max_length=160)),
                ('coordinates', fields.JSONField(source_field='coordinates_json', encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('bidirectional', fields.BooleanField(default=True)),
                ('modes', fields.JSONField(source_field='modes_json', default=default_travel_modes, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('active', fields.BooleanField(default=True)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'map_custom_routes', 'app': 'models', 'indexes': [Index(fields=['map_id', 'active'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='MapImage',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('map', fields.ForeignKeyField('models.MapRecord', source_field='map_id', db_constraint=True, to_field='id', related_name='images', on_delete=OnDelete.CASCADE)),
                ('filename', fields.CharField(max_length=255)),
                ('content_type', fields.CharField(max_length=120)),
                ('image_data', fields.BinaryField()),
                ('byte_size', fields.IntField()),
                ('caption', fields.TextField(null=True, unique=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'map_images', 'app': 'models', 'indexes': [Index(fields=['map_id', 'created_at'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='MapRevision',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('map', fields.ForeignKeyField('models.MapRecord', source_field='map_id', db_constraint=True, to_field='id', related_name='updates', on_delete=OnDelete.CASCADE)),
                ('version', fields.CharField(max_length=40)),
                ('change_type', fields.CharField(max_length=50)),
                ('summary', fields.CharField(max_length=500)),
                ('graph_path', fields.TextField(null=True, unique=False)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'map_updates', 'app': 'models', 'indexes': [Index(fields=['map_id', 'created_at'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Place',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('map', fields.ForeignKeyField('models.MapRecord', source_field='map_id', db_constraint=True, to_field='id', related_name='places', on_delete=OnDelete.CASCADE)),
                ('name', fields.CharField(max_length=160)),
                ('latitude', fields.FloatField()),
                ('longitude', fields.FloatField()),
                ('category', fields.CharField(null=True, max_length=100)),
                ('address', fields.TextField(null=True, unique=False)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('active', fields.BooleanField(default=True)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'map_places', 'app': 'models', 'indexes': [Index(fields=['map_id', 'active', 'name']), Index(fields=['map_id', 'active', 'category'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='RoadClosure',
            fields=[
                ('id', fields.IntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('map', fields.ForeignKeyField('models.MapRecord', source_field='map_id', db_constraint=True, to_field='id', related_name='closures', on_delete=OnDelete.CASCADE)),
                ('source_node', fields.JSONField(source_field='source_node_json', encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('target_node', fields.JSONField(source_field='target_node_json', encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('edge_key', fields.JSONField(source_field='edge_key_json', null=True, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('reason', fields.TextField(null=True, unique=False)),
                ('starts_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('ends_at', fields.DatetimeField(null=True, auto_now=False, auto_now_add=False)),
                ('active', fields.BooleanField(default=True)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'map_closures', 'app': 'models', 'indexes': [Index(fields=['map_id', 'active']), Index(fields=['map_id', 'active', 'starts_at', 'ends_at'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
    ]

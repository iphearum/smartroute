from tortoise import migrations
from tortoise.migrations import operations as ops
import functools
from json import dumps, loads
from tortoise.fields.base import OnDelete
from tortoise import fields
from tortoise.indexes import Index


async def backfill_place_sources(apps, schema_editor):
    """Give places created before this migration an explicit source."""
    place = apps.get_model("models.Place")
    await place.filter(source__isnull=True).update(source="manual")


class Migration(migrations.Migration):
    dependencies = [('models', '0003_add_three_d_assets')]

    initial = False

    operations = [
        ops.CreateModel(
            name='Business',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('owner_user_id', fields.CharField(null=True, max_length=100)),
                ('legal_name', fields.CharField(null=True, max_length=255)),
                ('display_name', fields.CharField(max_length=255)),
                ('business_type', fields.CharField(default='shop', max_length=80)),
                ('description', fields.TextField(null=True, unique=False)),
                ('logo_url', fields.TextField(null=True, unique=False)),
                ('status', fields.CharField(default='draft', max_length=32)),
                ('verification_status', fields.CharField(default='unverified', max_length=32)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'businesses', 'app': 'models', 'indexes': [Index(fields=['status', 'business_type']), Index(fields=['owner_user_id'])], 'pk_attr': 'id', 'table_description': 'Merchant identity that may operate multiple physical or online shops.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='PlaceMedia',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('place', fields.ForeignKeyField('models.Place', source_field='place_id', db_constraint=True, to_field='id', related_name='media', on_delete=OnDelete.CASCADE)),
                ('media_type', fields.CharField(default='image', max_length=32)),
                ('url', fields.TextField(unique=False)),
                ('thumbnail_url', fields.TextField(null=True, unique=False)),
                ('caption', fields.TextField(null=True, unique=False)),
                ('sort_order', fields.IntField(default=0)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
            ],
            options={'table': 'place_media', 'app': 'models', 'indexes': [Index(fields=['place_id', 'sort_order'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Product',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('business', fields.ForeignKeyField('models.Business', source_field='business_id', db_constraint=True, to_field='id', related_name='products', on_delete=OnDelete.CASCADE)),
                ('name', fields.CharField(max_length=255)),
                ('description', fields.TextField(null=True, unique=False)),
                ('category', fields.CharField(null=True, max_length=120)),
                ('status', fields.CharField(default='draft', max_length=32)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'products', 'app': 'models', 'indexes': [Index(fields=['business_id', 'status']), Index(fields=['business_id', 'category'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='ProductVariant',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('product', fields.ForeignKeyField('models.Product', source_field='product_id', db_constraint=True, to_field='id', related_name='variants', on_delete=OnDelete.CASCADE)),
                ('sku', fields.CharField(unique=True, max_length=120)),
                ('title', fields.CharField(null=True, max_length=255)),
                ('price', fields.DecimalField(max_digits=14, decimal_places=2)),
                ('compare_at_price', fields.DecimalField(null=True, max_digits=14, decimal_places=2)),
                ('attributes', fields.JSONField(source_field='attributes_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('weight_grams', fields.IntField(null=True)),
                ('active', fields.BooleanField(default=True)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'product_variants', 'app': 'models', 'indexes': [Index(fields=['product_id', 'active'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='ShopBranch',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('business', fields.ForeignKeyField('models.Business', source_field='business_id', db_constraint=True, to_field='id', related_name='branches', on_delete=OnDelete.CASCADE)),
                ('place', fields.ForeignKeyField('models.Place', source_field='place_id', db_constraint=True, to_field='id', related_name='shop_branches', on_delete=OnDelete.RESTRICT)),
                ('name', fields.CharField(null=True, max_length=255)),
                ('phone', fields.CharField(null=True, max_length=80)),
                ('email', fields.CharField(null=True, max_length=255)),
                ('opening_hours', fields.JSONField(source_field='opening_hours_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('pickup_enabled', fields.BooleanField(default=False)),
                ('delivery_enabled', fields.BooleanField(default=False)),
                ('active', fields.BooleanField(default=True)),
                ('metadata', fields.JSONField(source_field='metadata_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'shop_branches', 'app': 'models', 'unique_together': (('business_id', 'place_id'),), 'indexes': [Index(fields=['place_id', 'active']), Index(fields=['business_id', 'active'])], 'pk_attr': 'id', 'table_description': 'A business operating at an existing or manually-created place.'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='InventoryItem',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('branch', fields.ForeignKeyField('models.ShopBranch', source_field='branch_id', db_constraint=True, to_field='id', related_name='inventory', on_delete=OnDelete.CASCADE)),
                ('variant', fields.ForeignKeyField('models.ProductVariant', source_field='variant_id', db_constraint=True, to_field='id', related_name='inventory', on_delete=OnDelete.CASCADE)),
                ('quantity_available', fields.IntField(default=0)),
                ('quantity_reserved', fields.IntField(default=0)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'inventory_items', 'app': 'models', 'unique_together': (('branch_id', 'variant_id'),), 'indexes': [Index(fields=['branch_id']), Index(fields=['variant_id'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.CreateModel(
            name='Storefront',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('business', fields.ForeignKeyField('models.Business', source_field='business_id', db_constraint=True, to_field='id', related_name='storefronts', on_delete=OnDelete.CASCADE)),
                ('slug', fields.CharField(unique=True, max_length=120)),
                ('title', fields.CharField(max_length=255)),
                ('description', fields.TextField(null=True, unique=False)),
                ('currency', fields.CharField(default='USD', max_length=3)),
                ('theme', fields.JSONField(source_field='theme_json', default=dict, encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)),
                ('published', fields.BooleanField(default=False)),
                ('created_at', fields.DatetimeField(auto_now=False, auto_now_add=True)),
                ('updated_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'storefronts', 'app': 'models', 'indexes': [Index(fields=['business_id', 'published'])], 'pk_attr': 'id'},
            bases=['Model'],
        ),
        ops.AlterModelOptions(
            name='OsmFeature',
            options={'table': 'osm_features', 'app': 'models', 'unique_together': (('map_id', 'osm_type', 'osm_id', 'feature_type'),), 'indexes': [Index(fields=['map_id', 'feature_type', 'active']), Index(fields=['map_id', 'feature_type', 'category']), Index(fields=['map_id', 'name']), Index(fields=['centroid_latitude', 'centroid_longitude']), Index(fields=['feature_type', 'bbox_min_latitude', 'bbox_max_latitude']), Index(fields=['feature_type', 'bbox_min_longitude', 'bbox_max_longitude'])], 'pk_attr': 'id', 'table_description': 'Searchable OSM feature; Postgres migrations also materialize PostGIS geometry.'},
        ),
        ops.AddField(
            model_name='Place',
            name='osm_feature',
            field=fields.ForeignKeyField('models.OsmFeature', source_field='osm_feature_id', null=True, db_constraint=True, to_field='id', related_name='places', on_delete=OnDelete.SET_NULL),
        ),
        ops.AddField(
            model_name='Place',
            name='source',
            field=fields.CharField(default='manual', null=True, max_length=24),
        ),
        ops.RunPython(
            backfill_place_sources,
            reverse_code=ops.RunPython.noop,
        ),
        ops.AlterField(
            model_name='Place',
            name='source',
            field=fields.CharField(default='manual', max_length=24),
        ),
        ops.AlterModelOptions(
            name='ThreeDAsset',
            options={'table': 'three_d_assets', 'app': 'models', 'indexes': [Index(fields=['map_id', 'active']), Index(fields=['latitude', 'longitude'])], 'pk_attr': 'id', 'table_description': 'Georeferenced GLB/GLTF landmark rendered above the generic map scene.'},
        ),
        ops.AddField(
            model_name='ThreeDAsset',
            name='place',
            field=fields.ForeignKeyField('models.Place', source_field='place_id', null=True, db_constraint=True, to_field='id', related_name='three_d_assets', on_delete=OnDelete.SET_NULL),
        ),
    ]

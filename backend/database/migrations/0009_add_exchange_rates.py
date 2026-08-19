from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise import fields
from tortoise.indexes import Index

class Migration(migrations.Migration):
    dependencies = [('models', '0008_expand_poi_themes')]

    initial = False

    operations = [
        ops.CreateModel(
            name='ExchangeRate',
            fields=[
                ('id', fields.BigIntField(generated=True, primary_key=True, unique=True, db_index=True)),
                ('currency', fields.CharField(max_length=10)),
                ('buy_rate', fields.DecimalField(max_digits=14, decimal_places=4)),
                ('sell_rate', fields.DecimalField(max_digits=14, decimal_places=4)),
                ('average_rate', fields.DecimalField(max_digits=14, decimal_places=4)),
                ('source', fields.CharField(default='nbc', max_length=32)),
                ('effective_date', fields.DateField()),
                ('fetched_at', fields.DatetimeField(auto_now=True, auto_now_add=False)),
            ],
            options={'table': 'exchange_rates', 'app': 'models', 'unique_together': (('currency', 'effective_date', 'source'),), 'indexes': [Index(fields=['currency', 'effective_date'])], 'pk_attr': 'id', 'table_description': 'A daily currency rate snapshot, e.g. from the National Bank of Cambodia.'},
            bases=['Model'],
        ),
    ]

import functools
from json import dumps, loads

from tortoise import fields
from tortoise import migrations
from tortoise.migrations import operations as ops
from tortoise.migrations.constraints import UniqueConstraint

JSON_FIELD_KWARGS = dict(encoder=functools.partial(dumps, separators=(',', ':')), decoder=loads)


class Migration(migrations.Migration):
    dependencies = [('models', '0009_add_exchange_rates')]

    initial = False

    operations = [
        # Add `data` as nullable first so it can land on the existing
        # per-currency rows without violating a NOT NULL constraint; the
        # backfill below populates it before anything is made non-nullable.
        ops.AddField(
            model_name='ExchangeRate',
            name='data',
            field=fields.JSONField(null=True, **JSON_FIELD_KWARGS),
        ),
        # Collapse each (effective_date, source) group of per-currency rows
        # into the JSON payload on the row Tortoise keeps (lowest id), then
        # drop the now-redundant per-currency rows. Postgres-only (jsonb_*),
        # matching this project's only supported production database.
        ops.RunSQL(
            """
            UPDATE exchange_rates er
            SET data = agg.data
            FROM (
                SELECT effective_date, source, min(id) AS keep_id,
                       jsonb_object_agg(currency, jsonb_build_object(
                           'buy_rate', buy_rate::text,
                           'sell_rate', sell_rate::text,
                           'average_rate', average_rate::text
                       )) AS data
                FROM exchange_rates
                GROUP BY effective_date, source
            ) agg
            WHERE er.id = agg.keep_id;

            DELETE FROM exchange_rates er
            USING (
                SELECT effective_date, source, min(id) AS keep_id
                FROM exchange_rates
                GROUP BY effective_date, source
            ) agg
            WHERE er.effective_date = agg.effective_date
              AND er.source = agg.source
              AND er.id <> agg.keep_id;
            """,
        ),
        # Every surviving row now has `data` populated; match the model.
        ops.AlterField(
            model_name='ExchangeRate',
            name='data',
            field=fields.JSONField(**JSON_FIELD_KWARGS),
        ),
        ops.RemoveIndex(
            model_name='ExchangeRate',
            name=None,
            fields=['currency', 'effective_date'],
        ),
        ops.RemoveConstraint(
            model_name='ExchangeRate',
            name=None,
            fields=['currency', 'effective_date', 'source'],
        ),
        ops.AlterModelOptions(
            name='ExchangeRate',
            options={'table': 'exchange_rates', 'app': 'models', 'unique_together': (('effective_date', 'source'),), 'pk_attr': 'id', 'table_description': "A day's currency rate snapshot, e.g. from the National Bank of Cambodia."},
        ),
        ops.RemoveField(model_name='ExchangeRate', name='average_rate'),
        ops.RemoveField(model_name='ExchangeRate', name='buy_rate'),
        ops.RemoveField(model_name='ExchangeRate', name='currency'),
        ops.RemoveField(model_name='ExchangeRate', name='sell_rate'),
        ops.AddConstraint(
            model_name='ExchangeRate',
            constraint=UniqueConstraint(fields=('effective_date', 'source'), name=None),
        ),
    ]

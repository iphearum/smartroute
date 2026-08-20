"""Daily currency rate snapshots."""

from __future__ import annotations

from tortoise import fields, models


class ExchangeRate(models.Model):
    """A day's currency rate snapshot, e.g. from the National Bank of Cambodia.

    Rates are against KHR (1 unit of a currency = its `average_rate` KHR),
    matching how NBC and other central banks publish official rates. One row
    holds every currency for a given (effective_date, source) as JSON --
    re-fetching the same day updates that single row in place -- instead of
    one row per currency, since a day's rates are always read and written
    together and per-currency rows would just be needless duplication of
    `effective_date`/`source`/`fetched_at`.

    `data` maps currency code to {"buy_rate", "sell_rate", "average_rate"},
    each stored as a decimal string (JSON has no native decimal type).
    """

    id = fields.BigIntField(pk=True)
    source = fields.CharField(max_length=32, default="nbc")
    effective_date = fields.DateField()
    data = fields.JSONField()
    fetched_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "exchange_rates"
        unique_together = (("effective_date", "source"),)

"""Daily currency rate snapshots."""

from __future__ import annotations

from tortoise import fields, models


class ExchangeRate(models.Model):
    """A daily currency rate snapshot, e.g. from the National Bank of Cambodia.

    Rates are against KHR (1 unit of `currency` = `average_rate` KHR), matching
    how NBC and other central banks publish official rates. Kept one row per
    (currency, effective_date, source) so re-fetching the same day updates in
    place instead of accumulating duplicates.
    """

    id = fields.BigIntField(pk=True)
    currency = fields.CharField(max_length=10)
    buy_rate = fields.DecimalField(max_digits=14, decimal_places=4)
    sell_rate = fields.DecimalField(max_digits=14, decimal_places=4)
    average_rate = fields.DecimalField(max_digits=14, decimal_places=4)
    source = fields.CharField(max_length=32, default="nbc")
    effective_date = fields.DateField()
    fetched_at = fields.DatetimeField(auto_now=True)

    class Meta:
        table = "exchange_rates"
        unique_together = (("currency", "effective_date", "source"),)
        indexes = (("currency", "effective_date"),)

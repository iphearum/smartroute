"""Daily currency reference rates (currently National Bank of Cambodia)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.models.exchange_rate import ExchangeRate
from app.services.base_service import BaseService
from app.clients.nbc_exchange import NbcRate

RATE_FIELDS = ("buy_rate", "sell_rate", "average_rate")


def _row_to_rates(row: ExchangeRate) -> list[dict]:
    return [
        {
            "currency": currency,
            **{field: Decimal(values[field]) for field in RATE_FIELDS},
            "source": row.source,
            "effective_date": row.effective_date,
            "fetched_at": row.fetched_at,
        }
        for currency, values in sorted(row.data.items())
    ]


class ExchangeRateService(BaseService[ExchangeRate]):
    model = ExchangeRate

    async def upsert_exchange_rates(self, rates: list[NbcRate], effective_date: date,
                                    source: str = "nbc") -> ExchangeRate:
        data = {
            rate.currency: {field: str(getattr(rate, field)) for field in RATE_FIELDS}
            for rate in rates
        }
        row, _ = await ExchangeRate.update_or_create(
            effective_date=effective_date, source=source, defaults={"data": data},
        )
        return row

    async def has_rates_for(self, effective_date: date, source: str = "nbc") -> bool:
        return await ExchangeRate.filter(effective_date=effective_date, source=source).exists()

    async def latest_exchange_rates(self, source: str = "nbc") -> list[dict]:
        latest_row = await self.model.filter(source=source).order_by("-effective_date").first()
        if latest_row is None:
            return []
        return _row_to_rates(latest_row)

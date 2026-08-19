"""Daily currency reference rates (currently National Bank of Cambodia)."""

from __future__ import annotations

from datetime import date

from app.models.exchange_rate import ExchangeRate
from app.services.base_service import BaseService
from app.clients.nbc_exchange import NbcRate


class ExchangeRateService(BaseService[ExchangeRate]):
    model = ExchangeRate

    async def upsert_exchange_rates(self, rates: list[NbcRate], effective_date: date,
                                    source: str = "nbc") -> list[ExchangeRate]:
        saved: list[ExchangeRate] = []
        for rate in rates:
            row, _ = await ExchangeRate.update_or_create(
                currency=rate.currency, effective_date=effective_date, source=source,
                defaults={
                    "buy_rate": rate.buy_rate,
                    "sell_rate": rate.sell_rate,
                    "average_rate": rate.average_rate,
                },
            )
            saved.append(row)
        return saved

    async def latest_exchange_rates(self, source: str = "nbc") -> list[dict]:
        latest_row = await self.model.filter(source=source).order_by("-effective_date").first()
        if latest_row is None:
            return []
        return await self.values(
            "id", "currency", "buy_rate", "sell_rate", "average_rate",
            "source", "effective_date", "fetched_at",
            order_by="currency", source=source, effective_date=latest_row.effective_date,
        )

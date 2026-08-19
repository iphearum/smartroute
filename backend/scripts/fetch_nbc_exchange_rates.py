"""Fetch today's official currency rates from the National Bank of Cambodia
and upsert them, for display of KHR-equivalent prices in shop/POS UIs.

Intended to run on a daily schedule (cron, systemd timer, or a pm2 cron
job -- see ecosystem.config.cjs for how this project already runs recurring
processes), mirroring how the original Laravel `nbc:fetch-exchange-rates`
artisan command was scheduled.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from app.services.exchange_rate_service import ExchangeRateService
from app.services.map_service import MapService
from app.clients.nbc_exchange import NbcExchangeRateError, fetch_nbc_rates
from config.settings import settings


async def run() -> None:
    store = MapService(Path("maps"), settings.database_url)
    await store.initialize()
    try:
        rates = await asyncio.to_thread(fetch_nbc_rates)
        saved = await ExchangeRateService().upsert_exchange_rates(
            rates, effective_date=datetime.now(timezone.utc).date(),
        )
        for row in saved:
            print(f"{row.currency}: buy {row.buy_rate}, sell {row.sell_rate}, "
                  f"avg {row.average_rate}")
        print(f"Saved {len(saved)} rate(s).")
    finally:
        await store.close()


if __name__ == "__main__":
    argparse.ArgumentParser(description=__doc__).parse_args()
    try:
        asyncio.run(run())
    except NbcExchangeRateError as exc:
        raise SystemExit(f"Failed to fetch NBC exchange rates: {exc}")

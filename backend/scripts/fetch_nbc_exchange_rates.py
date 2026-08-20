"""Fetch today's official currency rates from the National Bank of Cambodia
and upsert them, for display of KHR-equivalent prices in shop/POS UIs.

Checks the exchange_rates table for today's effective_date before calling
NBC, so re-running (e.g. a pm2 restart landing the same day as the last
cron tick) is a cheap DB read instead of a second outbound request; pass
--force to refetch anyway. Run daily by the "smart-nbc-rates" pm2 app in
ecosystem.config.cjs, which runs it once immediately on `pm2 start` and
again every day at 01:00 Phnom Penh time via cron_restart, mirroring how
the original Laravel `nbc:fetch-exchange-rates` artisan command was
scheduled.
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


async def run(force: bool = False) -> None:
    async with MapService(Path("maps"), settings.database_url):
        service = ExchangeRateService()
        today = datetime.now(timezone.utc).date()
        if not force and await service.has_rates_for(today):
            print(f"Rates for {today} are already cached; skipping NBC request.")
            return

        rates = await asyncio.to_thread(fetch_nbc_rates)
        effective_date = rates[0].effective_date or today
        if not force and effective_date != today and await service.has_rates_for(effective_date):
            print(f"Rates for {effective_date} (NBC's reported date) are already cached; skipping save.")
            return

        saved = await service.upsert_exchange_rates(rates, effective_date=effective_date)
        for currency, values in sorted(saved.data.items()):
            print(f"{currency}: buy {values['buy_rate']}, sell {values['sell_rate']}, "
                  f"avg {values['average_rate']}")
        print(f"Saved {len(saved.data)} rate(s) for {effective_date}.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true",
                        help="Re-fetch and overwrite even if today's rates are already cached")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.force))
    except NbcExchangeRateError as exc:
        raise SystemExit(f"Failed to fetch NBC exchange rates: {exc}")

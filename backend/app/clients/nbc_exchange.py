"""Fetch and parse official daily currency rates from the National Bank of
Cambodia's public XML endpoint. Pure network/parsing logic only -- no
database access, so it can be unit tested against a canned XML body without
a live HTTP call or a database.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from xml.etree import ElementTree

import requests

NBC_RATE_URL = "https://www.nbc.gov.kh/api/exRate.php"
DEFAULT_TIMEOUT = 10.0


class NbcExchangeRateError(RuntimeError):
    """Raised when NBC rates cannot be fetched or parsed."""


@dataclass(frozen=True)
class NbcRate:
    currency: str
    buy_rate: Decimal
    sell_rate: Decimal
    average_rate: Decimal


def _decimal(text: str | None, field: str) -> Decimal:
    if text is None or not text.strip():
        raise NbcExchangeRateError(f"NBC rate is missing a value for '{field}'")
    try:
        return Decimal(text.strip())
    except InvalidOperation as exc:
        raise NbcExchangeRateError(f"NBC rate has a non-numeric '{field}': {text!r}") from exc


def parse_nbc_rates(xml_body: str) -> list[NbcRate]:
    """Parse the `<rates><rate>...</rate></rates>` document NBC publishes.

    Searches for `<rate>` anywhere in the document rather than assuming an
    exact root tag, since that detail isn't part of NBC's documented
    contract and shouldn't be able to break parsing on its own.
    """
    try:
        root = ElementTree.fromstring(xml_body)
    except ElementTree.ParseError as exc:
        raise NbcExchangeRateError(f"NBC response is not valid XML: {exc}") from exc

    rates: list[NbcRate] = []
    for node in root.iter("rate"):
        currency = (node.findtext("currency") or "").strip().upper()
        if not currency:
            continue
        rates.append(NbcRate(
            currency=currency,
            buy_rate=_decimal(node.findtext("bid"), "bid"),
            sell_rate=_decimal(node.findtext("ask"), "ask"),
            average_rate=_decimal(node.findtext("average"), "average"),
        ))
    if not rates:
        raise NbcExchangeRateError("NBC response contained no <rate> entries")
    return rates


def fetch_nbc_rates(timeout: float = DEFAULT_TIMEOUT) -> list[NbcRate]:
    """Fetch and parse today's rates. Raises NbcExchangeRateError on any
    network, HTTP, or parsing failure -- callers don't need to know requests
    or ElementTree to handle failures.
    """
    try:
        response = requests.get(NBC_RATE_URL, timeout=timeout)
    except requests.RequestException as exc:
        raise NbcExchangeRateError(f"Could not reach NBC exchange rate endpoint: {exc}") from exc
    if response.status_code != 200:
        raise NbcExchangeRateError(
            f"NBC exchange rate endpoint returned HTTP {response.status_code}"
        )
    return parse_nbc_rates(response.text)

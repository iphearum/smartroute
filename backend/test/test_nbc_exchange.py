from datetime import date
from decimal import Decimal

import pytest

from app.clients.nbc_exchange import NbcExchangeRateError, parse_nbc_rates

SAMPLE_XML = """<?xml version="1.0" encoding="utf-8"?>
<ExchangeRate ExternalSystemName="NOW">
<ex>
<date>08/20/2026</date>
<key>USD/KHR</key>
<unit>1</unit>
<bid>4044</bid>
<ask>4044</ask>
<average>4044.00</average>
</ex>
<ex>
<date>08/20/2026</date>
<key>thb/KHR</key>
<unit>1</unit>
<bid>112.50</bid>
<ask>114.20</ask>
<average>113.35</average>
</ex>
</ExchangeRate>
"""


def test_parse_nbc_rates_reads_every_currency():
    rates = parse_nbc_rates(SAMPLE_XML)
    assert [rate.currency for rate in rates] == ["USD", "THB"]
    usd = rates[0]
    assert usd.buy_rate == Decimal("4044")
    assert usd.sell_rate == Decimal("4044")
    assert usd.average_rate == Decimal("4044.00")


def test_parse_nbc_rates_uppercases_currency_codes():
    rates = parse_nbc_rates(SAMPLE_XML)
    assert rates[1].currency == "THB"


def test_parse_nbc_rates_reads_effective_date_from_key_entry():
    rates = parse_nbc_rates(SAMPLE_XML)
    assert all(rate.effective_date == date(2026, 8, 20) for rate in rates)


def test_parse_nbc_rates_rejects_malformed_xml():
    with pytest.raises(NbcExchangeRateError, match="not valid XML"):
        parse_nbc_rates("<ExchangeRate><ex>")


def test_parse_nbc_rates_rejects_empty_document():
    with pytest.raises(NbcExchangeRateError, match="no <ex> entries"):
        parse_nbc_rates("<ExchangeRate></ExchangeRate>")


def test_parse_nbc_rates_rejects_non_numeric_field():
    bad_xml = """<ExchangeRate><ex>
        <date>08/20/2026</date><key>USD/KHR</key><bid>oops</bid><ask>4105</ask><average>4100</average>
    </ex></ExchangeRate>"""
    with pytest.raises(NbcExchangeRateError, match="non-numeric 'bid'"):
        parse_nbc_rates(bad_xml)


def test_parse_nbc_rates_rejects_unparseable_date():
    bad_xml = """<ExchangeRate><ex>
        <date>2026-08-20</date><key>USD/KHR</key><bid>1</bid><ask>1</ask><average>1</average>
    </ex></ExchangeRate>"""
    with pytest.raises(NbcExchangeRateError, match="unparseable 'date'"):
        parse_nbc_rates(bad_xml)


def test_parse_nbc_rates_skips_entries_without_a_currency_key():
    xml = """<ExchangeRate>
        <ex><date>08/20/2026</date><key></key><bid>1</bid><ask>1</ask><average>1</average></ex>
        <ex><date>08/20/2026</date><key>KHR/KHR</key><bid>1</bid><ask>1</ask><average>1</average></ex>
    </ExchangeRate>"""
    rates = parse_nbc_rates(xml)
    assert [rate.currency for rate in rates] == ["KHR"]

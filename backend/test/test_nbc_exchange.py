from decimal import Decimal

import pytest

from app.clients.nbc_exchange import NbcExchangeRateError, parse_nbc_rates

SAMPLE_XML = """<?xml version="1.0" encoding="utf-8"?>
<DataSet>
  <rates>
    <rate>
      <currency>USD</currency>
      <bid>4095.00</bid>
      <ask>4105.00</ask>
      <average>4100.00</average>
    </rate>
    <rate>
      <currency>thb</currency>
      <bid>112.50</bid>
      <ask>114.20</ask>
      <average>113.35</average>
    </rate>
  </rates>
</DataSet>
"""


def test_parse_nbc_rates_reads_every_currency():
    rates = parse_nbc_rates(SAMPLE_XML)
    assert [rate.currency for rate in rates] == ["USD", "THB"]
    usd = rates[0]
    assert usd.buy_rate == Decimal("4095.00")
    assert usd.sell_rate == Decimal("4105.00")
    assert usd.average_rate == Decimal("4100.00")


def test_parse_nbc_rates_uppercases_currency_codes():
    rates = parse_nbc_rates(SAMPLE_XML)
    assert rates[1].currency == "THB"


def test_parse_nbc_rates_rejects_malformed_xml():
    with pytest.raises(NbcExchangeRateError, match="not valid XML"):
        parse_nbc_rates("<rates><rate>")


def test_parse_nbc_rates_rejects_empty_document():
    with pytest.raises(NbcExchangeRateError, match="no <rate> entries"):
        parse_nbc_rates("<DataSet><rates></rates></DataSet>")


def test_parse_nbc_rates_rejects_non_numeric_field():
    bad_xml = """<DataSet><rates><rate>
        <currency>USD</currency><bid>oops</bid><ask>4105</ask><average>4100</average>
    </rate></rates></DataSet>"""
    with pytest.raises(NbcExchangeRateError, match="non-numeric 'bid'"):
        parse_nbc_rates(bad_xml)


def test_parse_nbc_rates_skips_entries_without_currency():
    xml = """<DataSet><rates>
        <rate><currency></currency><bid>1</bid><ask>1</ask><average>1</average></rate>
        <rate><currency>KHR</currency><bid>1</bid><ask>1</ask><average>1</average></rate>
    </rates></DataSet>"""
    rates = parse_nbc_rates(xml)
    assert [rate.currency for rate in rates] == ["KHR"]

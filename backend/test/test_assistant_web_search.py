import asyncio
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.services.assistant import web_search


def test_search_web_requires_query():
    result = asyncio.run(web_search.search_web("  "))
    assert "query is required" in result["error"]

def test_duckduckgo_results_are_normalized_and_non_https_results_removed():
    response = SimpleNamespace(
        raise_for_status=lambda: None,
        text='''
            <div class="result">
              <h2 class="result__title"><a class="result__a" href="https://www.example.com/a">Example</a></h2>
              <a class="result__snippet">A result</a>
            </div>
            <div class="result">
              <h2 class="result__title"><a class="result__a" href="http://example.com/b">Ignored</a></h2>
            </div>
        ''',
    )
    with patch.object(web_search.requests, "get", return_value=response), patch.object(web_search, "secure_fetch", return_value=""):
        result = asyncio.run(web_search.search_web("example"))
    assert result["results"] == [
        {
            "title": "Example",
            "url": "https://www.example.com/a",
            "domain": "example.com",
            "snippet": "A result",
        }
    ]


def test_secure_fetch_rejects_private_dns_targets():
    with patch.object(
        web_search.socket,
        "getaddrinfo",
        return_value=[(None, None, None, None, ("127.0.0.1", 0))],
    ):
        with pytest.raises(ValueError, match="internal or private"):
            web_search.secure_fetch("https://example.com")

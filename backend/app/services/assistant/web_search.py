"""Server-side web search adapter used by the assistant tool boundary."""
from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

DUCKDUCKGO_SEARCH_URL = "https://html.duckduckgo.com/html/"
SEARCH_TIMEOUT = 12
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_PAGE_CHARS = 3_500
MAX_REDIRECTS = 3


async def search_web(query: str, count: int = 6) -> dict:
    normalized = query.strip()[:400]
    if not normalized:
        return {"error": "A web search query is required."}
    return await asyncio.to_thread(_search_duckduckgo, normalized, min(max(count, 1), 10))


def _decode_search_url(url: str) -> str:
    parsed = urlparse(url)
    target = parse_qs(parsed.query).get("uddg")
    if target:
        return unquote(target[0])
    return f"https:{url}" if url.startswith("//") else url


def _search_duckduckgo(query: str, count: int) -> dict:
    try:
        response = requests.get(
            DUCKDUCKGO_SEARCH_URL,
            params={"q": query},
            headers={"User-Agent": "SmartRouteAssistant/1.0", "Accept-Encoding": "identity"},
            timeout=SEARCH_TIMEOUT,
        )
        response.raise_for_status()
    except (requests.RequestException, ValueError):
        return {"error": "The internet search provider is temporarily unavailable."}

    soup = BeautifulSoup(response.text, "html.parser")
    results = []
    for item in soup.select(".result"):
        link = item.select_one(".result__title a.result__a")
        if link is None:
            continue

        url = _decode_search_url(link.get("href", ""))
        if not isinstance(url, str) or urlparse(url).scheme != "https":
            continue
        domain = urlparse(url).netloc.lower().removeprefix("www.")
        snippet_node = item.select_one(".result__snippet")
        result = {
            "title": " ".join(link.get_text(" ", strip=True).split())[:240] or domain,
            "url": url[:2000],
            "domain": domain[:160],
            "snippet": " ".join(snippet_node.get_text(" ", strip=True).split())[:600]
            if snippet_node
            else "",
        }
        try:
            page_text = secure_fetch(url)
        except (ValueError, RuntimeError):
            page_text = ""
        if page_text:
            result["content"] = page_text
        results.append(result)
        if len(results) >= count:
            break
    return {"query": query, "results": results}


def _safe_ip(ip_text: str) -> bool:
    try:
        address = ipaddress.ip_address(ip_text)
    except ValueError:
        return False
    return not (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_unspecified
        or address.is_multicast
    )


def _validate_public_host(hostname: str) -> None:
    try:
        addresses = socket.getaddrinfo(
            hostname,
            None,
            type=socket.SOCK_STREAM,
        )
    except OSError as exc:
        raise ValueError("DNS resolution failed.") from exc

    resolved = {record[4][0] for record in addresses if record[4]}
    if not resolved or not all(_safe_ip(address) for address in resolved):
        raise ValueError("Access to internal or private networks is forbidden.")


def _validate_fetch_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS URLs are allowed.")
    if parsed.username or parsed.password or not parsed.hostname:
        raise ValueError("The URL must contain a public hostname without credentials.")
    try:
        parsed.port
    except ValueError as exc:
        raise ValueError("The URL contains an invalid port.") from exc
    _validate_public_host(parsed.hostname)


def secure_fetch(url: str, max_bytes: int = MAX_PAGE_BYTES) -> str:
    """Fetch public HTML with SSRF, redirect, timeout, and size protections."""
    current_url = url
    headers = {"User-Agent": "SmartRouteAssistant/1.0", "Accept": "text/html,application/xhtml+xml"}

    for redirect_count in range(MAX_REDIRECTS + 1):
        _validate_fetch_url(current_url)
        try:
            with requests.get(
                current_url,
                headers=headers,
                timeout=(3.0, 5.0),
                stream=True,
                allow_redirects=False,
                verify=True,
            ) as response:
                if response.is_redirect or response.is_permanent_redirect:
                    location = response.headers.get("Location")
                    if not location or redirect_count >= MAX_REDIRECTS:
                        raise ValueError("Too many or invalid redirects.")
                    current_url = urljoin(current_url, location)
                    continue

                response.raise_for_status()
                content_type = response.headers.get("Content-Type", "").lower()
                if content_type and not any(
                    value in content_type for value in ("text/html", "application/xhtml+xml")
                ):
                    return ""
                content_length = response.headers.get("Content-Length")
                if content_length and int(content_length) > max_bytes:
                    raise ValueError("Response body exceeds the maximum allowed size.")

                body = bytearray()
                for chunk in response.iter_content(chunk_size=8192):
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ValueError("Response body exceeds the maximum allowed size.")
                break
        except requests.RequestException as exc:
            raise RuntimeError("Network error while fetching a search result.") from exc
    else:
        raise ValueError("Too many redirects.")

    soup = BeautifulSoup(bytes(body), "html.parser")
    for tag in soup(("script", "style", "noscript", "svg", "header", "footer", "nav", "form")):
        tag.decompose()
    paragraphs = [
        " ".join(node.get_text(" ", strip=True).split())
        for node in soup.select("article p, main p, p")
    ]
    text = "\n".join(value for value in paragraphs if len(value) >= 40)
    if not text:
        text = " ".join(soup.stripped_strings)
    return text[:MAX_PAGE_CHARS]

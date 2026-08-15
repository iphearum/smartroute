"""Reliable access to public Overpass API instances used by OSMnx."""

from __future__ import annotations

import logging
import os
import random
import threading
import time
from collections.abc import Callable
from typing import TypeVar

import osmnx as ox
from requests import RequestException

T = TypeVar("T")
logger = logging.getLogger(__name__)

# OSMnx appends ``/interpreter`` to these base URLs.
DEFAULT_ENDPOINTS = (
    "https://maps.mail.ru/osm/tools/overpass/api",
    "https://overpass.private.coffee/api",
    "https://overpass-api.de/api",
)
_SETTINGS_LOCK = threading.Lock()
_OPERATION_LOCK = threading.Lock()
_RATE_LOCK = threading.Lock()
_NEXT_REQUEST_AT = 0.0


def _env_int(name: str, default: int, minimum: int = 1) -> int:
    try:
        return max(minimum, int(os.getenv(name, str(default))))
    except ValueError:
        return default


def _env_float(name: str, default: float, minimum: float = 0.0) -> float:
    try:
        return max(minimum, float(os.getenv(name, str(default))))
    except ValueError:
        return default


def _wait_for_request_slot() -> float:
    """Apply one process-wide randomized delay, including concurrent workers."""
    global _NEXT_REQUEST_AT
    minimum = _env_float("OVERPASS_DELAY_MIN", 1.0)
    maximum = max(minimum, _env_float("OVERPASS_DELAY_MAX", 3.0))
    with _RATE_LOCK:
        now = time.monotonic()
        wait = max(0.0, _NEXT_REQUEST_AT - now)
        _NEXT_REQUEST_AT = max(now, _NEXT_REQUEST_AT) + random.uniform(minimum, maximum)
    if wait:
        time.sleep(wait)
    return wait


def _retry_after(exc: Exception) -> float | None:
    response = getattr(exc, "response", None)
    value = getattr(response, "headers", {}).get("Retry-After") if response is not None else None
    try:
        return max(0.0, float(value)) if value is not None else None
    except (TypeError, ValueError):
        return None


def endpoints() -> tuple[str, ...]:
    """Return configured Overpass base URLs, without duplicate entries."""
    configured = os.getenv("OVERPASS_ENDPOINTS", "")
    values = configured.split(",") if configured else DEFAULT_ENDPOINTS
    return tuple(dict.fromkeys(value.strip().rstrip("/") for value in values if value.strip()))


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, RequestException):
        return True
    message = f"{type(exc).__name__}: {exc}".lower()
    return any(marker in message for marker in (
        "connection refused", "connection reset", "failed to establish",
        "max retries exceeded", "name resolution", "timed out", "timeout",
        "too many requests", "rate limit", "status code 429", "status code 502",
        "status code 503", "status code 504", "server disconnected",
    ))


def call(operation: Callable[[], T], description: str = "Overpass request") -> T:
    """Run an OSMnx operation with retry/backoff and public-server failover."""
    urls = endpoints()
    if not urls:
        raise RuntimeError("OVERPASS_ENDPOINTS does not contain a usable URL")

    max_retries = _env_int("OVERPASS_MAX_RETRIES", _env_int("OVERPASS_RETRIES", 3))
    timeout = _env_int("OVERPASS_TIMEOUT", 180, minimum=10)
    backoff = _env_int("OVERPASS_RETRY_BACKOFF", 3)
    failures: list[str] = []

    for attempt in range(1, max_retries + 1):
        endpoint = urls[(attempt - 1) % len(urls)]
        try:
            # OSMnx keeps its endpoint in process-global settings. Holding this
            # lock prevents workers from changing another request's server.
            with _OPERATION_LOCK:
                waited = _wait_for_request_slot()
                if waited:
                    logger.debug("Delayed %.1fs before %s via %s", waited, description, endpoint)
                with _SETTINGS_LOCK:
                    ox.settings.overpass_url = endpoint
                    ox.settings.requests_timeout = timeout
                return operation()
        except Exception as exc:
            failures.append(f"{endpoint} ({type(exc).__name__}: {exc})")
            if not _is_transient(exc):
                raise
            if attempt < max_retries:
                delay = max(
                    _retry_after(exc) or 0.0,
                    backoff * (2 ** (attempt - 1)) + random.uniform(0.5, 2.0),
                )
                logger.warning(
                    "%s failed via %s (attempt %d/%d); retrying via another endpoint in %.1fs: %s",
                    description, endpoint, attempt, max_retries, delay, exc,
                )
                time.sleep(delay)

    details = "; ".join(failures)
    raise RuntimeError(f"All configured Overpass servers failed for {description}: {details}")

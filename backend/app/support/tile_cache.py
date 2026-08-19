"""In-process TTL cache for viewport place lookups.

Requests are snapped to a fixed-size lat/lon grid before being used as a
cache key, so nearby/overlapping viewports (the common case while panning)
resolve to the same cached tile instead of missing on every slightly
different bounding box. A single in-process process serves this backend
(see ecosystem.config.cjs), so a plain dict is sufficient -- no Redis or
other shared-cache infrastructure is needed here.
"""

from __future__ import annotations

import math
import time

Bounds = tuple[float, float, float, float]


class TileCache:
    def __init__(self, ttl_seconds: float, tile_degrees: float = 0.05):
        self.ttl_seconds = ttl_seconds
        self.tile_degrees = tile_degrees
        self._store: dict[tuple, tuple[float, list]] = {}

    def snap(self, south: float, west: float, north: float, east: float) -> Bounds:
        step = self.tile_degrees
        return (
            math.floor(south / step) * step,
            math.floor(west / step) * step,
            math.ceil(north / step) * step,
            math.ceil(east / step) * step,
        )

    def get(self, country: str, bounds: Bounds) -> list | None:
        entry = self._store.get((country, bounds))
        if entry is None:
            return None
        expires_at, value = entry
        if expires_at < time.monotonic():
            del self._store[(country, bounds)]
            return None
        return value

    def set(self, country: str, bounds: Bounds, value: list) -> None:
        self._store[(country, bounds)] = (time.monotonic() + self.ttl_seconds, value)

    def clear(self) -> None:
        self._store.clear()

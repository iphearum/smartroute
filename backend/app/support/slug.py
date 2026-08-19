"""Slug validation shared by map regions and storefronts."""

from __future__ import annotations

import re

SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:[_-][a-z0-9]+)*$")


def validate_slug(value: str) -> str:
    normalized = value.strip().lower()
    if not SLUG_PATTERN.fullmatch(normalized):
        raise ValueError(
            "Names may contain lowercase letters, numbers, hyphens, and underscores"
        )
    return normalized

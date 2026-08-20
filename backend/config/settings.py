"""Typed application configuration loaded from environment variables and .env."""

from __future__ import annotations

import os
import secrets
import warnings
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env", override=False)


def _boolean(name: str, default: bool = False):
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


def _database_url():
    explicit = os.getenv("DB_URL", "").strip()
    if explicit:
        return explicit
    driver = os.getenv("DB_CONNECTION", "sqlite").strip().lower()
    database = os.getenv("DB_DATABASE", "maps/maps.db").strip()
    if driver in {"sqlite", "sqlite3"}:
        path = Path(database).expanduser()
        if not path.is_absolute():
            path = BASE_DIR / path
        return f"sqlite://{path.resolve()}"
    if driver in {"mysql", "mariadb"}:
        host = os.getenv("DB_HOST", "127.0.0.1").strip()
        port = os.getenv("DB_PORT", "3306").strip()
        username = quote(os.getenv("DB_USERNAME", "root"), safe="")
        password = quote(os.getenv("DB_PASSWORD", ""), safe="")
        return f"mysql://{username}:{password}@{host}:{port}/{quote(database, safe='')}?charset=utf8mb4"
    if driver in {"pgsql", "postgres", "postgresql"}:
        host = os.getenv("DB_HOST", "127.0.0.1").strip()
        port = os.getenv("DB_PORT", "5432").strip()
        username = quote(os.getenv("DB_USERNAME", "postgres"), safe="")
        password = quote(os.getenv("DB_PASSWORD", ""), safe="")
        return f"postgres://{username}:{password}@{host}:{port}/{quote(database, safe='')}"
    raise RuntimeError(f"Unsupported DB_CONNECTION: {driver}")


def _app_secret_key(app_env: str):
    explicit = os.getenv("APP_SECRET_KEY", "").strip()
    if explicit:
        return explicit
    if app_env != "development":
        raise RuntimeError(
            "APP_SECRET_KEY must be set outside local development. "
            "An empty/default JWT signing secret would defeat authentication entirely."
        )
    warnings.warn(
        "APP_SECRET_KEY is not set; generating a random ephemeral secret for this "
        "development run. Sessions will not survive a backend restart. Set "
        "APP_SECRET_KEY in .env to keep sessions stable across restarts.",
        stacklevel=2,
    )
    return secrets.token_urlsafe(48)


@dataclass(frozen=True)
class Settings:
    database_url: str
    map_region: str | None
    graph_path: str | None
    custom_graphs: tuple[str, ...]
    host: str
    port: int
    reload: bool
    graphhopper_url: str | None
    graphhopper_timeout: float
    translation_enabled: bool
    translation_concurrency: int
    translation_max_retries: int
    translation_chunk_chars: int
    app_env: str
    app_secret_key: str
    session_cookie_name: str
    session_cookie_secure: bool
    session_ttl_days: int
    place_cache_ttl_seconds: float
    place_cache_tile_degrees: float
    ai_base_url: str | None
    ai_api_key: str | None
    ai_model: str
    ai_timeout: float


_app_env = os.getenv("APP_ENV", "development").strip().lower()

settings = Settings(
    database_url=_database_url(),
    map_region=os.getenv("SMARTROUTE_MAP_REGION") or None,
    graph_path=os.getenv("SMARTROUTE_GRAPH") or None,
    custom_graphs=tuple(value.strip() for value in os.getenv("SMARTROUTE_CUSTOM_GRAPHS", "").split(",")
                        if value.strip()),
    host=os.getenv("APP_HOST", "127.0.0.1"),
    port=int(os.getenv("APP_PORT", "8000")),
    reload=_boolean("APP_RELOAD"),
    graphhopper_url=os.getenv("GRAPHHOPPER_URL", "").strip().rstrip("/") or None,
    graphhopper_timeout=float(os.getenv("GRAPHHOPPER_TIMEOUT", "15")),
    translation_enabled=_boolean("TRANSLATION_ENABLED", True),
    translation_concurrency=int(os.getenv("TRANSLATION_CONCURRENCY", "2")),
    translation_max_retries=int(os.getenv("TRANSLATION_MAX_RETRIES", "3")),
    translation_chunk_chars=int(os.getenv("TRANSLATION_CHUNK_CHARS", "4500")),
    app_env=_app_env,
    app_secret_key=_app_secret_key(_app_env),
    session_cookie_name=os.getenv("SESSION_COOKIE_NAME", "sr_session"),
    session_cookie_secure=_boolean("SESSION_COOKIE_SECURE", True),
    session_ttl_days=int(os.getenv("SESSION_TTL_DAYS", "7")),
    place_cache_ttl_seconds=float(os.getenv("PLACE_CACHE_TTL_SECONDS", str(24 * 3600))),
    place_cache_tile_degrees=float(os.getenv("PLACE_CACHE_TILE_DEGREES", "0.05")),
    ai_base_url=os.getenv("AI_BASE_URL", "http://127.0.0.1:8888/v1").strip().rstrip("/") or None,
    ai_api_key=os.getenv("AI_API_KEY", "").strip() or None,
    ai_model=os.getenv("AI_MODEL", "nphearum/PsarAI-2B-GGUF").strip(),
    ai_timeout=float(os.getenv("AI_TIMEOUT", "45")),
)

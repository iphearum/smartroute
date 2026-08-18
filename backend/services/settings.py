"""Typed application configuration loaded from environment variables and .env."""

from __future__ import annotations

import os
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
)

# Shared by the application and `python -m tortoise` migration CLI.
TORTOISE_ORM = {
    "connections": {"default": settings.database_url},
    "apps": {
        "models": {
            "models": ["services.map_models"],
            "default_connection": "default",
            "migrations": "database.migrations",
        }
    },
    "use_tz": True,
    "timezone": "UTC",
}

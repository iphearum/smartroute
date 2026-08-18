"""Destructively remove all configured database tables before a fresh migration."""

from __future__ import annotations

import argparse
import asyncio
from urllib.parse import urlparse

from services.settings import TORTOISE_ORM, settings
from tortoise import Tortoise

PROTECTED_DATABASES = {"postgres", "template0", "template1", "mysql", "information_schema"}


def database_name() -> str:
    url = settings.database_url
    if url.startswith("sqlite://"):
        return url.removeprefix("sqlite://")
    return urlparse(url).path.lstrip("/")


async def reset() -> None:
    name = database_name()
    if not name or name.casefold() in PROTECTED_DATABASES:
        raise RuntimeError(f"Refusing to reset protected database: {name!r}")

    await Tortoise.init(config=TORTOISE_ORM)
    client = Tortoise.get_connection("default")
    dialect = client.capabilities.dialect
    try:
        if dialect == "postgres":
            await client.execute_script(
                "DROP SCHEMA public CASCADE; CREATE SCHEMA public; "
                "GRANT ALL ON SCHEMA public TO public;"
            )
        elif dialect == "sqlite":
            rows = await client.execute_query_dict(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%'"
            )
            await client.execute_script("PRAGMA foreign_keys=OFF;")
            for row in rows:
                table = row["name"].replace('"', '""')
                await client.execute_script(f'DROP TABLE IF EXISTS "{table}";')
            await client.execute_script("PRAGMA foreign_keys=ON;")
        elif dialect in {"mysql", "mariadb"}:
            rows = await client.execute_query_dict(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = DATABASE()"
            )
            await client.execute_script("SET FOREIGN_KEY_CHECKS=0;")
            for row in rows:
                table = row["table_name"].replace("`", "``")
                await client.execute_script(f"DROP TABLE IF EXISTS `{table}`;")
            await client.execute_script("SET FOREIGN_KEY_CHECKS=1;")
        else:
            raise RuntimeError(f"Unsupported database dialect for reset: {dialect}")
    finally:
        await Tortoise.close_connections()
    print(f"Database cleared: {name} ({dialect})")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    asyncio.run(reset())

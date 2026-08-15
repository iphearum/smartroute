"""Safely roll back exactly one latest applied migration by timestamp and recorder ID."""

from __future__ import annotations

import argparse
import asyncio
import subprocess
import sys
from pathlib import Path

from services.settings import TORTOISE_ORM
from tortoise import Tortoise

BACKEND_DIR = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = BACKEND_DIR / "database" / "migrations"


async def resolve(selector: str | None):
    await Tortoise.init(config=TORTOISE_ORM)
    try:
        client = Tortoise.get_connection("default")
        rows = await client.execute_query_dict(
            "SELECT id, app, name, applied_at FROM tortoise_migrations "
            "ORDER BY applied_at DESC, id DESC"
        )
    finally:
        await Tortoise.close_connections()
    if not rows:
        raise RuntimeError("No applied migration exists to roll back")

    latest = rows[0]
    if selector and selector not in {str(latest["id"]), latest["name"]}:
        selected = next((row for row in rows if selector in {str(row["id"]), row["name"]}), None)
        if selected:
            raise RuntimeError(
                f"Migration {selector!r} is not latest. Latest is "
                f"id={latest['id']} {latest['app']}.{latest['name']}"
            )
        raise RuntimeError(f"Applied migration not found by ID or name: {selector!r}")

    migration_file = MIGRATIONS_DIR / f"{latest['name']}.py"
    if not migration_file.is_file():
        raise RuntimeError(
            f"Latest applied migration file is missing: {migration_file}. "
            "No schema changes were made. Reset or repair migration history first."
        )
    previous = next((row for row in rows[1:] if row["app"] == latest["app"]), None)
    return latest, previous, migration_file


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("selector", nargs="?", help="Latest migration recorder ID or name")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--fake", action="store_true")
    args = parser.parse_args()
    try:
        latest, previous, migration_file = asyncio.run(resolve(args.selector))
    except Exception as exc:
        print(f"Rollback refused: {exc}", file=sys.stderr)
        return 1

    print(
        f"Selected latest migration: id={latest['id']} app={latest['app']} "
        f"name={latest['name']} applied_at={latest['applied_at']}",
        flush=True,
    )
    print(f"Migration file: {migration_file}", flush=True)
    command = [sys.executable, "-m", "tortoise", "-c", "services.settings.TORTOISE_ORM",
               "downgrade", latest["app"]]
    if previous:
        command.append(previous["name"])
    if args.dry_run:
        command.append("--dry-run")
    if args.fake:
        command.append("--fake")
    return subprocess.run(command, cwd=BACKEND_DIR, check=False).returncode


if __name__ == "__main__":
    raise SystemExit(main())

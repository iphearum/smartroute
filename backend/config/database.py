"""Tortoise-ORM configuration (Laravel's `config/database.php`).

Shared by the FastAPI app and the `python -m tortoise` migration CLI that
`python artisan migrate` wraps.
"""

from __future__ import annotations

from config.settings import settings

# The app label MUST stay "models": every applied migration records
# ('models', '000X_...') dependencies and 'app': 'models' options, so
# renaming it would orphan migration history on existing databases.
TORTOISE_ORM = {
    "connections": {"default": settings.database_url},
    "apps": {
        "models": {
            "models": ["app.models"],
            "default_connection": "default",
            "migrations": "database.migrations",
        }
    },
    "use_tz": True,
    "timezone": "UTC",
}

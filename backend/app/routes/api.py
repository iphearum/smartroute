"""Route registration (Laravel's `routes/api.php`).

Each domain owns a module in this package; this file only mounts them, so
"which routers exist" is answerable from one short list.
"""

from __future__ import annotations

from fastapi import FastAPI

from app.routes.auth import auth
from app.routes.commerce import commerce


def register_routes(app: FastAPI) -> None:
    """Mount every router onto the application."""
    app.include_router(auth)
    app.include_router(commerce)

    # Not yet migrated to controllers. Imported here rather than at module
    # scope because these pull in heavy routing/geo dependencies that would
    # otherwise slow every `app.routes` import, including in tests that only
    # need the migrated slices.
    from api.graph_routes import router as graph_router
    from api.map_catalog import router as map_catalog_router

    app.include_router(graph_router)
    app.include_router(map_catalog_router)

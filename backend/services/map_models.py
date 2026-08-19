"""Back-compat shim. Models now live in `app/models/` (see that package's
docstring for why the Tortoise app label is still "models").

Existing callers importing `services.map_models` keep working while the
remaining services are migrated slice by slice; new code should import from
`app.models` directly. Delete this file once nothing imports it.
"""

from __future__ import annotations

from app.models import *  # noqa: F401,F403
from app.models import __all__ as __all__  # noqa: PLC0414

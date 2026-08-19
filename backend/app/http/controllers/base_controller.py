"""Controller base and response mixin -- the Python equivalent of
`BaseController extends Controller { use ResponseTrait; public $service; }`
in the reference screenshots.

PHP traits become mixin classes here. `ResponseMixin` supplies the shared
JSON envelope and the domain-exception -> HTTP-status mapping, so each
controller stops re-implementing its own `_error()` helper (the current
`api/auth.py` and `api/commerce.py` each carry a near-identical copy).
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from fastapi import HTTPException, Request
from tortoise.exceptions import IntegrityError

from app.services.base_service import BaseService

TService = TypeVar("TService", bound=BaseService)


class ResponseMixin:
    """Shared response helpers and exception translation."""

    #: Message used when an IntegrityError surfaces; override per controller
    #: so users get "email already registered" rather than a generic string.
    conflict_message: str = "A record with these identifiers already exists"

    @staticmethod
    def ok(data: Any = None, **extra: Any) -> dict:
        return {"status": "success", "data": data, **extra}

    def error(self, exc: Exception) -> HTTPException:
        """Map a domain exception onto an HTTP status.

        Mirrors the convention already used across this backend: KeyError
        means "not found", IntegrityError means "conflicts with an existing
        row", ValueError means "the request was invalid".
        """
        if isinstance(exc, HTTPException):
            return exc
        if isinstance(exc, KeyError):
            detail = str(exc.args[0]) if exc.args else "Not found"
            return HTTPException(status_code=404, detail=detail)
        if isinstance(exc, IntegrityError):
            return HTTPException(status_code=409, detail=self.conflict_message)
        return HTTPException(status_code=400, detail=str(exc))


class BaseController(ResponseMixin, Generic[TService]):
    """Base for HTTP controllers.

    `service_class` is the controller's counterpart to `public $service` in
    the screenshots. Services here are stateless over the shared Tortoise
    registry, so one instance per controller is created eagerly rather than
    resolved from a container.
    """

    service_class: type[TService] | None = None

    def __init__(self, service: TService | None = None) -> None:
        if service is not None:
            self.service = service
        elif self.service_class is not None:
            self.service = self.service_class()
        else:
            raise TypeError(
                f"{type(self).__name__} must set `service_class` or be passed a service"
            )

    @staticmethod
    def state(request: Request, attribute: str, unavailable: str):
        """Fetch a lifespan-initialized object off `app.state`.

        Returns 503 rather than 500 when startup has not populated it, which
        is the honest status for "the dependency is not ready yet".
        """
        value = getattr(request.app.state, attribute, None)
        if value is None:
            raise HTTPException(status_code=503, detail=unavailable)
        return value

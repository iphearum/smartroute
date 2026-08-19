"""Generic service base -- the Python equivalent of the `BaseService`
holding `$model` in the reference screenshots.

    class TodoService(BaseService):
        model = ToDo

A subclass sets `model` once and inherits async CRUD. Everything here is a
thin, honest wrapper over Tortoise's queryset API: the value is a consistent
call surface and shared not-found semantics across services, not hiding the
ORM. Any query the ORM expresses better is written directly in the subclass.

`KeyError` is raised for "row does not exist" so controllers can map it to a
404 in one place, matching the convention already used across this backend.
"""

from __future__ import annotations

from typing import Any, ClassVar, Generic, TypeVar

from tortoise.models import Model

TModel = TypeVar("TModel", bound=Model)


class BaseService(Generic[TModel]):
    #: Tortoise model this service operates on. Subclasses must set it.
    model: ClassVar[type[Model]]

    def __init__(self, model: type[TModel] | None = None) -> None:
        # Constructor injection mirrors `__construct(ToDo $todo)` in the
        # screenshots; the class attribute is the common case.
        if model is not None:
            self.model = model
        if getattr(self, "model", None) is None:
            raise TypeError(f"{type(self).__name__} must define a `model`")

    @property
    def not_found_message(self) -> str:
        return f"{self.model.__name__} not found"

    async def create(self, **attributes: Any) -> TModel:
        return await self.model.create(**attributes)

    async def find(self, pk: Any) -> TModel | None:
        return await self.model.get_or_none(pk=pk)

    async def find_or_fail(self, pk: Any) -> TModel:
        instance = await self.find(pk)
        if instance is None:
            raise KeyError(self.not_found_message)
        return instance

    async def first_where(self, **filters: Any) -> TModel | None:
        return await self.model.filter(**filters).first()

    async def all(self, *, order_by: str = "id", limit: int | None = None,
                  offset: int = 0, **filters: Any) -> list[TModel]:
        query = self.model.filter(**filters).order_by(order_by)
        if offset:
            query = query.offset(offset)
        if limit is not None:
            query = query.limit(limit)
        return await query

    async def values(self, *fields: str, order_by: str = "id",
                     **filters: Any) -> list[dict]:
        return await self.model.filter(**filters).order_by(order_by).values(*fields)

    async def exists(self, **filters: Any) -> bool:
        return await self.model.filter(**filters).exists()

    async def count(self, **filters: Any) -> int:
        return await self.model.filter(**filters).count()

    async def update(self, pk: Any, **attributes: Any) -> TModel:
        """Update only the attributes passed.

        `None` is a legitimate value for nullable columns, so callers control
        what gets written by choosing what to pass -- this does not silently
        drop `None`s the way a `if value is not None` filter would.
        """
        instance = await self.find_or_fail(pk)
        for field, value in attributes.items():
            setattr(instance, field, value)
        await instance.save()
        return instance

    async def delete(self, pk: Any) -> None:
        instance = await self.find_or_fail(pk)
        await instance.delete()

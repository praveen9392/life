"""The generic, ownership-scoped repository base class.

This is the structural piece that makes the ownership-enforcement pattern
(see ARCHITECTURE.md §2 "Authentication vs. Authorization") possible: every
owned-entity repository inherits from `BaseRepository` and every read/update/
delete path is scoped by `user_id` *inside the query itself* - there is no
code path that fetches a row by ID alone and checks ownership afterward.

Services must never accept a `user_id` from client input; it always comes
from `current_user.id` (see `api/deps.py::get_current_user`).
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Generic, Protocol, TypeVar, runtime_checkable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select


@runtime_checkable
class OwnedEntity(Protocol):
    """The structural shape every ownership-scoped ORM model satisfies (see
    `UUIDPkMixin`/`OwnedMixin` in `app/models/mixins.py`).

    Declared as read-only properties (not plain attributes) because SQLAlchemy
    `Mapped`/`declared_attr` columns are visible to mypy as read-only
    descriptors - a settable-variable protocol member would reject every model
    whose `user_id` comes from `OwnedMixin.declared_attr`.

    `deleted_at` (from `SoftDeleteMixin`) is deliberately *not* part of this
    protocol since only some owned models use soft-delete - that check stays
    a dynamic `getattr` in `_base_query` below rather than a static bound.
    """

    @property
    def id(self) -> Any: ...

    @property
    def user_id(self) -> Any: ...


ModelT = TypeVar("ModelT", bound=OwnedEntity)


class BaseRepository(Generic[ModelT]):
    """CRUD helpers scoped to a single owning user for a given ORM model."""

    model: type[ModelT]

    def __init__(self, session: AsyncSession):
        self.session = session

    def _base_query(self, user_id: uuid.UUID) -> Select:
        # getattr (not attribute access): through `type[ModelT]` the protocol
        # properties resolve to descriptors, and mypy types the comparison as
        # `bool` instead of a SQLAlchemy ColumnElement - getattr keeps it Any.
        query = select(self.model).where(
            getattr(self.model, "user_id") == user_id  # noqa: B009 - mypy workaround, see above
        )
        deleted_at = getattr(self.model, "deleted_at", None)
        if deleted_at is not None:
            query = query.where(deleted_at.is_(None))
        return query

    async def get_owned_query(self, entity_id: uuid.UUID, user_id: uuid.UUID) -> ModelT | None:
        """Fetch a single row only if it belongs to `user_id`; None covers both a missing and a
        foreign row (callers must not distinguish the two - both surface as a 404, never a 403).
        """
        query = self._base_query(user_id).where(
            getattr(self.model, "id") == entity_id  # noqa: B009 - mypy workaround, see _base_query
        )
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def list_owned_query(
        self,
        user_id: uuid.UUID,
        *,
        offset: int = 0,
        limit: int = 20,
        order_by: Any = None,
    ) -> tuple[list[ModelT], int]:
        """Return a (page of rows, total count) tuple, both scoped to `user_id`."""
        query = self._base_query(user_id)
        if order_by is not None:
            query = query.order_by(order_by)

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()

        page_query = query.offset(offset).limit(limit)
        rows = (await self.session.execute(page_query)).scalars().all()
        return list(rows), total

    async def create_owned_query(self, user_id: uuid.UUID, **fields: Any) -> ModelT:
        """Create a new row, forcing `user_id` to the authenticated owner."""
        # `ModelT` is bound to the `OwnedEntity` *protocol* (for the attribute
        # access above), not to a concrete declarative class, so mypy can't see
        # the SQLAlchemy-generated `__init__(**mapped_columns)` signature here.
        entity = self.model(user_id=user_id, **fields)  # type: ignore[call-arg]
        self.session.add(entity)
        await self.session.flush()
        return entity

    async def update_owned_query(
        self, entity_id: uuid.UUID, user_id: uuid.UUID, **fields: Any
    ) -> ModelT | None:
        """Apply `fields` to an owned row and return it refreshed, or None if not found/owned."""
        entity = await self.get_owned_query(entity_id, user_id)
        if entity is None:
            return None
        for key, value in fields.items():
            setattr(entity, key, value)
        await self.session.flush()
        # Server-managed columns (e.g. `updated_at` onupdate) expire on flush;
        # refresh eagerly so callers never trigger a lazy load in async code.
        await self.session.refresh(entity)
        return entity

    async def delete_owned_query(self, entity_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        """Delete (or soft-delete, if the model supports it) an owned row; returns False if the
        row doesn't exist or belongs to another user.
        """
        entity = await self.get_owned_query(entity_id, user_id)
        if entity is None:
            return False
        if hasattr(entity, "deleted_at"):
            # setattr (not attribute access): `deleted_at` is deliberately not
            # part of the OwnedEntity protocol (only Task/Note soft-delete),
            # so static checkers can't see it on the bounded type.
            setattr(entity, "deleted_at", datetime.now(UTC))  # noqa: B010 - mypy/pyright workaround, see above
        else:
            await self.session.delete(entity)
        await self.session.flush()
        return True

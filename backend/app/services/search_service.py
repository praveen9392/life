"""Global search - one endpoint across every owned entity type.

Uses case-insensitive ILIKE matching (wildcards escaped) on every type; every query is ownership-scoped and the result is grouped
by entity type with per-type caps so one hot module can't starve others.
"""

import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.core.exceptions import ServiceError
from app.core.logging import logger
from app.models.goal import Goal
from app.models.habit import Habit
from app.models.learning import Course, LearningItem
from app.models.note import Note
from app.models.task import Task
from app.schemas.search import SearchResponse, SearchResultItem
from app.utils.sql import escape_like

PER_TYPE_LIMIT = 10
MAX_QUERY_LENGTH = 200


class SearchService:
    """Global search across every owned entity type."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session

    async def search(self, user_id: uuid.UUID, query: str) -> SearchResponse:
        """Search the user's tasks, notes, habits, goals, items, and courses.

        The query is trimmed, capped to MAX_QUERY_LENGTH, and escaped for a
        case-insensitive ILIKE match; results are grouped by entity type with
        a per-type cap so one hot module can't starve others.

        Args:
            user_id: Owner the results must belong to.
            query: Raw search text.

        Returns:
            SearchResponse: Non-empty per-type result groups and the total
            match count.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting global search | user_id={user_id}")
            pattern = f"%{escape_like(query.strip()[:MAX_QUERY_LENGTH])}%"
            results: dict[str, list[SearchResultItem]] = {}

            for entity_type, items in (
                ("tasks", await self._search_tasks(user_id, pattern)),
                ("notes", await self._search_notes(user_id, pattern)),
                ("habits", await self._ilike(user_id, Habit, "name", pattern)),
                ("goals", await self._ilike(user_id, Goal, "title", pattern)),
                ("learning_items", await self._ilike(user_id, LearningItem, "title", pattern)),
                ("courses", await self._ilike(user_id, Course, "title", pattern)),
            ):
                if items:
                    results[entity_type] = items

            total = sum(len(v) for v in results.values())
            logger.info(f"Search returned {total} results for user {user_id}")
            return SearchResponse(query=query, results=results, total=total)
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while searching: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while searching: {exc}")
            raise ServiceError("Unexpected error while searching") from exc

    async def _search_tasks(self, user_id: uuid.UUID, pattern: str) -> list[SearchResultItem]:
        """Search the user's non-deleted task titles and descriptions.

        Args:
            user_id: Owner the tasks must belong to.
            pattern: Escaped ILIKE pattern with wildcards.

        Returns:
            list[SearchResultItem]: Up to PER_TYPE_LIMIT matches, with the
            description as snippet.
        """
        logger.debug(f"Starting _search_tasks | user_id={user_id}")
        stmt = (
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.is_recurring_template.is_(False),
                or_(Task.title.ilike(pattern, escape="\\"), Task.description.ilike(pattern, escape="\\")),
            )
            .limit(PER_TYPE_LIMIT)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        logger.debug(f"Task search completed | user_id={user_id} matches={len(rows)}")
        return [
            SearchResultItem(
                entity_type="task", id=task.id, title=task.title, snippet=task.description
            )
            for task in rows
        ]

    async def _search_notes(self, user_id: uuid.UUID, pattern: str) -> list[SearchResultItem]:
        """Search the user's non-trashed note titles and content.

        Args:
            user_id: Owner the notes must belong to.
            pattern: Escaped ILIKE pattern with wildcards.

        Returns:
            list[SearchResultItem]: Up to PER_TYPE_LIMIT matches, with the
            first 200 content characters as snippet.
        """
        logger.debug(f"Starting _search_notes | user_id={user_id}")
        stmt = (
            select(Note)
            .where(
                Note.user_id == user_id,
                Note.deleted_at.is_(None),
                or_(Note.title.ilike(pattern, escape="\\"), Note.content.ilike(pattern, escape="\\")),
            )
            .limit(PER_TYPE_LIMIT)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        logger.debug(f"Note search completed | user_id={user_id} matches={len(rows)}")
        return [
            SearchResultItem(
                entity_type="note",
                id=note.id,
                title=note.title,
                snippet=(note.content or "")[:200] or None,
            )
            for note in rows
        ]

    async def _ilike(
        self, user_id: uuid.UUID, model: type[Any], column: str, pattern: str
    ) -> list[SearchResultItem]:
        """Search one model's column with a case-insensitive pattern.

        Args:
            user_id: Owner the rows must belong to.
            model: Mapped class to query.
            column: Attribute name to match against.
            pattern: Escaped ILIKE pattern with wildcards.

        Returns:
            list[SearchResultItem]: Up to PER_TYPE_LIMIT matches; soft-deleted
            rows are excluded when the model has `deleted_at`.
        """
        logger.debug(f"Starting _ilike | user_id={user_id} model={model.__name__} column={column}")
        attr = getattr(model, column)
        stmt: Select[Any] = (
            select(model)
            .where(model.user_id == user_id, attr.ilike(pattern, escape="\\"))
            .limit(PER_TYPE_LIMIT)
        )
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        rows = (await self.session.execute(stmt)).scalars().all()
        logger.debug(f"Entity search completed | user_id={user_id} model={model.__name__} matches={len(rows)}")
        return [
            SearchResultItem(entity_type=model.__tablename__, id=row.id, title=getattr(row, column))
            for row in rows
        ]

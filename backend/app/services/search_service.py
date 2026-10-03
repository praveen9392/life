"""Global search - one endpoint across every owned entity type.

Uses Postgres full-text search where a tsvector exists (tasks, notes) and
ILIKE elsewhere; every query is ownership-scoped and the result is grouped
by entity type with per-type caps so one hot module can't starve others.
"""

import uuid
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models.goal import Goal
from app.models.habit import Habit
from app.models.learning import Course, LearningItem
from app.models.note import Note
from app.models.task import Task
from app.schemas.search import SearchResponse, SearchResultItem

PER_TYPE_LIMIT = 10
MAX_QUERY_LENGTH = 200


class SearchService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def search(self, user_id: uuid.UUID, query: str) -> SearchResponse:
        pattern = f"%{query.strip()[:MAX_QUERY_LENGTH]}%"
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

        return SearchResponse(
            query=query, results=results, total=sum(len(v) for v in results.values())
        )

    async def _search_tasks(self, user_id: uuid.UUID, pattern: str) -> list[SearchResultItem]:
        stmt = (
            select(Task)
            .where(
                Task.user_id == user_id,
                Task.deleted_at.is_(None),
                Task.is_recurring_template.is_(False),
                or_(Task.title.ilike(pattern), Task.description.ilike(pattern)),
            )
            .limit(PER_TYPE_LIMIT)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return [
            SearchResultItem(
                entity_type="task", id=task.id, title=task.title, snippet=task.description
            )
            for task in rows
        ]

    async def _search_notes(self, user_id: uuid.UUID, pattern: str) -> list[SearchResultItem]:
        stmt = (
            select(Note)
            .where(
                Note.user_id == user_id,
                Note.deleted_at.is_(None),
                or_(Note.title.ilike(pattern), Note.content.ilike(pattern)),
            )
            .limit(PER_TYPE_LIMIT)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
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
        attr = getattr(model, column)
        stmt: Select[Any] = (
            select(model)
            .where(model.user_id == user_id, attr.ilike(pattern))
            .limit(PER_TYPE_LIMIT)
        )
        if hasattr(model, "deleted_at"):
            stmt = stmt.where(model.deleted_at.is_(None))
        rows = (await self.session.execute(stmt)).scalars().all()
        return [
            SearchResultItem(entity_type=model.__tablename__, id=row.id, title=getattr(row, column))
            for row in rows
        ]

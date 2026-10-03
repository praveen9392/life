"""Privacy service: full data export and account deletion.

Export returns a JSON-serializable snapshot of everything the user owns.
Deletion removes the user row - ON DELETE CASCADE takes every owned row
with it; the user's *custom exercises* (FK is SET NULL by design) are
deleted explicitly first so no user-created content lingers in the
shared catalog.
"""

import enum
import uuid
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select
from sqlalchemy.sql.elements import ColumnElement

from app.models.goal import Goal, GoalMilestone
from app.models.habit import Habit, HabitLog
from app.models.health import HealthMetric
from app.models.learning import Course, CourseLesson, CourseModule, LearningItem, LearningSession
from app.models.note import Note
from app.models.notification import Notification
from app.models.tag import Tag
from app.models.task import Task
from app.models.user import RefreshToken, User
from app.models.workout import Exercise, Workout, WorkoutSession, WorkoutSet


def _serialize(value: Any) -> Any:
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: _serialize(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_serialize(item) for item in value]
    return value


def _row_to_dict(row: object) -> dict[str, Any]:
    """Serialize a mapped row by *column* name (attribute names can differ
    from column names, e.g. Task.task_list -> column `list`)."""
    mapper = row.__mapper__  # type: ignore[attr-defined]
    return {
        prop.columns[0].name: _serialize(getattr(row, prop.key))
        for prop in mapper.column_attrs
    }


class PrivacyService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def export_user_data(self, user: User) -> dict[str, Any]:
        """A complete JSON-serializable snapshot of the user's data."""
        user_id = user.id

        async def all_of(
            model: type[Any], *filters: ColumnElement[bool]
        ) -> list[dict[str, Any]]:
            stmt: Select[Any] = select(model)
            for clause in filters:
                stmt = stmt.where(clause)
            rows = (await self.session.execute(stmt)).scalars().all()
            return [_row_to_dict(row) for row in rows]

        # Entity ids are needed to pull children without user_id (sets,
        # modules, lessons, milestones, habit logs have user_id anyway).
        course_ids = [
            row[0]
            for row in await self.session.execute(
                select(Course.id).where(Course.user_id == user_id)
            )
        ]
        module_ids = (
            [
                row[0]
                for row in await self.session.execute(
                    select(CourseModule.id).where(CourseModule.course_id.in_(course_ids))
                )
            ]
            if course_ids
            else []
        )
        session_ids = [
            row[0]
            for row in await self.session.execute(
                select(WorkoutSession.id).where(WorkoutSession.user_id == user_id)
            )
        ]
        goal_ids = [
            row[0]
            for row in await self.session.execute(
                select(Goal.id).where(Goal.user_id == user_id)
            )
        ]

        profile = _row_to_dict(user)
        profile.pop("hashed_password", None)  # never export credentials material

        return {
            "exported_at": datetime.now(UTC).isoformat(),
            "profile": profile,
            "tasks": await all_of(Task, Task.user_id == user_id),
            "habits": await all_of(Habit, Habit.user_id == user_id),
            "habit_logs": await all_of(HabitLog, HabitLog.user_id == user_id),
            "notes": await all_of(Note, Note.user_id == user_id),
            "health_metrics": await all_of(HealthMetric, HealthMetric.user_id == user_id),
            "custom_exercises": await all_of(Exercise, Exercise.user_id == user_id),
            "workouts": await all_of(Workout, Workout.user_id == user_id),
            "workout_sessions": await all_of(WorkoutSession, WorkoutSession.user_id == user_id),
            "workout_sets": await all_of(
                WorkoutSet, WorkoutSet.workout_session_id.in_(session_ids)
            ) if session_ids else [],
            "learning_items": await all_of(LearningItem, LearningItem.user_id == user_id),
            "courses": await all_of(Course, Course.user_id == user_id),
            "course_modules": await all_of(
                CourseModule, CourseModule.course_id.in_(course_ids)
            ) if course_ids else [],
            "course_lessons": await all_of(
                CourseLesson, CourseLesson.module_id.in_(module_ids)
            ) if module_ids else [],
            "learning_sessions": await all_of(LearningSession, LearningSession.user_id == user_id),
            "goals": await all_of(Goal, Goal.user_id == user_id),
            "goal_milestones": await all_of(
                GoalMilestone, GoalMilestone.goal_id.in_(goal_ids)
            ) if goal_ids else [],
            "notifications": await all_of(Notification, Notification.user_id == user_id),
            "tags": await all_of(Tag, Tag.user_id == user_id),
        }

    async def delete_account(self, user_id: uuid.UUID) -> None:
        """Permanently delete the account and every owned row."""
        # Custom exercises become shared catalog rows on user delete
        # (SET NULL) - remove them explicitly for a true privacy delete.
        await self.session.execute(delete(Exercise).where(Exercise.user_id == user_id))
        # Every other owned table cascades via the user FK.
        await self.session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
        await self.session.execute(delete(User).where(User.id == user_id))
        await self.session.flush()

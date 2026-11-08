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

from sqlalchemy import delete
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from app.core.exceptions import ServiceError, UnauthorizedError
from app.core.logging import logger
from app.core.security import verify_password
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
from app.repositories.export_repository import ExportRepository


def _serialize(value: Any) -> Any:
    """Convert a value into a JSON-serializable primitive.

    Args:
        value: Any value from a mapped row (enum, date/time, UUID, Decimal,
        dict, list, or plain scalar).

    Returns:
        Any: The JSON-safe equivalent - enums to their value, dates/times to
        ISO strings, UUIDs to str, Decimals to float; dicts and lists are
        converted recursively, anything else passes through unchanged.
    """
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
    """Serialize a mapped row into a column-keyed dictionary.

    Args:
        row: ORM instance to serialize.

    Returns:
        dict[str, Any]: Column-name -> JSON-serializable value mapping. Uses
        *column* names because attribute names can differ from column names
        (e.g. Task.task_list -> column `list`).
    """
    mapper = row.__mapper__  # type: ignore[attr-defined]
    return {
        prop.columns[0].name: _serialize(getattr(row, prop.key))
        for prop in mapper.column_attrs
    }


class PrivacyService:
    """Full data export and account deletion (GDPR-style)."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.export = ExportRepository(session)

    async def _rows(
        self, model: type[Any], *filters: ColumnElement[bool]
    ) -> list[dict[str, Any]]:
        """Fetch rows for a model and serialize them to dictionaries.

        Args:
            model: Mapped class to query.
            *filters: Additional WHERE predicates (e.g. the ownership scope).

        Returns:
            list[dict[str, Any]]: One column-keyed dictionary per row.
        """
        return [_row_to_dict(row) for row in await self.export.fetch_rows_query(model, *filters)]

    async def _owned_tables(self, user_id: uuid.UUID) -> dict[str, list[dict[str, Any]]]:
        """Export every table carrying a direct user_id column for the user.

        Args:
            user_id: Owner of the rows.

        Returns:
            dict[str, list[dict[str, Any]]]: Table name -> serialized rows.
        """
        logger.debug(f"Starting _owned_tables | user_id={user_id}")
        owned: dict[str, Any] = {
            "tasks": Task,
            "habits": Habit,
            "habit_logs": HabitLog,
            "notes": Note,
            "health_metrics": HealthMetric,
            "custom_exercises": Exercise,
            "workouts": Workout,
            "workout_sessions": WorkoutSession,
            "learning_items": LearningItem,
            "courses": Course,
            "learning_sessions": LearningSession,
            "goals": Goal,
            "notifications": Notification,
            "tags": Tag,
        }
        result = {name: await self._rows(model, model.user_id == user_id) for name, model in owned.items()}
        logger.debug(f"Owned tables exported | user_id={user_id} tables={len(result)}")
        return result

    async def _child_tables(self, user_id: uuid.UUID) -> dict[str, list[dict[str, Any]]]:
        """Export child tables that have no user_id, reached via owned parents.

        Args:
            user_id: Owner used to resolve the parent ids (courses, workout
            sessions, goals).

        Returns:
            dict[str, list[dict[str, Any]]]: Table name -> serialized rows;
            tables whose parent id list is empty map to empty lists.
        """
        logger.debug(f"Starting _child_tables | user_id={user_id}")
        course_ids = await self.export.course_ids_query(user_id)
        module_ids = await self.export.module_ids_query(course_ids)
        session_ids = await self.export.workout_session_ids_query(user_id)
        goal_ids = await self.export.goal_ids_query(user_id)
        result = {
            "workout_sets": await self._rows(WorkoutSet, WorkoutSet.workout_session_id.in_(session_ids))
            if session_ids
            else [],
            "course_modules": await self._rows(CourseModule, CourseModule.course_id.in_(course_ids))
            if course_ids
            else [],
            "course_lessons": await self._rows(CourseLesson, CourseLesson.module_id.in_(module_ids))
            if module_ids
            else [],
            "goal_milestones": await self._rows(GoalMilestone, GoalMilestone.goal_id.in_(goal_ids))
            if goal_ids
            else [],
        }
        logger.debug(
            f"Child tables exported | user_id={user_id} rows={sum(len(rows) for rows in result.values())}"
        )
        return result

    async def export_user_data(self, user: User) -> dict[str, Any]:
        """Build a complete JSON-serializable snapshot of the user's data.

        The profile is included with `hashed_password` removed - credential
        material is never exported.

        Args:
            user: Authenticated user whose data is exported.

        Returns:
            dict[str, Any]: Export timestamp, profile, and every owned/child
            table keyed by table name.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting data export | user_id={user.id}")
            profile = _row_to_dict(user)
            profile.pop("hashed_password", None)  # never export credentials material
            owned_tables = await self._owned_tables(user.id)
            child_tables = await self._child_tables(user.id)
            logger.info(
                f"Data exported for user {user.id} | tables={len(owned_tables) + len(child_tables)}"
            )
            return {
                "exported_at": datetime.now(UTC).isoformat(),
                "profile": profile,
                **owned_tables,
                **child_tables,
            }
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while exporting the user data: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while exporting the user data: {exc}")
            raise ServiceError("Unexpected error while exporting the user data") from exc

    async def delete_account(self, user: User, password: str) -> None:
        """Verify the password, then permanently delete the account and every owned row.

        Custom exercises (whose FK is SET NULL by design) are deleted
        explicitly first so no user-created content lingers in the shared
        catalog; avatar cleanup is best-effort and never fatal.

        Args:
            user: Authenticated user deleting their account.
            password: Plaintext password verified against the stored hash.

        Raises:
            UnauthorizedError: If the password is incorrect.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting account deletion | user_id={user.id}")
            if not verify_password(password, user.hashed_password):
                logger.warning(f"account_deletion_rejected_wrong_password | user_id={user.id}")
                raise UnauthorizedError("Current password is incorrect")
            user_id = user.id
            # Custom exercises become shared catalog rows on user delete
            # (SET NULL) - remove them explicitly for a true privacy delete.
            logger.debug(f"Deleting custom exercises, refresh tokens, and user row | user_id={user_id}")
            await self.session.execute(delete(Exercise).where(Exercise.user_id == user_id))
            # Every other owned table cascades via the user FK.
            await self.session.execute(delete(RefreshToken).where(RefreshToken.user_id == user_id))
            await self.session.execute(delete(User).where(User.id == user_id))
            await self.session.flush()
            logger.info(f"account_deleted | user_id={user_id}")

            # Best-effort: purge the user's avatar objects so no personal file
            # lingers at a public URL after "permanent" deletion. Storage is
            # optional infra - a failure here is logged, never fatal.
            try:
                from app.services.storage_service import StorageService

                logger.debug(f"Deleting stored avatar objects | user_id={user_id}")
                await StorageService().delete_user_avatars_async(user_id)
            except Exception as exc:  # noqa: BLE001 - deletion must not fail on storage
                logger.warning(f"avatar_cleanup_failed | user_id={user_id} | error_type={type(exc).__name__}")
        except UnauthorizedError:
            logger.error(f"Account deletion failed: password verification failed | user_id={user.id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the account: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the account: {exc}")
            raise ServiceError("Unexpected error while deleting the account") from exc

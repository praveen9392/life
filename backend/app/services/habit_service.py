"""Habit business logic: due evaluation, log upserts, streaks."""

import uuid
from datetime import date

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError
from app.core.logging import logger
from app.models.habit import Habit, HabitLog
from app.repositories.habit_repository import HabitRepository
from app.schemas.habit import HabitCreateRequest, HabitLogRequest, HabitUpdateRequest
from app.utils.enums import HabitFrequencyType
from app.utils.recurrence import is_habit_due
from app.utils.streaks import calculate_streak


class HabitService:
    """Habit CRUD, daily log upserts, streaks, and due-day evaluation."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.habits = HabitRepository(session)

    async def create_habit(self, user_id: uuid.UUID, payload: HabitCreateRequest) -> Habit:
        """Create a habit for the user.

        Args:
            user_id: Owner of the habit.
            payload: Field values, including the typed frequency config
                (serialized with None values excluded).

        Returns:
            Habit: The created habit.
        """
        logger.info(f"Starting habit creation | user_id={user_id}")
        fields = payload.model_dump()
        fields["frequency_config"] = payload.frequency_config.model_dump(exclude_none=True)
        logger.debug(f"Creating habit | user_id={user_id}")
        created_habit = await self.habits.create_owned_query(user_id, **fields)
        logger.info(f"Habit created with id: {created_habit.id}")
        return created_habit

    async def get_habit(self, user_id: uuid.UUID, habit_id: uuid.UUID) -> Habit:
        """Fetch one habit owned by the user.

        Args:
            user_id: Owner the habit must belong to.
            habit_id: Primary key of the habit.

        Returns:
            Habit: The owned habit.

        Raises:
            NotFoundError: If the habit does not exist or belongs to another user.
        """
        logger.info(f"Starting habit retrieval | user_id={user_id} habit_id={habit_id}")
        habit = await self.habits.get_owned_query(habit_id, user_id)
        if habit is None:
            logger.warning(f"Habit not found with id: {habit_id}")
            raise NotFoundError("Habit not found")
        logger.debug(f"Habit retrieval completed | user_id={user_id} habit_id={habit_id}")
        return habit

    async def list_habits(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Habit]:
        """List the user's active habits, paginated.

        Args:
            user_id: Owner of the habits.
            offset: Number of records to skip for pagination (default 0).
            limit: Maximum number of records to return (default 100).

        Returns:
            list[Habit]: The user's active habits in the requested window.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting habit listing | user_id={user_id}")
            active_habits = await self.habits.list_active_query(user_id, offset=offset, limit=limit)
            logger.info(f"Successfully retrieved {len(active_habits)} habits")
            return active_habits
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the habits: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the habits: {exc}")
            raise ServiceError("Unexpected error while listing the habits") from exc

    async def update_habit(
        self, user_id: uuid.UUID, habit_id: uuid.UUID, payload: HabitUpdateRequest
    ) -> Habit:
        """Partially update an owned habit.

        Args:
            user_id: Owner the habit must belong to.
            habit_id: Primary key of the habit.
            payload: Fields to change; a new `frequency_config` is
                re-serialized with None values excluded.

        Returns:
            Habit: The refreshed habit.

        Raises:
            NotFoundError: If the habit does not exist or belongs to another user.
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting habit update | user_id={user_id} habit_id={habit_id}")
            habit = await self.get_habit(user_id, habit_id)
            changes = payload.model_dump(exclude_unset=True)
            if "frequency_config" in changes and changes["frequency_config"] is not None:
                changes["frequency_config"] = payload.frequency_config.model_dump(  # type: ignore[union-attr]
                    exclude_none=True
                )
            logger.debug(f"Applying habit update | habit_id={habit_id}")
            for key, value in changes.items():
                setattr(habit, key, value)
            await self.session.flush()
            await self.session.refresh(habit)
            logger.info(f"Habit updated | id={habit_id}")
            return habit
        except NotFoundError:
            logger.error(f"Habit update failed: habit not found | habit_id={habit_id}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the habit: {exc}")
            raise ServiceError("Unexpected error while updating the habit") from exc

    async def delete_habit(self, user_id: uuid.UUID, habit_id: uuid.UUID) -> None:
        """Delete a habit owned by the user.

        Args:
            user_id: Owner the habit must belong to.
            habit_id: Primary key of the habit.

        Raises:
            NotFoundError: If the habit does not exist or belongs to another user.
        """
        logger.info(f"Starting habit deletion | user_id={user_id} habit_id={habit_id}")
        deleted = await self.habits.delete_owned_query(habit_id, user_id)
        if not deleted:
            logger.warning(f"Habit not found with id: {habit_id}")
            raise NotFoundError("Habit not found")
        logger.info(f"Habit deleted | id={habit_id}")

    async def upsert_log(
        self, user_id: uuid.UUID, habit_id: uuid.UUID, log_date: date, payload: HabitLogRequest
    ) -> HabitLog:
        """Create or replace the user's habit log for one day.

        Args:
            user_id: Owner the habit must belong to.
            habit_id: Primary key of the habit.
            log_date: Local day the log applies to.
            payload: Log status and optional note.

        Returns:
            HabitLog: The upserted log row.

        Raises:
            NotFoundError: If the habit does not exist or belongs to another user.
        """
        logger.info(f"Starting habit log upsert | user_id={user_id} habit_id={habit_id}")
        await self.get_habit(user_id, habit_id)  # ownership check -> 404
        logger.debug(f"Upserting habit log | user_id={user_id} habit_id={habit_id} log_date={log_date}")
        habit_log = await self.habits.upsert_log_query(
            habit_id, user_id, log_date, payload.status, payload.note
        )
        logger.info(f"Habit log upserted | habit_id={habit_id} log_date={log_date}")
        return habit_log

    async def delete_log(self, user_id: uuid.UUID, habit_id: uuid.UUID, log_date: date) -> None:
        """Delete the user's habit log for one day.

        Args:
            user_id: Owner the habit must belong to.
            habit_id: Primary key of the habit.
            log_date: Local day whose log is removed.

        Raises:
            NotFoundError: If the habit does not exist or belongs to another user.
        """
        logger.info(
            f"Starting habit log deletion | user_id={user_id} habit_id={habit_id} log_date={log_date}"
        )
        await self.get_habit(user_id, habit_id)  # ownership check -> 404
        logger.debug(f"Deleting habit log | user_id={user_id} habit_id={habit_id} log_date={log_date}")
        await self.habits.delete_log_query(habit_id, user_id, log_date)
        logger.info(f"Habit log deleted | habit_id={habit_id} log_date={log_date}")

    async def get_streaks(self, user_id: uuid.UUID, habit_id: uuid.UUID, today: date) -> tuple[int, int]:
        """Compute the habit's current and best streak up to `today`.

        Args:
            user_id: Owner the habit must belong to.
            habit_id: Primary key of the habit.
            today: The user's local today, bounding streak evaluation.

        Returns:
            tuple[int, int]: The current and best streak, in days.

        Raises:
            NotFoundError: If the habit does not exist or belongs to another user.
        """
        logger.info(f"Starting streak computation | user_id={user_id} habit_id={habit_id}")
        habit = await self.get_habit(user_id, habit_id)
        logger.debug(f"Fetching habit logs | user_id={user_id} habit_id={habit_id}")
        logs = await self.habits.list_logs_between_query(user_id, habit.start_date, today, habit_ids=[habit.id])
        logs_by_date = {log.log_date: log.status for log in logs}
        current_streak, best_streak = calculate_streak(logs_by_date, today=today)
        logger.debug(
            f"Streak computation completed | user_id={user_id} habit_id={habit_id} "
            f"current={current_streak} best={best_streak}"
        )
        return current_streak, best_streak

    @staticmethod
    def is_due_today(habit: Habit, today: date) -> bool:
        """Whether the habit is scheduled on the given day.

        Args:
            habit: Habit whose frequency settings are evaluated.
            today: The day to check (the user's local date).

        Returns:
            bool: True when the habit is due on `today`.
        """
        return is_habit_due(
            frequency_type=HabitFrequencyType(habit.frequency_type),
            frequency_config=habit.frequency_config or {},
            start_date=habit.start_date,
            end_date=habit.end_date,
            day=today,
        )

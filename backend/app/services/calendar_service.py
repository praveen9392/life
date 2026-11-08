"""Calendar aggregation - one payload for a date-range grid view.

Every event type is counted per *user-local* day: tasks by due_date, habit
logs by log_date, workouts/learning by their session dates, milestones by
target_date. Range is capped to keep the response bounded.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.logging import logger
from app.repositories.goal_repository import GoalRepository
from app.repositories.habit_repository import HabitRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.analytics import CalendarDayEntry, CalendarResponse
from app.services.habit_service import HabitService
from app.utils.datetime import user_day_bounds_utc
from app.utils.enums import HabitLogStatus, TaskStatus

MAX_RANGE_DAYS = 62  # ~2 months - enough for a month grid incl. edge weeks


class CalendarService:
    """Builds the per-day calendar grid payload for a date range."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.tasks = TaskRepository(session)
        self.habits = HabitRepository(session)
        self.goals = GoalRepository(session)

    async def build_range(
        self, user_id: uuid.UUID, user_timezone: str, start: date, end: date
    ) -> CalendarResponse:
        """Build the per-day calendar grid for a date range.

        Args:
            user_id: Owner of the aggregated data.
            user_timezone: IANA timezone used to bucket timestamps into
                user-local days.
            start: First day of the range (inclusive); swapped with `end`
                when given in reverse order.
            end: Last day of the range (inclusive); capped to
                `start` + MAX_RANGE_DAYS.

        Returns:
            CalendarResponse: One CalendarDayEntry per day with task, habit,
            workout, learning, and milestone counts.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting calendar range build | user_id={user_id} start={start} end={end}")
            if end < start:
                logger.debug(f"Calendar range swapped: start was after end | user_id={user_id}")
                start, end = end, start
            max_end = start + timedelta(days=MAX_RANGE_DAYS)
            if end > max_end:
                logger.debug(f"Calendar range capped to {MAX_RANGE_DAYS} days | user_id={user_id}")
                end = max_end

            logger.debug(f"Fetching habits and habit logs | user_id={user_id}")
            habits = await self.habits.list_active_query(user_id)
            habit_service = HabitService(self.session)
            habit_logs = await self.habits.list_logs_between_query(user_id, start, end)
            logs_by_day: dict[date, int] = {}
            for log in habit_logs:
                if log.status == HabitLogStatus.COMPLETED:
                    logs_by_day[log.log_date] = logs_by_day.get(log.log_date, 0) + 1

            tasks_due_by_day, tasks_done_by_day = await self._tasks_by_day(
                user_id, user_timezone, start, end
            )
            workouts_by_day = await self._workouts_by_day(user_id, user_timezone, start, end)
            learning_by_day = await self._learning_minutes_by_day(user_id, start, end)
            milestones_by_day = await self._milestones_by_day(user_id, start, end)

            days: list[CalendarDayEntry] = []
            day = start
            while day <= end:
                habits_due = sum(1 for habit in habits if habit_service.is_due_today(habit, day))
                days.append(
                    CalendarDayEntry(
                        date=day,
                        tasks_due=tasks_due_by_day.get(day, 0),
                        tasks_completed=tasks_done_by_day.get(day, 0),
                        habits_due=habits_due,
                        habits_completed=logs_by_day.get(day, 0),
                        workout_sessions=workouts_by_day.get(day, 0),
                        learning_minutes=learning_by_day.get(day, 0),
                        milestones_due=milestones_by_day.get(day, 0),
                    )
                )
                day += timedelta(days=1)

            logger.info(f"Calendar range built for user {user_id} | days={len(days)}")
            return CalendarResponse(start_date=start, end_date=end, days=days)
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while building the calendar range: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while building the calendar range: {exc}")
            raise ServiceError("Unexpected error while building the calendar range") from exc

    async def _tasks_by_day(
        self, user_id: uuid.UUID, user_timezone: str, start: date, end: date
    ) -> tuple[dict[date, int], dict[date, int]]:
        """Count tasks due and tasks completed per day in the range.

        Args:
            user_id: Owner of the tasks.
            user_timezone: IANA timezone used to bucket completion timestamps.
            start: First day of the range (inclusive).
            end: Last day of the range (inclusive).

        Returns:
            tuple[dict[date, int], dict[date, int]]: Due counts keyed by
            due_date and completion counts keyed by the user-local date of
            completed_at.
        """
        logger.debug(f"Starting _tasks_by_day | user_id={user_id}")
        from sqlalchemy import func, select

        from app.models.task import Task

        due_query = (
            select(Task.due_date, func.count())
            .where(
                Task.user_id == user_id,
                Task.is_recurring_template.is_(False),
                Task.deleted_at.is_(None),
                Task.due_date >= start,
                Task.due_date <= end,
            )
            .group_by(Task.due_date)
        )
        due_by_day = {row[0]: int(row[1]) for row in (await self.session.execute(due_query)).all()}

        # Completions counted by the user-local date of completed_at.
        start_utc, _ = user_day_bounds_utc(start, user_timezone)
        _, end_utc = user_day_bounds_utc(end + timedelta(days=1), user_timezone)
        done_query = select(Task.completed_at).where(
            Task.user_id == user_id,
            Task.is_recurring_template.is_(False),
            Task.deleted_at.is_(None),
            Task.status == TaskStatus.COMPLETED,
            Task.completed_at >= start_utc,
            Task.completed_at < end_utc,
        )
        done_by_day: dict[date, int] = {}
        from app.utils.datetime import to_user_date

        for (completed_at,) in (await self.session.execute(done_query)).all():
            local_day = to_user_date(completed_at, user_timezone)
            done_by_day[local_day] = done_by_day.get(local_day, 0) + 1
        logger.debug(
            f"Task day buckets computed | user_id={user_id} "
            f"due_days={len(due_by_day)} done_days={len(done_by_day)}"
        )
        return due_by_day, done_by_day

    async def _workouts_by_day(
        self, user_id: uuid.UUID, user_timezone: str, start: date, end: date
    ) -> dict[date, int]:
        """Count workout sessions per user-local day in the range.

        Args:
            user_id: Owner of the sessions.
            user_timezone: IANA timezone used to bucket performed_at timestamps.
            start: First day of the range (inclusive).
            end: Last day of the range (inclusive).

        Returns:
            dict[date, int]: Session counts keyed by the user-local day.
        """
        logger.debug(f"Starting _workouts_by_day | user_id={user_id}")
        from sqlalchemy import select

        from app.models.workout import WorkoutSession
        from app.utils.datetime import to_user_date

        query = select(WorkoutSession.performed_at).where(WorkoutSession.user_id == user_id)
        start_utc, _ = user_day_bounds_utc(start, user_timezone)
        _, end_utc = user_day_bounds_utc(end + timedelta(days=1), user_timezone)
        query = query.where(
            WorkoutSession.performed_at >= start_utc, WorkoutSession.performed_at < end_utc
        )
        by_day: dict[date, int] = {}
        for (performed_at,) in (await self.session.execute(query)).all():
            local_day = to_user_date(performed_at, user_timezone)
            by_day[local_day] = by_day.get(local_day, 0) + 1
        logger.debug(f"Workout day buckets computed | user_id={user_id} days={len(by_day)}")
        return by_day

    async def _learning_minutes_by_day(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> dict[date, int]:
        """Sum learning minutes per day in the range.

        Args:
            user_id: Owner of the sessions.
            start: First day of the range (inclusive).
            end: Last day of the range (inclusive).

        Returns:
            dict[date, int]: Total minutes keyed by session_date.
        """
        logger.debug(f"Starting _learning_minutes_by_day | user_id={user_id}")
        from sqlalchemy import func, select

        from app.models.learning import LearningSession

        query = (
            select(LearningSession.session_date, func.sum(LearningSession.duration_minutes))
            .where(
                LearningSession.user_id == user_id,
                LearningSession.session_date >= start,
                LearningSession.session_date <= end,
            )
            .group_by(LearningSession.session_date)
        )
        learning_by_day = {row[0]: int(row[1]) for row in (await self.session.execute(query)).all()}
        logger.debug(f"Learning day buckets computed | user_id={user_id} days={len(learning_by_day)}")
        return learning_by_day

    async def _milestones_by_day(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> dict[date, int]:
        """Count goal milestones due per day in the range.

        Args:
            user_id: Owner the milestones belong to (joined through their goal).
            start: First day of the range (inclusive).
            end: Last day of the range (inclusive).

        Returns:
            dict[date, int]: Milestone counts keyed by target_date.
        """
        logger.debug(f"Starting _milestones_by_day | user_id={user_id}")
        from sqlalchemy import func, select

        from app.models.goal import Goal, GoalMilestone

        query = (
            select(GoalMilestone.target_date, func.count())
            .join(Goal, GoalMilestone.goal_id == Goal.id)
            .where(
                Goal.user_id == user_id,
                GoalMilestone.target_date >= start,
                GoalMilestone.target_date <= end,
            )
            .group_by(GoalMilestone.target_date)
        )
        milestones_by_day = {row[0]: int(row[1]) for row in (await self.session.execute(query)).all()}
        logger.debug(f"Milestone day buckets computed | user_id={user_id} days={len(milestones_by_day)}")
        return milestones_by_day

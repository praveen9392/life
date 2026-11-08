"""Analytics aggregation - every percentage computed via progress_rules so
dashboard and analytics can never disagree (parity by construction)."""

import uuid
from datetime import date, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.logging import logger
from app.repositories.goal_repository import GoalRepository
from app.repositories.habit_repository import HabitRepository
from app.repositories.learning_repository import LearningSessionRepository
from app.repositories.task_repository import TaskRepository
from app.repositories.workout_repository import WorkoutSessionRepository
from app.schemas.analytics import AnalyticsSummary, HabitRateEntry
from app.services.habit_service import HabitService
from app.services.progress_rules import (
    completion_rate,
    habit_completion_rate,
    period_bounds_for,
    task_completion_rate,
)
from app.utils.datetime import today_for_user
from app.utils.enums import GoalStatus, HabitLogStatus
from app.utils.streaks import calculate_streak


class AnalyticsService:
    """Aggregates cross-module analytics for a user over a calendar period."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.habits = HabitRepository(session)
        self.tasks = TaskRepository(session)
        self.goals = GoalRepository(session)
        self.learning_sessions = LearningSessionRepository(session)
        self.workout_sessions = WorkoutSessionRepository(session)

    async def build_summary(
        self, user_id: uuid.UUID, user_timezone: str, period: str = "week"
    ) -> AnalyticsSummary:
        """Build the analytics summary for a user over a calendar period.

        Args:
            user_id: Owner of the aggregated data.
            user_timezone: IANA timezone used to resolve "today" and the
                period bounds.
            period: Aggregation window: "day", "week", "month", or "year"
                (defaults to "week").

        Returns:
            AnalyticsSummary: Habit/task/learning/workout/goal aggregates for
            the period; the end date is clamped to today so future days are
            never counted as expected.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting analytics summary build | user_id={user_id} period={period}")
            today = today_for_user(user_timezone)
            start, end = period_bounds_for(today, period)
            if end > today:
                end = today  # don't count future days as expected

            habit_entries, total_completed, total_expected, total_neutral, best_streak = (
                await self._habit_rates(user_id, start, end, today)
            )
            logger.debug(f"Fetching task due/completed counts | user_id={user_id}")
            tasks_due = await self.tasks.count_due_between_query(user_id, start, end)
            tasks_completed = await self.tasks.count_completed_between_query(user_id, start, end)

            logger.debug(f"Fetching learning and workout aggregates | user_id={user_id}")
            learning_minutes, learning_sessions = await self.learning_sessions.totals_between_query(
                user_id, start, end
            )
            workout_sessions = await self.workout_sessions.count_between_query(user_id, start, end)
            goals_active, goals_average = await self._goal_progress(user_id)

            summary = AnalyticsSummary(
                period=period,
                start_date=start,
                end_date=end,
                habit_completion_percent=habit_completion_rate(
                    total_completed, total_expected, total_neutral
                ),
                habits=habit_entries,
                tasks_due=tasks_due,
                tasks_completed=tasks_completed,
                task_completion_percent=task_completion_rate(tasks_completed, tasks_due),
                learning_minutes=learning_minutes,
                learning_sessions=learning_sessions,
                workout_sessions=workout_sessions,
                goals_active=goals_active,
                goals_average_progress=goals_average,
                best_current_streak=best_streak,
            )
            logger.info(f"Analytics summary built for user {user_id} | period={period}")
            return summary
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while building the analytics summary: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while building the analytics summary: {exc}")
            raise ServiceError("Unexpected error while building the analytics summary") from exc

    async def _goal_progress(self, user_id: uuid.UUID) -> tuple[int, int]:
        """Compute the active-goal count and their average progress percent.

        Args:
            user_id: Owner of the goals.

        Returns:
            tuple[int, int]: The number of not-started/in-progress goals and
            their average progress percent (0 when there are none).
        """
        logger.debug(f"Starting _goal_progress | user_id={user_id}")
        goals = await self.goals.list_for_user_query(user_id)
        active = [
            goal for goal in goals if goal.status in (GoalStatus.NOT_STARTED, GoalStatus.IN_PROGRESS)
        ]
        average = completion_rate(sum(goal.progress_percent for goal in active), len(active) * 100)
        logger.debug(f"Goal progress computed | user_id={user_id} active={len(active)} average={average}")
        return len(active), average

    async def _habit_rates(
        self, user_id: uuid.UUID, start: date, end: date, today: date
    ) -> tuple[list[HabitRateEntry], int, int, int, int]:
        """Compute per-habit completion entries and period totals.

        Args:
            user_id: Owner of the habits.
            start: First day (inclusive) of the aggregation window.
            end: Last day (inclusive) of the aggregation window.
            today: The user's local today, bounding streak evaluation.

        Returns:
            tuple[list[HabitRateEntry], int, int, int, int]: One rate entry per
            active habit plus the totals (completed, expected, neutral, best
            current streak) across all of them.
        """
        logger.debug(f"Starting _habit_rates | user_id={user_id}")
        habits = await self.habits.list_active_query(user_id)
        habit_service = HabitService(self.session)
        logs = await self.habits.list_logs_between_query(user_id, start, end)
        logs_by_habit: dict[uuid.UUID, dict[date, HabitLogStatus]] = {}
        for log in logs:
            logs_by_habit.setdefault(log.habit_id, {})[log.log_date] = log.status

        # Streaks span each habit's full history, not just the selected period
        # (a streak that began before the window must not be truncated to it).
        streak_start = min((habit.start_date for habit in habits), default=today)
        logger.debug(f"Fetching full-history logs for streaks | user_id={user_id}")
        streak_logs = await self.habits.list_logs_between_query(user_id, streak_start, today)
        streak_logs_by_habit: dict[uuid.UUID, dict[date, HabitLogStatus]] = {}
        for log in streak_logs:
            streak_logs_by_habit.setdefault(log.habit_id, {})[log.log_date] = log.status

        entries: list[HabitRateEntry] = []
        total_completed = 0
        total_expected = 0
        total_neutral = 0  # skipped / not_applicable days
        best_streak = 0

        for habit in habits:
            habit_logs = logs_by_habit.get(habit.id, {})
            expected = 0
            day = start
            while day <= end:
                if habit_service.is_due_today(habit, day):
                    expected += 1
                day += timedelta(days=1)
            completed = sum(1 for s in habit_logs.values() if s == HabitLogStatus.COMPLETED)
            neutral = sum(
                1
                for s in habit_logs.values()
                if s in (HabitLogStatus.SKIPPED, HabitLogStatus.NOT_APPLICABLE)
            )
            completed = min(completed, expected)  # logs on non-due days don't inflate the rate
            total_completed += completed
            total_expected += expected
            total_neutral += neutral
            current, _ = calculate_streak(streak_logs_by_habit.get(habit.id, {}), today=today)
            best_streak = max(best_streak, current)
            entries.append(
                HabitRateEntry(
                    habit_id=str(habit.id),
                    name=habit.name,
                    completed=completed,
                    expected=expected,
                    rate_percent=habit_completion_rate(completed, expected, neutral),
                    current_streak=current,
                )
            )
        logger.debug(f"Habit rates computed | user_id={user_id} habits={len(entries)}")
        return entries, total_completed, total_expected, total_neutral, best_streak

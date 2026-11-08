"""Dashboard aggregation - one efficient payload for the whole dashboard.

All numbers come from `progress_rules` (shared with analytics) and indexed
SQL queries; no per-widget round trips, no browser-side aggregation.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.logging import logger
from app.repositories.habit_repository import HabitRepository
from app.repositories.learning_repository import LearningSessionRepository
from app.repositories.note_repository import NoteRepository
from app.repositories.task_repository import TaskRepository
from app.repositories.workout_repository import WorkoutSessionRepository
from app.schemas.dashboard import DashboardSummary, HabitTodayStatus
from app.schemas.habit import HabitResponse
from app.schemas.task import TaskResponse
from app.services.habit_service import HabitService
from app.services.progress_rules import daily_progress_percent
from app.utils.datetime import today_for_user, week_bounds_for_user
from app.utils.enums import HabitLogStatus, TaskStatus
from app.utils.streaks import calculate_streak


class DashboardService:
    """Builds the single efficient dashboard payload for a user."""

    def __init__(self, session: AsyncSession):
        """Wire the service (and its repositories) to the request's session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.habits = HabitRepository(session)
        self.tasks = TaskRepository(session)
        self.notes = NoteRepository(session)
        self.learning_sessions = LearningSessionRepository(session)
        self.workout_sessions = WorkoutSessionRepository(session)
        self.habit_service = HabitService(session)

    async def build_summary(self, user_id: uuid.UUID, user_timezone: str) -> DashboardSummary:
        """Build the dashboard summary for the user's local today.

        Args:
            user_id: Owner of the aggregated data.
            user_timezone: IANA timezone used to resolve "today" and the
                week bounds.

        Returns:
            DashboardSummary: Today's habit statuses and task lists (today,
            upcoming, overdue), week totals for learning/workouts/notes, and
            the best current streak.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting dashboard summary build | user_id={user_id}")
            today = today_for_user(user_timezone)
            week_start, week_end = week_bounds_for_user(today)

            logger.debug(f"Fetching habits and habit logs | user_id={user_id}")
            habits = await self.habits.list_active_query(user_id)
            habit_service = self.habit_service
            # Streaks must span each habit's full history: bounding the log window
            # to the current week truncates any streak that started in a prior
            # week (a 10-day streak reported <= 7). One query covers every
            # habit's whole logged range; the week map below is a strict subset.
            # End bound is `today` (not week_end) to match get_streak semantics -
            # future-dated logs never count.
            streak_window_start = min((habit.start_date for habit in habits), default=today)
            logs = await self.habits.list_logs_between_query(user_id, streak_window_start, today)

            logs_by_habit_day: dict[uuid.UUID, dict[date, HabitLogStatus]] = {}
            for log in logs:
                logs_by_habit_day.setdefault(log.habit_id, {})[log.log_date] = log.status

            habit_statuses: list[HabitTodayStatus] = []
            habits_completed_today = 0
            habits_due_today = 0
            for habit in habits:
                is_due = habit_service.is_due_today(habit, today)
                status = logs_by_habit_day.get(habit.id, {}).get(today)
                if is_due:
                    habits_due_today += 1
                    if status == HabitLogStatus.COMPLETED:
                        habits_completed_today += 1
                habit_statuses.append(
                    HabitTodayStatus(
                        habit=HabitResponse.model_validate(habit),
                        is_due=is_due,
                        status=status.value if status else None,
                    )
                )

            logger.debug(f"Fetching today, upcoming, and overdue tasks | user_id={user_id}")
            tasks_today, _ = await self.tasks.list_for_user_query(
                user_id, status=None, task_list=None, due_on=today, limit=50
            )
            # Upcoming = future due dates only (today's and overdue have own
            # widgets). `due_from` pushes that predicate into SQL so the 20-row
            # window isn't under-filled by overdue/today rows filtered out after
            # the fact.
            tasks_upcoming, _ = await self.tasks.list_for_user_query(
                user_id,
                status=TaskStatus.PENDING,
                task_list=None,
                due_from=today + timedelta(days=1),
                due_before=today + timedelta(days=7),
                limit=20,
            )
            tasks_overdue = await self.tasks.list_overdue_query(user_id, today, limit=20)

            tasks_due_today = len(tasks_today)
            tasks_completed_today = sum(1 for task in tasks_today if task.status == TaskStatus.COMPLETED)

            best_current_streak = 0
            for habit in habits:
                current, _ = calculate_streak(logs_by_habit_day.get(habit.id, {}), today=today)
                best_current_streak = max(best_current_streak, current)

            logger.debug(f"Fetching learning, workout, and note aggregates | user_id={user_id}")
            learning_minutes, _ = await self.learning_sessions.totals_between_query(
                user_id, week_start, week_end
            )
            workout_count = await self.workout_sessions.count_between_query(user_id, week_start, week_end)
            recent_notes = await self.notes.count_recent_query(user_id, limit=5)

            summary = DashboardSummary(
                today=today,
                habits_completed_today=habits_completed_today,
                habits_due_today=habits_due_today,
                tasks_completed_today=tasks_completed_today,
                tasks_due_today=tasks_due_today,
                daily_progress_percent=daily_progress_percent(
                    habits_completed=habits_completed_today,
                    habits_due=habits_due_today,
                    tasks_completed=tasks_completed_today,
                    tasks_due=tasks_due_today,
                ),
                habits=habit_statuses,
                tasks_today=[TaskResponse.model_validate(task) for task in tasks_today],
                tasks_upcoming=[TaskResponse.model_validate(task) for task in tasks_upcoming],
                tasks_overdue=[TaskResponse.model_validate(task) for task in tasks_overdue],
                recent_notes_count=recent_notes,
                learning_minutes_this_week=learning_minutes,
                workout_sessions_this_week=workout_count,
                best_current_streak=best_current_streak,
            )
            logger.info(f"Dashboard summary built for user {user_id}")
            return summary
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while building the dashboard summary: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while building the dashboard summary: {exc}")
            raise ServiceError("Unexpected error while building the dashboard summary") from exc


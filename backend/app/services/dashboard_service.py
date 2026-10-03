"""Dashboard aggregation - one efficient payload for the whole dashboard.

All numbers come from `progress_rules` (shared with analytics) and indexed
SQL queries; no per-widget round trips, no browser-side aggregation.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.habit_repository import HabitRepository
from app.repositories.note_repository import NoteRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.dashboard import DashboardSummary, HabitTodayStatus
from app.schemas.task import TaskResponse
from app.services.habit_service import HabitService
from app.services.progress_rules import daily_progress_percent
from app.utils.datetime import today_for_user, week_bounds_for_user
from app.utils.enums import HabitLogStatus, TaskStatus
from app.utils.streaks import calculate_streak


class DashboardService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.habits = HabitRepository(session)
        self.tasks = TaskRepository(session)
        self.notes = NoteRepository(session)

    async def build_summary(self, user_id: uuid.UUID, user_timezone: str) -> DashboardSummary:
        today = today_for_user(user_timezone)
        week_start, week_end = week_bounds_for_user(today)

        habits = await self.habits.list_active(user_id)
        habit_service = HabitService(self.session)
        logs = await self.habits.list_logs_between(user_id, week_start, week_end)

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
                    habit=habit,
                    is_due=is_due,
                    status=status.value if status else None,
                )
            )

        tasks_today, _ = await self.tasks.list_for_user(
            user_id, status=None, task_list=None, due_on=today, limit=50
        )
        tasks_upcoming, _ = await self.tasks.list_for_user(
            user_id,
            status=TaskStatus.PENDING,
            task_list=None,
            due_before=today + timedelta(days=7),
            limit=20,
        )
        # Upcoming = future due dates only (today's and overdue have own widgets).
        tasks_upcoming = [
            task for task in tasks_upcoming if task.due_date is not None and task.due_date > today
        ]
        tasks_overdue = await self.tasks.list_overdue(user_id, today, limit=20)

        tasks_due_today = len(tasks_today)
        tasks_completed_today = sum(1 for task in tasks_today if task.status == TaskStatus.COMPLETED)

        best_current_streak = 0
        for habit in habits:
            current, _ = calculate_streak(logs_by_habit_day.get(habit.id, {}), today=today)
            best_current_streak = max(best_current_streak, current)

        learning_minutes = await self._learning_minutes_this_week(user_id, week_start, week_end)
        workout_count = await self._workout_sessions_this_week(user_id, week_start, week_end)
        recent_notes = await self.notes.count_recent(user_id, limit=5)

        return DashboardSummary(
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

    async def _learning_minutes_this_week(
        self, user_id: uuid.UUID, week_start: date, week_end: date
    ) -> int:
        from sqlalchemy import func, select

        from app.models.learning import LearningSession

        query = select(func.coalesce(func.sum(LearningSession.duration_minutes), 0)).where(
            LearningSession.user_id == user_id,
            LearningSession.session_date >= week_start,
            LearningSession.session_date <= week_end,
        )
        return int((await self.session.execute(query)).scalar_one())

    async def _workout_sessions_this_week(
        self, user_id: uuid.UUID, week_start: date, week_end: date
    ) -> int:
        from sqlalchemy import func, select

        from app.models.workout import WorkoutSession

        query = select(func.count()).select_from(WorkoutSession).where(
            WorkoutSession.user_id == user_id,
            func.date(WorkoutSession.performed_at) >= week_start,
            func.date(WorkoutSession.performed_at) <= week_end,
        )
        return int((await self.session.execute(query)).scalar_one())

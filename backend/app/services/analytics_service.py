"""Analytics aggregation - every percentage computed via progress_rules so
dashboard and analytics can never disagree (parity by construction)."""

import uuid
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.goal_repository import GoalRepository
from app.repositories.habit_repository import HabitRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.analytics import AnalyticsSummary, HabitRateEntry
from app.services.habit_service import HabitService
from app.services.progress_rules import (
    completion_rate,
    habit_completion_rate,
    period_bounds_for,
    task_completion_rate,
)
from app.utils.datetime import today_for_user
from app.utils.enums import HabitLogStatus, TaskStatus
from app.utils.streaks import calculate_streak


class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.habits = HabitRepository(session)
        self.tasks = TaskRepository(session)
        self.goals = GoalRepository(session)

    async def build_summary(
        self, user_id: uuid.UUID, user_timezone: str, period: str = "week"
    ) -> AnalyticsSummary:
        today = today_for_user(user_timezone)
        start, end = period_bounds_for(today, period)
        if end > today:
            end = today  # don't count future days as expected

        habits = await self.habits.list_active(user_id)
        habit_service = HabitService(self.session)
        logs = await self.habits.list_logs_between(user_id, start, end)
        logs_by_habit: dict[uuid.UUID, dict[date, HabitLogStatus]] = {}
        for log in logs:
            logs_by_habit.setdefault(log.habit_id, {})[log.log_date] = log.status

        habit_entries: list[HabitRateEntry] = []
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
            current, _ = calculate_streak(habit_logs, today=today)
            best_streak = max(best_streak, current)
            habit_entries.append(
                HabitRateEntry(
                    habit_id=str(habit.id),
                    name=habit.name,
                    completed=completed,
                    expected=expected,
                    rate_percent=habit_completion_rate(completed, expected, neutral),
                    current_streak=current,
                )
            )

        tasks_due = await self.tasks.count_due_between(user_id, start, end)
        tasks_completed = await self.tasks.count_completed_between(user_id, start, end)

        learning_minutes, learning_sessions = await self._learning_totals(user_id, start, end)
        workout_sessions = await self._workout_count(user_id, start, end)

        goals = await self.goals.list_for_user(user_id)
        active_goals = [goal for goal in goals if goal.status.value in ("not_started", "in_progress")]
        goals_average = completion_rate(
            sum(goal.progress_percent for goal in active_goals),
            len(active_goals) * 100,
        )

        return AnalyticsSummary(
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
            goals_active=len(active_goals),
            goals_average_progress=goals_average,
            best_current_streak=best_streak,
        )

    async def _learning_totals(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> tuple[int, int]:
        from sqlalchemy import func, select

        from app.models.learning import LearningSession

        query = select(
            func.coalesce(func.sum(LearningSession.duration_minutes), 0),
            func.count(),
        ).where(
            LearningSession.user_id == user_id,
            LearningSession.session_date >= start,
            LearningSession.session_date <= end,
        )
        row = (await self.session.execute(query)).one()
        return int(row[0]), int(row[1])

    async def _workout_count(self, user_id: uuid.UUID, start: date, end: date) -> int:
        from sqlalchemy import func, select

        from app.models.workout import WorkoutSession

        query = select(func.count()).select_from(WorkoutSession).where(
            WorkoutSession.user_id == user_id,
            func.date(WorkoutSession.performed_at) >= start,
            func.date(WorkoutSession.performed_at) <= end,
        )
        return int((await self.session.execute(query)).scalar_one())


_ = TaskStatus  # kept for future per-status analytics

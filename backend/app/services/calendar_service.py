"""Calendar aggregation - one payload for a date-range grid view.

Every event type is counted per *user-local* day: tasks by due_date, habit
logs by log_date, workouts/learning by their session dates, milestones by
target_date. Range is capped to keep the response bounded.
"""

import uuid
from datetime import date, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.goal_repository import GoalRepository
from app.repositories.habit_repository import HabitRepository
from app.repositories.task_repository import TaskRepository
from app.schemas.analytics import CalendarDayEntry, CalendarResponse
from app.services.habit_service import HabitService
from app.utils.datetime import user_day_bounds_utc
from app.utils.enums import HabitLogStatus, TaskStatus

MAX_RANGE_DAYS = 62  # ~2 months - enough for a month grid incl. edge weeks


class CalendarService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.tasks = TaskRepository(session)
        self.habits = HabitRepository(session)
        self.goals = GoalRepository(session)

    async def build_range(
        self, user_id: uuid.UUID, user_timezone: str, start: date, end: date
    ) -> CalendarResponse:
        if end < start:
            start, end = end, start
        end = min(end, start + timedelta(days=MAX_RANGE_DAYS))

        habits = await self.habits.list_active(user_id)
        habit_service = HabitService(self.session)
        habit_logs = await self.habits.list_logs_between(user_id, start, end)
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

        return CalendarResponse(start_date=start, end_date=end, days=days)

    async def _tasks_by_day(
        self, user_id: uuid.UUID, user_timezone: str, start: date, end: date
    ) -> tuple[dict[date, int], dict[date, int]]:
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
        return due_by_day, done_by_day

    async def _workouts_by_day(
        self, user_id: uuid.UUID, user_timezone: str, start: date, end: date
    ) -> dict[date, int]:
        from sqlalchemy import select

        from app.models.workout import WorkoutSession
        from app.utils.datetime import to_user_date

        query = select(WorkoutSession.performed_at).where(
            WorkoutSession.user_id == user_id
        )
        start_utc, _ = user_day_bounds_utc(start, user_timezone)
        _, end_utc = user_day_bounds_utc(end + timedelta(days=1), user_timezone)
        query = query.where(
            WorkoutSession.performed_at >= start_utc, WorkoutSession.performed_at < end_utc
        )
        by_day: dict[date, int] = {}
        for (performed_at,) in (await self.session.execute(query)).all():
            local_day = to_user_date(performed_at, user_timezone)
            by_day[local_day] = by_day.get(local_day, 0) + 1
        return by_day

    async def _learning_minutes_by_day(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> dict[date, int]:
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
        return {row[0]: int(row[1]) for row in (await self.session.execute(query)).all()}

    async def _milestones_by_day(
        self, user_id: uuid.UUID, start: date, end: date
    ) -> dict[date, int]:
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
        return {row[0]: int(row[1]) for row in (await self.session.execute(query)).all()}

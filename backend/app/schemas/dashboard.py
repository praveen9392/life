"""Dashboard summary schemas - one aggregated payload for the whole dashboard
(per the performance requirement: no per-widget round trips)."""

from datetime import date

from pydantic import BaseModel

from app.schemas.habit import HabitResponse
from app.schemas.task import TaskResponse


class HabitTodayStatus(BaseModel):
    habit: HabitResponse
    is_due: bool
    status: str | None  # HabitLogStatus value, or None when not logged


class DashboardSummary(BaseModel):
    today: date

    # Hero numbers
    habits_completed_today: int
    habits_due_today: int
    tasks_completed_today: int
    tasks_due_today: int
    daily_progress_percent: int

    # Widgets
    habits: list[HabitTodayStatus]
    tasks_today: list[TaskResponse]
    tasks_upcoming: list[TaskResponse]
    tasks_overdue: list[TaskResponse]
    recent_notes_count: int
    learning_minutes_this_week: int
    workout_sessions_this_week: int
    best_current_streak: int

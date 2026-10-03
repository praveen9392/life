"""Analytics and calendar response schemas."""

from datetime import date

from pydantic import BaseModel


class HabitRateEntry(BaseModel):
    habit_id: str
    name: str
    completed: int
    expected: int
    rate_percent: int
    current_streak: int


class AnalyticsSummary(BaseModel):
    period: str
    start_date: date
    end_date: date

    habit_completion_percent: int
    habits: list[HabitRateEntry]

    tasks_due: int
    tasks_completed: int
    task_completion_percent: int

    learning_minutes: int
    learning_sessions: int
    workout_sessions: int

    goals_active: int
    goals_average_progress: int

    best_current_streak: int


class CalendarDayEntry(BaseModel):
    date: date
    tasks_due: int
    tasks_completed: int
    habits_due: int
    habits_completed: int
    workout_sessions: int
    learning_minutes: int
    milestones_due: int


class CalendarResponse(BaseModel):
    start_date: date
    end_date: date
    days: list[CalendarDayEntry]

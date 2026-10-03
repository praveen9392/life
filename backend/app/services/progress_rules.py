"""The single shared module implementing every completion/progress formula
(see ARCHITECTURE.md "Dashboard & Analytics: Canonical Progress Definitions").

Both dashboard_service and analytics_service import from here, guaranteeing
the numbers shown on the dashboard and on the analytics page can never
diverge - the parity is enforced by tests, not by convention.
"""

from datetime import date


def completion_rate(completed: int, expected: int) -> int:
    """A percentage 0-100; 0% when nothing was expected (avoids div by zero)."""
    if expected <= 0:
        return 0
    return round(100 * completed / expected)


def habit_completion_rate(completed: int, expected: int, skipped_or_na: int) -> int:
    """completed / (expected - skipped_or_na): skipped days don't count against
    the user (per the requirements, skipped is not failed)."""
    denominator = expected - skipped_or_na
    if denominator <= 0:
        return 0
    return round(100 * completed / denominator)


def task_completion_rate(completed_due: int, due_total: int) -> int:
    """completed tasks due / tasks due (undated tasks excluded entirely)."""
    return completion_rate(completed_due, due_total)


def learning_progress_percent(completed_lessons: int, total_lessons: int) -> int:
    return completion_rate(completed_lessons, total_lessons)


def weighted_learning_progress(courses: list[tuple[int, int]]) -> int:
    """Lesson-count-weighted average of course progress percentages.

    `courses` is a list of (progress_percent, total_lessons) tuples.
    """
    total_weight = sum(lessons for _, lessons in courses)
    if total_weight == 0:
        return 0
    weighted = sum(progress * lessons for progress, lessons in courses)
    return round(weighted / total_weight)


def milestone_progress(completed_milestones: int, total_milestones: int) -> int:
    return completion_rate(completed_milestones, total_milestones)


def daily_progress_percent(
    *,
    habits_completed: int,
    habits_due: int,
    tasks_completed: int,
    tasks_due: int,
) -> int:
    """Today's overall progress: the mean of habit and task completion rates."""
    habit_rate = completion_rate(habits_completed, habits_due)
    task_rate = completion_rate(tasks_completed, tasks_due)
    return round((habit_rate + task_rate) / 2)


def period_bounds_for(day: date, period: str) -> tuple[date, date]:
    """[start, end] inclusive bounds for 'day' | 'week' | 'month' | 'year'."""
    from app.utils.datetime import month_bounds_for_user, week_bounds_for_user

    if period == "day":
        return day, day
    if period == "week":
        return week_bounds_for_user(day)
    if period == "month":
        return month_bounds_for_user(day)
    if period == "year":
        return date(day.year, 1, 1), date(day.year, 12, 31)
    raise ValueError(f"Unknown period: {period}")

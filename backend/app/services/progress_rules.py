"""The single shared module implementing every completion/progress formula
(see ARCHITECTURE.md "Dashboard & Analytics: Canonical Progress Definitions").

Both dashboard_service and analytics_service import from here, guaranteeing
the numbers shown on the dashboard and on the analytics page can never
diverge - the parity is enforced by tests, not by convention.
"""

from datetime import date


def completion_rate(completed: int, expected: int) -> int:
    """Compute a completion percentage, 0 when nothing was expected.

    Args:
        completed: Number of completed items.
        expected: Number of expected items.

    Returns:
        int: Rounded percentage 0-100; 0 when `expected` is <= 0 (avoids
        division by zero).
    """
    if expected <= 0:
        return 0
    return round(100 * completed / expected)


def habit_completion_rate(completed: int, expected: int, skipped_or_na: int) -> int:
    """Compute a habit completion percentage that forgives skipped days.

    Args:
        completed: Number of days marked completed.
        expected: Number of days the habit was due.
        skipped_or_na: Number of skipped/not-applicable days; they don't
        count against the user (per the requirements, skipped is not failed).

    Returns:
        int: Rounded percentage 0-100; 0 when the effective denominator
        (`expected - skipped_or_na`) is <= 0.
    """
    denominator = expected - skipped_or_na
    if denominator <= 0:
        return 0
    return round(100 * completed / denominator)


def task_completion_rate(completed_due: int, due_total: int) -> int:
    """Compute the task completion percentage over due tasks.

    Args:
        completed_due: Number of completed tasks that were due.
        due_total: Number of tasks due (undated tasks are excluded entirely).

    Returns:
        int: Rounded percentage 0-100; 0 when nothing was due.
    """
    return completion_rate(completed_due, due_total)


def learning_progress_percent(completed_lessons: int, total_lessons: int) -> int:
    """Compute a course's progress percentage from lesson counts.

    Args:
        completed_lessons: Number of completed lessons.
        total_lessons: Total number of lessons in the course.

    Returns:
        int: Rounded percentage 0-100; 0 when the course has no lessons.
    """
    return completion_rate(completed_lessons, total_lessons)


def weighted_learning_progress(courses: list[tuple[int, int]]) -> int:
    """Compute the lesson-count-weighted average of course progress percentages.

    Args:
        courses: (progress_percent, total_lessons) tuples, one per course.

    Returns:
        int: Rounded weighted average 0-100; 0 when the total lesson count
        is 0.
    """
    total_weight = sum(lessons for _, lessons in courses)
    if total_weight == 0:
        return 0
    weighted = sum(progress * lessons for progress, lessons in courses)
    return round(weighted / total_weight)


def milestone_progress(completed_milestones: int, total_milestones: int) -> int:
    """Compute a goal's progress percentage from milestone completion.

    Args:
        completed_milestones: Number of completed milestones.
        total_milestones: Total number of milestones on the goal.

    Returns:
        int: Rounded percentage 0-100; 0 when the goal has no milestones.
    """
    return completion_rate(completed_milestones, total_milestones)


def daily_progress_percent(
    *,
    habits_completed: int,
    habits_due: int,
    tasks_completed: int,
    tasks_due: int,
) -> int:
    """Compute today's overall progress as the mean of habit and task rates.

    Args:
        habits_completed: Habits completed today.
        habits_due: Habits due today.
        tasks_completed: Tasks completed today.
        tasks_due: Tasks due today.

    Returns:
        int: Rounded mean of the habit and task completion rates (0-100).
    """
    habit_rate = completion_rate(habits_completed, habits_due)
    task_rate = completion_rate(tasks_completed, tasks_due)
    return round((habit_rate + task_rate) / 2)


def period_bounds_for(day: date, period: str) -> tuple[date, date]:
    """Compute the inclusive [start, end] date bounds for an aggregation period.

    Args:
        day: Anchor date (the user's local today).
        period: One of "day", "week", "month", or "year".

    Returns:
        tuple[date, date]: Inclusive first and last day of the period
        containing `day`.

    Raises:
        ValueError: If `period` is not one of the supported values.
    """
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

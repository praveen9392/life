"""Recurrence evaluation for habits and tasks.

Design (see ARCHITECTURE.md "Recurring Tasks & Habits"):
- Habits are frequency-based: "is this habit due on `day`" is a pure function
  evaluated on demand - no future rows are ever pre-generated.
- Recurring tasks use a template + single generated occurrence; the rule
  shapes supported here are daily / weekly (weekday set) / monthly
  (day-of-month), evaluated relative to the user's timezone-local date.
"""

from datetime import date, timedelta

from app.utils.enums import HabitFrequencyType, RecurrenceFrequency


def is_habit_due(
    *,
    frequency_type: HabitFrequencyType,
    frequency_config: dict,
    start_date: date,
    end_date: date | None,
    day: date,
) -> bool:
    """Whether `day` is an expected occurrence for this habit."""
    if day < start_date or (end_date is not None and day > end_date):
        return False
    if frequency_type == HabitFrequencyType.DAILY:
        return True
    if frequency_type == HabitFrequencyType.WEEKLY:
        # Default: once a week on the habit's start weekday, unless weekdays given.
        weekdays = frequency_config.get("weekdays")
        if weekdays:
            return day.weekday() in weekdays
        return day.weekday() == start_date.weekday()
    if frequency_type == HabitFrequencyType.CUSTOM_DAYS:
        every_n_days = int(frequency_config.get("every_n_days", 1))
        if every_n_days <= 0:
            return False
        return (day - start_date).days % every_n_days == 0
    return False


def next_task_occurrence_date(
    *,
    frequency: RecurrenceFrequency,
    weekdays: list[int] | None,
    from_date: date,
) -> date:
    """The next due date strictly after `from_date` for a recurring task.

    - daily: tomorrow
    - weekly: the next day whose weekday is in `weekdays` (defaults to
      `from_date`'s weekday, i.e. same weekday next week)
    - monthly: same day-of-month next month (clamped to month length)
    """
    if frequency == RecurrenceFrequency.DAILY:
        return from_date + timedelta(days=1)
    if frequency == RecurrenceFrequency.WEEKLY:
        allowed = weekdays if weekdays else [from_date.weekday()]
        candidate = from_date + timedelta(days=1)
        for _ in range(7):
            if candidate.weekday() in allowed:
                return candidate
            candidate += timedelta(days=1)
        return from_date + timedelta(days=7)
    # Monthly: same day-of-month, clamped to the target month's length.
    year, month = (from_date.year + 1, 1) if from_date.month == 12 else (from_date.year, from_date.month + 1)
    day = min(from_date.day, _days_in_month(year, month))
    return date(year, month, day)


def _days_in_month(year: int, month: int) -> int:
    next_month = date(year + 1, 1, 1) if month == 12 else date(year, month + 1, 1)
    return (next_month - timedelta(days=1)).day

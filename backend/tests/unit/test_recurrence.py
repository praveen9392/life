"""Unit tests for recurrence rules (tasks) and habit due-date evaluation."""

from datetime import date

from app.utils.enums import HabitFrequencyType, RecurrenceFrequency
from app.utils.recurrence import is_habit_due, next_task_occurrence_date


class TestIsHabitDue:
    def test_daily_habit_due_every_day_after_start(self) -> None:
        assert is_habit_due(
            frequency_type=HabitFrequencyType.DAILY,
            frequency_config={},
            start_date=date(2025, 1, 1),
            end_date=None,
            day=date(2025, 3, 15),
        )

    def test_habit_not_due_before_start_date(self) -> None:
        assert not is_habit_due(
            frequency_type=HabitFrequencyType.DAILY,
            frequency_config={},
            start_date=date(2025, 6, 1),
            end_date=None,
            day=date(2025, 5, 31),
        )

    def test_habit_not_due_after_end_date(self) -> None:
        assert not is_habit_due(
            frequency_type=HabitFrequencyType.DAILY,
            frequency_config={},
            start_date=date(2025, 1, 1),
            end_date=date(2025, 1, 31),
            day=date(2025, 2, 1),
        )

    def test_weekly_habit_defaults_to_start_weekday(self) -> None:
        start = date(2025, 1, 6)  # a Monday
        assert is_habit_due(
            frequency_type=HabitFrequencyType.WEEKLY,
            frequency_config={},
            start_date=start,
            end_date=None,
            day=date(2025, 1, 13),  # next Monday
        )
        assert not is_habit_due(
            frequency_type=HabitFrequencyType.WEEKLY,
            frequency_config={},
            start_date=start,
            end_date=None,
            day=date(2025, 1, 14),  # Tuesday
        )

    def test_weekly_habit_with_selected_weekdays(self) -> None:
        # Monday=0, Wednesday=2, Friday=4
        config = {"weekdays": [0, 2, 4]}
        start = date(2025, 1, 1)
        assert is_habit_due(
            frequency_type=HabitFrequencyType.WEEKLY,
            frequency_config=config,
            start_date=start,
            end_date=None,
            day=date(2025, 1, 8),  # Wednesday
        )
        assert not is_habit_due(
            frequency_type=HabitFrequencyType.WEEKLY,
            frequency_config=config,
            start_date=start,
            end_date=None,
            day=date(2025, 1, 9),  # Thursday
        )

    def test_custom_every_n_days(self) -> None:
        start = date(2025, 1, 1)
        assert is_habit_due(
            frequency_type=HabitFrequencyType.CUSTOM_DAYS,
            frequency_config={"every_n_days": 3},
            start_date=start,
            end_date=None,
            day=date(2025, 1, 10),  # 9 days after start -> divisible by 3
        )
        assert not is_habit_due(
            frequency_type=HabitFrequencyType.CUSTOM_DAYS,
            frequency_config={"every_n_days": 3},
            start_date=start,
            end_date=None,
            day=date(2025, 1, 11),
        )


class TestNextTaskOccurrenceDate:
    def test_daily_is_tomorrow(self) -> None:
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.DAILY, weekdays=None, from_date=date(2025, 3, 1)
        ) == date(2025, 3, 2)

    def test_weekly_default_same_weekday_next_week(self) -> None:
        monday = date(2025, 3, 3)
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.WEEKLY, weekdays=None, from_date=monday
        ) == date(2025, 3, 10)

    def test_weekly_picks_earliest_selected_weekday_after(self) -> None:
        monday = date(2025, 3, 3)
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.WEEKLY, weekdays=[2], from_date=monday
        ) == date(2025, 3, 5)  # Wednesday is next selected day

    def test_monthly_same_day_of_month(self) -> None:
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.MONTHLY, weekdays=None, from_date=date(2025, 1, 15)
        ) == date(2025, 2, 15)

    def test_monthly_clamps_to_shorter_month(self) -> None:
        # Jan 31 -> Feb 28 (2025 is not a leap year)
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.MONTHLY, weekdays=None, from_date=date(2025, 1, 31)
        ) == date(2025, 2, 28)

    def test_monthly_leap_year_clamp(self) -> None:
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.MONTHLY, weekdays=None, from_date=date(2024, 1, 31)
        ) == date(2024, 2, 29)

    def test_monthly_december_wraps_year(self) -> None:
        assert next_task_occurrence_date(
            frequency=RecurrenceFrequency.MONTHLY, weekdays=None, from_date=date(2025, 12, 15)
        ) == date(2026, 1, 15)

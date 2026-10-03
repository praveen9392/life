"""Unit tests for the canonical streak calculation.

Semantics under test (per the requirements: skipped is NOT failed):
- completed extends the streak,
- skipped / not_applicable preserve it,
- missed resets it to zero,
- an unlogged past day counts as missed,
- an unlogged today neither extends nor breaks the streak.
"""

from datetime import date, timedelta

from app.utils.enums import HabitLogStatus
from app.utils.streaks import calculate_streak

COMPLETED = HabitLogStatus.COMPLETED
SKIPPED = HabitLogStatus.SKIPPED
MISSED = HabitLogStatus.MISSED
NOT_APPLICABLE = HabitLogStatus.NOT_APPLICABLE


def test_empty_logs_have_no_streak() -> None:
    assert calculate_streak({}, today=date(2025, 3, 10)) == (0, 0)


def test_consecutive_completions_build_streak() -> None:
    today = date(2025, 3, 10)
    logs = {today - timedelta(days=offset): COMPLETED for offset in range(3)}
    current, longest = calculate_streak(logs, today=today)
    assert current == 3
    assert longest == 3


def test_missed_day_breaks_streak() -> None:
    today = date(2025, 3, 10)
    logs = {
        today - timedelta(days=1): COMPLETED,
        today - timedelta(days=2): MISSED,
        today - timedelta(days=3): COMPLETED,
    }
    current, longest = calculate_streak(logs, today=today)
    assert current == 1
    assert longest == 1


def test_skipped_day_preserves_streak() -> None:
    today = date(2025, 3, 10)
    logs = {
        today: COMPLETED,
        today - timedelta(days=1): SKIPPED,
        today - timedelta(days=2): COMPLETED,
    }
    current, longest = calculate_streak(logs, today=today)
    assert current == 2
    assert longest == 2


def test_not_applicable_day_preserves_streak() -> None:
    today = date(2025, 3, 10)
    logs = {
        today: COMPLETED,
        today - timedelta(days=1): NOT_APPLICABLE,
        today - timedelta(days=2): COMPLETED,
    }
    current, _ = calculate_streak(logs, today=today)
    assert current == 2


def test_unlogged_past_day_breaks_streak() -> None:
    today = date(2025, 3, 10)
    logs = {
        today: COMPLETED,
        # yesterday missing entirely
        today - timedelta(days=2): COMPLETED,
        today - timedelta(days=3): COMPLETED,
    }
    current, longest = calculate_streak(logs, today=today)
    assert current == 1
    # The gap splits history into runs of 2 and 1; longest is the older run.
    assert longest == 2


def test_unlogged_today_does_not_break_streak() -> None:
    today = date(2025, 3, 10)
    logs = {
        today - timedelta(days=1): COMPLETED,
        today - timedelta(days=2): COMPLETED,
    }
    current, _ = calculate_streak(logs, today=today)
    assert current == 2


def test_longest_streak_includes_historical_runs() -> None:
    today = date(2025, 3, 10)
    logs = {
        date(2025, 3, 1): COMPLETED,
        date(2025, 3, 2): COMPLETED,
        date(2025, 3, 3): COMPLETED,
        date(2025, 3, 4): MISSED,
        today - timedelta(days=1): COMPLETED,
    }
    current, longest = calculate_streak(logs, today=today)
    assert current == 1
    assert longest == 3

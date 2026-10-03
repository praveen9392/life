"""Streak calculation - the single, canonical implementation (see
ARCHITECTURE.md "Dashboard & Analytics: Canonical Progress Definitions").

Semantics (per the requirements: skipped is NOT failed):
- completed extends the streak,
- skipped / not_applicable preserve it (they don't count against the user),
- missed resets it to zero.
"""

from datetime import date, timedelta

from app.utils.enums import HabitLogStatus

_STREAK_BREAKING = {HabitLogStatus.MISSED}
_STREAK_PRESERVING = {HabitLogStatus.SKIPPED, HabitLogStatus.NOT_APPLICABLE}


def calculate_streak(logs_by_date: dict[date, HabitLogStatus], *, today: date) -> tuple[int, int]:
    """Return (current_streak, longest_streak) for a habit's log history.

    `logs_by_date` maps each logged day to its status. Days without a log are
    treated as missed ONLY if the habit was due that day - the caller passes
    already-filtered "due days" when relevant; here, absence of a log on a
    day before today counts as missed (breaking), while today without a log
    simply doesn't extend or break the streak yet (the day isn't over).
    """
    if not logs_by_date:
        return 0, 0

    current = 0
    longest = 0
    running = 0

    day = min(logs_by_date)
    last_day = max(logs_by_date)
    while day <= last_day:
        status = logs_by_date.get(day)
        if status is None:
            # Not logged: breaks the streak unless it's today (day still open).
            if day < today:
                running = 0
        elif status in _STREAK_BREAKING:
            running = 0
        elif status == HabitLogStatus.COMPLETED:
            running += 1
            longest = max(longest, running)
        # preserving statuses leave `running` unchanged
        day += timedelta(days=1)

    # Current streak: walk backwards from today (or the last logged day).
    walk_day = today
    while walk_day >= min(logs_by_date):
        status = logs_by_date.get(walk_day)
        if status is None:
            if walk_day == today:
                walk_day -= timedelta(days=1)
                continue
            break
        if status in _STREAK_BREAKING:
            break
        if status == HabitLogStatus.COMPLETED:
            current += 1
        walk_day -= timedelta(days=1)

    return current, max(longest, current)

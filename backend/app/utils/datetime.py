"""Timezone-aware date/time utilities — the single source of truth for
"what day is it for this user" across habits, tasks, dashboard, analytics,
calendar, and notifications (see ARCHITECTURE.md "Timezone Architecture").

Every timestamp is stored/handled in UTC; user-facing "day" boundaries are
always computed by converting to the user's IANA timezone at read time via
the stdlib `zoneinfo`, which handles DST transitions automatically.
"""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "UTC"


def safe_zoneinfo(timezone_name: str) -> ZoneInfo:
    """Return a ZoneInfo for `timezone_name`, falling back to UTC if invalid."""
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo(DEFAULT_TIMEZONE)


def now_utc() -> datetime:
    """Return the current instant as a timezone-aware UTC datetime."""
    return datetime.now(ZoneInfo("UTC"))


def to_user_date(moment: datetime, user_timezone: str) -> date:
    """Convert a UTC-aware instant to the calendar date in the user's timezone."""
    tz = safe_zoneinfo(user_timezone)
    return moment.astimezone(tz).date()


def today_for_user(user_timezone: str) -> date:
    """The current calendar date in the user's timezone, evaluated now."""
    return to_user_date(now_utc(), user_timezone)


def user_day_bounds_utc(day: date, user_timezone: str) -> tuple[datetime, datetime]:
    """The [start, end) UTC instants corresponding to `day` in the user's timezone."""
    tz = safe_zoneinfo(user_timezone)
    start_local = datetime(day.year, day.month, day.day, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(ZoneInfo("UTC")), end_local.astimezone(ZoneInfo("UTC"))


def is_same_user_day(moment_a: datetime, moment_b: datetime, user_timezone: str) -> bool:
    """Whether two UTC instants fall on the same calendar day for the user."""
    return to_user_date(moment_a, user_timezone) == to_user_date(moment_b, user_timezone)


def week_bounds_for_user(day: date, week_starts_on_monday: bool = True) -> tuple[date, date]:
    """The [start, end] calendar-date bounds (inclusive) of the week containing `day`."""
    weekday = day.weekday() if week_starts_on_monday else (day.weekday() + 1) % 7
    start = day - timedelta(days=weekday)
    end = start + timedelta(days=6)
    return start, end


def month_bounds_for_user(day: date) -> tuple[date, date]:
    """The [start, end] calendar-date bounds (inclusive) of the month containing `day`."""
    start = day.replace(day=1)
    if start.month == 12:
        next_month_start = start.replace(year=start.year + 1, month=1)
    else:
        next_month_start = start.replace(month=start.month + 1)
    end = next_month_start - timedelta(days=1)
    return start, end

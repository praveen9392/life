"""Analytics and calendar routes - read-only aggregations."""

from datetime import date

from fastapi import APIRouter, Query

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import ValidationError
from app.schemas.analytics import AnalyticsSummary, CalendarResponse
from app.services.analytics_service import AnalyticsService
from app.services.calendar_service import CalendarService

router = APIRouter(tags=["analytics", "calendar"])

_ALLOWED_PERIODS = {"week", "month"}


@router.get("/analytics/summary", response_model=AnalyticsSummary)
async def analytics_summary(
    current_user: CurrentUser,
    db: DbSession,
    period: str = Query(default="week"),
) -> AnalyticsSummary:
    if period not in _ALLOWED_PERIODS:
        raise ValidationError(f"period must be one of: {', '.join(sorted(_ALLOWED_PERIODS))}")
    return await AnalyticsService(db).build_summary(current_user.id, current_user.timezone, period)


@router.get("/calendar", response_model=CalendarResponse)
async def calendar_range(
    current_user: CurrentUser,
    db: DbSession,
    start: date = Query(...),
    end: date = Query(...),
) -> CalendarResponse:
    return await CalendarService(db).build_range(
        current_user.id, current_user.timezone, start, end
    )

"""Analytics and calendar routes - read-only aggregations."""

from datetime import date

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException, ValidationError
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
    try:
        if period not in _ALLOWED_PERIODS:
            raise ValidationError(f"period must be one of: {', '.join(sorted(_ALLOWED_PERIODS))}")
        summary = await AnalyticsService(db).build_summary(
            current_user.id, current_user.timezone, period
        )
        return summary
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.get("/calendar", response_model=CalendarResponse)
async def calendar_range(
    current_user: CurrentUser,
    db: DbSession,
    start: date = Query(...),
    end: date = Query(...),
) -> CalendarResponse:
    try:
        calendar_range_response = await CalendarService(db).build_range(
            current_user.id, current_user.timezone, start, end
        )
        return calendar_range_response
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

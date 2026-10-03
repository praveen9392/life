"""Dashboard route - one aggregated summary for the dashboard page."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.dashboard import DashboardSummary
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    current_user: CurrentUser,
    db: DbSession,
) -> DashboardSummary:
    service = DashboardService(db)
    return await service.build_summary(current_user.id, current_user.timezone)

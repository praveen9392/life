"""Health metric routes."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession, get_pagination
from app.core.exceptions import AppException
from app.schemas.health import HealthMetricCreateRequest, HealthMetricResponse
from app.services.health_service import HealthService
from app.utils.enums import HealthMetricType
from app.utils.pagination import Page, PaginationParams, build_page

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/metrics", response_model=Page[HealthMetricResponse])
async def list_metrics(
    current_user: CurrentUser,
    db: DbSession,
    metric_type: HealthMetricType | None = None,
    on_date: date | None = None,
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[HealthMetricResponse]:
    try:
        service = HealthService(db)
        items, total = await service.list_metrics(
            current_user.id,
            metric_type=metric_type,
            on_date=on_date,
            user_timezone=current_user.timezone,
            offset=pagination.offset,
            limit=pagination.page_size,
        )
        return build_page(
            [HealthMetricResponse.model_validate(metric) for metric in items], total, pagination
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/metrics", response_model=HealthMetricResponse, status_code=201)
async def create_metric(
    payload: HealthMetricCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> HealthMetricResponse:
    try:
        service = HealthService(db)
        metric = await service.create_metric(current_user.id, payload)
        return HealthMetricResponse.model_validate(metric)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/metrics/{metric_id}", status_code=204)
async def delete_metric(
    metric_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        service = HealthService(db)
        await service.delete_metric(current_user.id, metric_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

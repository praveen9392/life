"""Health metric business logic - verbatim record keeping, no inference."""

import uuid
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.health import HealthMetric
from app.repositories.health_repository import HealthRepository
from app.schemas.health import HealthMetricCreateRequest
from app.utils.datetime import now_utc
from app.utils.enums import HealthMetricType


class HealthService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.metrics = HealthRepository(session)

    async def create_metric(
        self, user_id: uuid.UUID, payload: HealthMetricCreateRequest
    ) -> HealthMetric:
        return await self.metrics.create_owned(
            user_id,
            metric_type=payload.metric_type,
            value=payload.value,
            unit=payload.unit,
            recorded_at=payload.recorded_at or now_utc(),
            note=payload.note,
        )

    async def list_metrics(
        self,
        user_id: uuid.UUID,
        *,
        metric_type: HealthMetricType | None,
        on_date: date | None,
        user_timezone: str,
        offset: int,
        limit: int,
    ) -> tuple[list[HealthMetric], int]:
        return await self.metrics.list_for_user(
            user_id,
            metric_type=metric_type,
            on_date=on_date,
            user_timezone=user_timezone,
            offset=offset,
            limit=limit,
        )

    async def delete_metric(self, user_id: uuid.UUID, metric_id: uuid.UUID) -> None:
        deleted = await self.metrics.delete_owned(metric_id, user_id)
        if not deleted:
            raise NotFoundError("Health metric not found")

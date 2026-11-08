"""Health metric repository - ownership-scoped."""

import uuid
from datetime import date

from sqlalchemy import func, select

from app.models.health import HealthMetric
from app.repositories.base import BaseRepository
from app.utils.datetime import user_day_bounds_utc
from app.utils.enums import HealthMetricType


class HealthRepository(BaseRepository[HealthMetric]):
    model = HealthMetric

    async def list_for_user_query(
        self,
        user_id: uuid.UUID,
        *,
        metric_type: HealthMetricType | None = None,
        on_date: date | None = None,
        user_timezone: str = "UTC",
        offset: int = 0,
        limit: int = 50,
    ) -> tuple[list[HealthMetric], int]:
        """Return (page, total) of the user's health metrics, newest first, optionally filtered
        by metric type and a user-local calendar day.
        """
        query = self._base_query(user_id)
        if metric_type is not None:
            query = query.where(HealthMetric.metric_type == metric_type)
        if on_date is not None:
            start_utc, end_utc = user_day_bounds_utc(on_date, user_timezone)
            query = query.where(
                HealthMetric.recorded_at >= start_utc, HealthMetric.recorded_at < end_utc
            )
        query = query.order_by(HealthMetric.recorded_at.desc())

        count_query = select(func.count()).select_from(query.order_by(None).subquery())
        total = (await self.session.execute(count_query)).scalar_one()
        rows = (await self.session.execute(query.offset(offset).limit(limit))).scalars().all()
        return list(rows), total

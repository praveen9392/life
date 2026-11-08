"""Health metric business logic - verbatim record keeping, no inference."""

import uuid
from datetime import date

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError
from app.core.logging import logger
from app.models.health import HealthMetric
from app.repositories.health_repository import HealthRepository
from app.schemas.health import HealthMetricCreateRequest
from app.utils.datetime import now_utc
from app.utils.enums import HealthMetricType


class HealthService:
    """Health metric record keeping (verbatim values, no inference)."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.metrics = HealthRepository(session)

    async def create_metric(
        self, user_id: uuid.UUID, payload: HealthMetricCreateRequest
    ) -> HealthMetric:
        """Record one health metric reading for the user.

        Args:
            user_id: Owner of the metric.
            payload: Metric type, value, unit, optional note, and
                `recorded_at` (defaults to now UTC when omitted).

        Returns:
            HealthMetric: The created metric.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(
                f"Starting health metric creation | user_id={user_id} metric_type={payload.metric_type}"
            )
            created_metric = await self.metrics.create_owned_query(
                user_id,
                metric_type=payload.metric_type,
                value=payload.value,
                unit=payload.unit,
                recorded_at=payload.recorded_at or now_utc(),
                note=payload.note,
            )
            logger.info(f"Health metric created with id: {created_metric.id}")
            return created_metric
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the health metric: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the health metric: {exc}")
            raise ServiceError("Unexpected error while creating the health metric") from exc

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
        """List the user's health metrics, filtered and paginated.

        Args:
            user_id: Owner of the metrics.
            metric_type: Optional metric type filter.
            on_date: Optional user-local day filter.
            user_timezone: IANA timezone used to interpret `on_date`.
            offset: Number of records to skip for pagination.
            limit: Maximum number of records to return.

        Returns:
            tuple[list[HealthMetric], int]: The matching metrics and the
            total count before pagination.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting health metric listing | user_id={user_id}")
            metrics_and_total = await self.metrics.list_for_user_query(
                user_id,
                metric_type=metric_type,
                on_date=on_date,
                user_timezone=user_timezone,
                offset=offset,
                limit=limit,
            )
            metrics, _total = metrics_and_total
            logger.info(f"Successfully retrieved {len(metrics)} health metrics")
            return metrics, _total
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the health metrics: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the health metrics: {exc}")
            raise ServiceError("Unexpected error while listing the health metrics") from exc

    async def delete_metric(self, user_id: uuid.UUID, metric_id: uuid.UUID) -> None:
        """Delete a health metric owned by the user.

        Args:
            user_id: Owner the metric must belong to.
            metric_id: Primary key of the metric.

        Raises:
            NotFoundError: If the metric does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting health metric deletion | user_id={user_id} metric_id={metric_id}")
            deleted = await self.metrics.delete_owned_query(metric_id, user_id)
            if not deleted:
                logger.warning(f"Health metric not found with id: {metric_id}")
                raise NotFoundError("Health metric not found")
            logger.info(f"Health metric deleted | id={metric_id}")
        except NotFoundError:
            logger.error(f"Health metric delete failed: metric not found | metric_id={metric_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the health metric: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the health metric: {exc}")
            raise ServiceError("Unexpected error while deleting the health metric") from exc

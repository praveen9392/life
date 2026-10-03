"""Manually-tracked health metrics (no medical inference is ever performed)."""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UUIDPkMixin
from app.utils.enums import HealthMetricType


class HealthMetric(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "health_metrics"
    __table_args__ = (
        CheckConstraint("value >= 0", name="value_non_negative"),
        Index("ix_health_metrics_user_type_recorded", "user_id", "metric_type", "recorded_at"),
    )

    metric_type: Mapped[HealthMetricType] = mapped_column(
        Enum(HealthMetricType, name="health_metric_type_enum"), nullable=False
    )
    value: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    note: Mapped[str | None] = mapped_column(Text)

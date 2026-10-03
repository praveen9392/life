"""Goals and milestones.

`progress_mode` determines the source of truth for `progress_percent` (see
ARCHITECTURE.md "Dashboard & Analytics: Canonical Progress Definitions"):
manual (user-set), milestones (derived), or measurable (reserved, future).
"""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UUIDPkMixin
from app.utils.enums import GoalProgressMode, GoalStatus


class Goal(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint("progress_percent BETWEEN 0 AND 100", name="progress_percent_range"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(100))
    target_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[GoalStatus] = mapped_column(
        Enum(GoalStatus, name="goal_status_enum"), nullable=False, default=GoalStatus.NOT_STARTED
    )
    progress_mode: Mapped[GoalProgressMode] = mapped_column(
        Enum(GoalProgressMode, name="goal_progress_mode_enum"),
        nullable=False,
        default=GoalProgressMode.MANUAL,
    )
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_via_onboarding: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    milestones: Mapped[list["GoalMilestone"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="GoalMilestone.target_date"
    )


class GoalMilestone(UUIDPkMixin, Base):
    __tablename__ = "goal_milestones"

    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("goals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    target_date: Mapped[date | None] = mapped_column(Date)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    goal: Mapped["Goal"] = relationship(back_populates="milestones")

"""Habits and their daily logs.

Habits are frequency-based, not occurrence-based: no future rows are ever
pre-generated. See ARCHITECTURE.md "Recurring Tasks & Habits" for the full
design (`app/utils/recurrence.py::is_habit_due` evaluates due-ness on demand).
"""

import uuid
from datetime import date, time

from sqlalchemy import (
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UUIDPkMixin
from app.utils.enums import HabitFrequencyType, HabitLogStatus


class Habit(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "habits"

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(100))
    icon: Mapped[str | None] = mapped_column(String(50))
    color: Mapped[str | None] = mapped_column(String(20))
    frequency_type: Mapped[HabitFrequencyType] = mapped_column(
        Enum(HabitFrequencyType, name="habit_frequency_type_enum"),
        nullable=False,
        default=HabitFrequencyType.DAILY,
    )
    frequency_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    target_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date)
    reminder_time: Mapped[time | None] = mapped_column(Time)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_via_onboarding: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    logs: Mapped[list["HabitLog"]] = relationship(
        back_populates="habit", cascade="all, delete-orphan"
    )


class HabitLog(UUIDPkMixin, Base):
    __tablename__ = "habit_logs"
    __table_args__ = (UniqueConstraint("habit_id", "log_date", name="uq_habit_logs_habit_date"),)

    habit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("habits.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[HabitLogStatus] = mapped_column(
        Enum(HabitLogStatus, name="habit_log_status_enum"), nullable=False
    )
    note: Mapped[str | None] = mapped_column(Text)

    habit: Mapped["Habit"] = relationship(back_populates="logs")

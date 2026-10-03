"""Exercises (shared catalog + user-created), workouts, sessions, and sets."""

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UUIDPkMixin


class Exercise(UUIDPkMixin, TimestampMixin, Base):
    """user_id is nullable: NULL rows are the shared default catalog, seeded once.

    Deleting a user must never delete shared catalog data, so this FK uses
    ON DELETE SET NULL rather than the CASCADE used by OwnedMixin.
    """

    __tablename__ = "exercises"

    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    muscle_group: Mapped[str | None] = mapped_column(String(100))
    equipment: Mapped[str | None] = mapped_column(String(100))


class Workout(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "workouts"

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class WorkoutSession(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "workout_sessions"

    workout_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workouts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    performed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    notes: Mapped[str | None] = mapped_column(Text)

    sets: Mapped[list["WorkoutSet"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class WorkoutSet(UUIDPkMixin, Base):
    __tablename__ = "workout_sets"
    __table_args__ = (
        CheckConstraint("reps > 0", name="reps_positive"),
        CheckConstraint("weight >= 0", name="weight_non_negative"),
    )

    workout_session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workout_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    exercise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("exercises.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    set_number: Mapped[int] = mapped_column(Integer, nullable=False)
    reps: Mapped[int | None] = mapped_column(Integer)
    weight: Mapped[float | None] = mapped_column(Numeric(6, 2))
    weight_unit: Mapped[str | None] = mapped_column(String(10))
    duration_seconds: Mapped[int | None] = mapped_column(Integer)

    session: Mapped["WorkoutSession"] = relationship(back_populates="sets")

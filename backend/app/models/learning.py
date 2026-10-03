"""Learning hierarchy: LearningItem / Course -> Module -> Lesson, plus sessions."""

import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.mixins import OwnedMixin, TimestampMixin, UUIDPkMixin
from app.utils.enums import CourseStatus, LearningItemStatus, LearningItemType, LessonStatus


class LearningItem(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "learning_items"
    __table_args__ = (
        CheckConstraint("progress_percent BETWEEN 0 AND 100", name="progress_percent_range"),
    )

    type: Mapped[LearningItemType] = mapped_column(
        Enum(LearningItemType, name="learning_item_type_enum"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[LearningItemStatus] = mapped_column(
        Enum(LearningItemStatus, name="learning_item_status_enum"),
        nullable=False,
        default=LearningItemStatus.NOT_STARTED,
    )
    progress_percent: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_via_onboarding: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Course(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "courses"

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(150))
    start_date: Mapped[date | None] = mapped_column(Date)
    target_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[CourseStatus] = mapped_column(
        Enum(CourseStatus, name="course_status_enum"), nullable=False, default=CourseStatus.NOT_STARTED
    )

    modules: Mapped[list["CourseModule"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="CourseModule.position"
    )


class CourseModule(UUIDPkMixin, Base):
    __tablename__ = "course_modules"

    course_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    course: Mapped["Course"] = relationship(back_populates="modules")
    lessons: Mapped[list["CourseLesson"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="CourseLesson.position"
    )


class CourseLesson(UUIDPkMixin, Base):
    __tablename__ = "course_lessons"

    module_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("course_modules.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[LessonStatus] = mapped_column(
        Enum(LessonStatus, name="lesson_status_enum"), nullable=False, default=LessonStatus.NOT_STARTED
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    module: Mapped["CourseModule"] = relationship(back_populates="lessons")


class LearningSession(UUIDPkMixin, TimestampMixin, OwnedMixin, Base):
    __tablename__ = "learning_sessions"
    __table_args__ = (
        Index("ix_learning_sessions_user_date", "user_id", "session_date"),
    )

    course_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("courses.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    learning_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("learning_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    topic: Mapped[str | None] = mapped_column(String(200))
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

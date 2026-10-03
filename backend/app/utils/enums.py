"""Shared domain enums.

Every status/priority/category-style field in the schema uses one of these
enums (mapped to a Postgres ENUM type) rather than free-text strings, per the
database design conventions in the project plan.
"""

from enum import StrEnum


class ThemePreference(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class HabitFrequencyType(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    CUSTOM_DAYS = "custom_days"


class HabitLogStatus(StrEnum):
    """Skipped/not_applicable preserve streaks; missed breaks them."""

    COMPLETED = "completed"
    SKIPPED = "skipped"
    MISSED = "missed"
    NOT_APPLICABLE = "not_applicable"


class TaskPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class TaskStatus(StrEnum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TaskList(StrEnum):
    TODAY = "today"
    UPCOMING = "upcoming"
    LATER = "later"


class RecurrenceFrequency(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class HealthMetricType(StrEnum):
    WEIGHT = "weight"
    WATER = "water"
    SLEEP = "sleep"
    STEPS = "steps"
    RESTING_HEART_RATE = "resting_heart_rate"
    CUSTOM = "custom"


class LearningItemType(StrEnum):
    BOOK = "book"
    TECHNOLOGY = "technology"
    TOPIC = "topic"
    PROJECT = "project"


class LearningItemStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class CourseStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class LessonStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class GoalStatus(StrEnum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class GoalProgressMode(StrEnum):
    """The chosen source of truth for a goal's progress_percent."""

    MANUAL = "manual"
    MILESTONES = "milestones"
    MEASURABLE = "measurable"


class NotificationType(StrEnum):
    TASK_DUE_SOON = "task_due_soon"
    HABIT_REMINDER = "habit_reminder"
    LEARNING_REMINDER = "learning_reminder"
    WORKOUT_REMINDER = "workout_reminder"
    GOAL_DEADLINE_APPROACHING = "goal_deadline_approaching"

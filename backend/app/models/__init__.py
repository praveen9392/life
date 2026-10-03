"""Import every model so `Base.metadata` is fully populated for Alembic autogenerate."""

from app.db.base import Base
from app.models.goal import Goal, GoalMilestone
from app.models.habit import Habit, HabitLog
from app.models.health import HealthMetric
from app.models.learning import Course, CourseLesson, CourseModule, LearningItem, LearningSession
from app.models.note import Note
from app.models.notification import Notification
from app.models.tag import NoteTag, Tag, TaskTag
from app.models.task import Task
from app.models.user import RefreshToken, User
from app.models.workout import Exercise, Workout, WorkoutSession, WorkoutSet

__all__ = [
    "Base",
    "User",
    "RefreshToken",
    "Habit",
    "HabitLog",
    "Task",
    "Tag",
    "TaskTag",
    "NoteTag",
    "Note",
    "HealthMetric",
    "Exercise",
    "Workout",
    "WorkoutSession",
    "WorkoutSet",
    "LearningItem",
    "Course",
    "CourseModule",
    "CourseLesson",
    "LearningSession",
    "Goal",
    "GoalMilestone",
    "Notification",
]

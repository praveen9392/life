"""Migration/schema integration tests.

Verifies the migration chain applies from empty and that inserting one row
per table respects every foreign key / check / unique constraint (see the
project plan §Phase 2 completion criteria).
"""

from datetime import UTC, date, datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Course,
    CourseLesson,
    CourseModule,
    Exercise,
    Goal,
    GoalMilestone,
    Habit,
    HabitLog,
    HealthMetric,
    LearningItem,
    LearningSession,
    Note,
    Notification,
    Tag,
    Task,
    User,
    Workout,
    WorkoutSession,
    WorkoutSet,
)
from app.utils.enums import (
    HabitLogStatus,
    HealthMetricType,
    LearningItemType,
    NotificationType,
)


@pytest.mark.asyncio
async def test_one_row_per_table_respects_all_constraints(db_session: AsyncSession) -> None:
    user = User(email="migration-smoke-test@example.com", hashed_password="x", timezone="UTC")
    db_session.add(user)
    await db_session.flush()

    habit = Habit(user_id=user.id, name="Drink water", start_date=date.today(), frequency_config={})
    db_session.add(habit)
    await db_session.flush()

    db_session.add(
        HabitLog(habit_id=habit.id, user_id=user.id, log_date=date.today(), status=HabitLogStatus.COMPLETED)
    )

    task = Task(user_id=user.id, title="Write tests")
    db_session.add(task)

    note = Note(user_id=user.id, title="Idea", content="Some content")
    db_session.add(note)

    tag = Tag(user_id=user.id, name="work")
    db_session.add(tag)

    db_session.add(
        HealthMetric(
            user_id=user.id,
            metric_type=HealthMetricType.WEIGHT,
            value=70,
            unit="kg",
            recorded_at=datetime.now(UTC),
        )
    )

    exercise = Exercise(name="Bench Press", muscle_group="chest")
    db_session.add(exercise)
    await db_session.flush()

    workout = Workout(user_id=user.id, name="Push Day")
    db_session.add(workout)
    await db_session.flush()

    session = WorkoutSession(user_id=user.id, workout_id=workout.id, performed_at=datetime.now(UTC))
    db_session.add(session)
    await db_session.flush()

    db_session.add(
        WorkoutSet(workout_session_id=session.id, exercise_id=exercise.id, set_number=1, reps=10, weight=50)
    )

    learning_item = LearningItem(user_id=user.id, type=LearningItemType.TECHNOLOGY, title="Python")
    db_session.add(learning_item)

    course = Course(user_id=user.id, title="Advanced Python")
    db_session.add(course)
    await db_session.flush()

    module = CourseModule(course_id=course.id, title="Async", position=0)
    db_session.add(module)
    await db_session.flush()

    db_session.add(CourseLesson(module_id=module.id, title="Event Loop", position=0))

    db_session.add(
        LearningSession(user_id=user.id, course_id=course.id, duration_minutes=30, session_date=date.today())
    )

    goal = Goal(user_id=user.id, title="Ship the app")
    db_session.add(goal)
    await db_session.flush()

    db_session.add(GoalMilestone(goal_id=goal.id, title="Phase 2 complete"))

    db_session.add(
        Notification(user_id=user.id, type=NotificationType.TASK_DUE_SOON, title="A task is due soon")
    )

    await db_session.commit()

    result = await db_session.execute(select(User).where(User.id == user.id))
    assert result.scalar_one().email == "migration-smoke-test@example.com"


@pytest.mark.asyncio
async def test_habit_log_unique_per_day(db_session: AsyncSession) -> None:
    user = User(email="dup-log-test@example.com", hashed_password="x", timezone="UTC")
    db_session.add(user)
    await db_session.flush()
    habit = Habit(user_id=user.id, name="Meditate", start_date=date.today(), frequency_config={})
    db_session.add(habit)
    await db_session.flush()

    db_session.add(HabitLog(habit_id=habit.id, user_id=user.id, log_date=date.today(), status=HabitLogStatus.COMPLETED))
    await db_session.commit()

    db_session.add(HabitLog(habit_id=habit.id, user_id=user.id, log_date=date.today(), status=HabitLogStatus.MISSED))
    with pytest.raises(Exception):  # noqa: B017 - IntegrityError, checked generically to avoid a driver-specific import
        await db_session.commit()


@pytest.mark.asyncio
async def test_deleting_user_cascades_to_owned_rows(db_session: AsyncSession) -> None:
    user = User(email="cascade-test@example.com", hashed_password="x", timezone="UTC")
    db_session.add(user)
    await db_session.flush()
    task = Task(user_id=user.id, title="Should disappear with the user")
    db_session.add(task)
    await db_session.commit()

    await db_session.delete(user)
    await db_session.commit()

    result = await db_session.execute(select(Task).where(Task.id == task.id))
    assert result.scalar_one_or_none() is None

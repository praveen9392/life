"""Workout business logic: exercises, workouts, sessions, sets."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.models.workout import Exercise, Workout, WorkoutSession
from app.repositories.workout_repository import (
    ExerciseRepository,
    WorkoutRepository,
    WorkoutSessionRepository,
)
from app.schemas.workout import (
    ExerciseCreateRequest,
    WorkoutCreateRequest,
    WorkoutSessionCreateRequest,
    WorkoutUpdateRequest,
)
from app.utils.datetime import now_utc


class WorkoutService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.exercises = ExerciseRepository(session)
        self.workouts = WorkoutRepository(session)
        self.sessions = WorkoutSessionRepository(session)

    # -- Exercises ---------------------------------------------------------

    async def create_exercise(
        self, user_id: uuid.UUID, payload: ExerciseCreateRequest
    ) -> Exercise:
        exercise = Exercise(
            user_id=user_id,
            name=payload.name,
            muscle_group=payload.muscle_group,
            equipment=payload.equipment,
        )
        self.session.add(exercise)
        await self.session.flush()
        return exercise

    async def list_exercises(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[Exercise]:
        return await self.exercises.list_visible(user_id, search=search, offset=offset, limit=limit)

    # -- Workouts -----------------------------------------------------------

    async def create_workout(
        self, user_id: uuid.UUID, payload: WorkoutCreateRequest
    ) -> Workout:
        return await self.workouts.create_owned(user_id, **payload.model_dump())

    async def get_workout(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> Workout:
        workout = await self.workouts.get_owned(workout_id, user_id)
        if workout is None:
            raise NotFoundError("Workout not found")
        return workout

    async def list_workouts(self, user_id: uuid.UUID) -> list[Workout]:
        items, _ = await self.workouts.list_owned(user_id, limit=200)
        return items

    async def update_workout(
        self, user_id: uuid.UUID, workout_id: uuid.UUID, payload: WorkoutUpdateRequest
    ) -> Workout:
        workout = await self.workouts.update_owned(
            workout_id, user_id, **payload.model_dump(exclude_unset=True)
        )
        if workout is None:
            raise NotFoundError("Workout not found")
        return workout

    async def delete_workout(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> None:
        deleted = await self.workouts.delete_owned(workout_id, user_id)
        if not deleted:
            raise NotFoundError("Workout not found")

    # -- Sessions -----------------------------------------------------------

    async def create_session(
        self, user_id: uuid.UUID, payload: WorkoutSessionCreateRequest
    ) -> WorkoutSession:
        if payload.workout_id is not None:
            await self.get_workout(user_id, payload.workout_id)
        await self._validate_exercise_ids(user_id, payload)

        session = await self.sessions.create_owned(
            user_id,
            workout_id=payload.workout_id,
            performed_at=payload.performed_at or now_utc(),
            duration_minutes=payload.duration_minutes,
            notes=payload.notes,
        )
        for set_input in payload.sets:
            await self.sessions.add_set(session, **set_input.model_dump())
        # Re-fetch with sets eagerly loaded - attribute access on the bare
        # instance would lazy-load, which fails in async context.
        loaded = await self.sessions.get_owned_with_sets(session.id, user_id)
        assert loaded is not None
        return loaded

    async def get_session(
        self, user_id: uuid.UUID, session_id: uuid.UUID
    ) -> WorkoutSession:
        session = await self.sessions.get_owned_with_sets(session_id, user_id)
        if session is None:
            raise NotFoundError("Workout session not found")
        return session

    async def list_sessions(
        self, user_id: uuid.UUID, *, offset: int, limit: int
    ) -> tuple[list[WorkoutSession], int]:
        return await self.sessions.list_for_user(user_id, offset=offset, limit=limit)

    async def delete_session(self, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
        deleted = await self.sessions.delete_owned(session_id, user_id)
        if not deleted:
            raise NotFoundError("Workout session not found")

    async def _validate_exercise_ids(
        self, user_id: uuid.UUID, payload: WorkoutSessionCreateRequest
    ) -> None:
        """Sets may only reference exercises the user can see (shared or own)."""
        for set_input in payload.sets:
            exercise = await self.exercises.get_visible(set_input.exercise_id, user_id)
            if exercise is None:
                raise ValidationError(
                    "Unknown exercise", fields={"exercise_id": str(set_input.exercise_id)}
                )

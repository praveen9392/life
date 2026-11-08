"""Workout business logic: exercises, workouts, sessions, sets."""

import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError, ValidationError
from app.core.logging import logger
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
    """Exercise catalog, workout templates, and logged sessions with sets."""

    def __init__(self, session: AsyncSession):
        """Wire the service (and its repositories) to the request's session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.exercises = ExerciseRepository(session)
        self.workouts = WorkoutRepository(session)
        self.sessions = WorkoutSessionRepository(session)

    # Exercises

    async def create_exercise(
        self, user_id: uuid.UUID, payload: ExerciseCreateRequest
    ) -> Exercise:
        """Create a custom exercise owned by the user.

        Args:
            user_id: Owner of the exercise.
            payload: Name, muscle group, and equipment.

        Returns:
            Exercise: The created exercise.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting exercise creation | user_id={user_id}")
            exercise = Exercise(
                user_id=user_id,
                name=payload.name,
                muscle_group=payload.muscle_group,
                equipment=payload.equipment,
            )
            logger.debug(f"Creating exercise | user_id={user_id}")
            self.session.add(exercise)
            await self.session.flush()
            logger.info(f"Exercise created with id: {exercise.id}")
            return exercise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the exercise: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the exercise: {exc}")
            raise ServiceError("Unexpected error while creating the exercise") from exc

    async def list_exercises(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None,
        offset: int = 0,
        limit: int = 100,
    ) -> list[Exercise]:
        """List exercises visible to the user (own + shared catalog), paginated.

        Args:
            user_id: Owner whose visible exercises are listed.
            search: Optional case-insensitive name filter.
            offset: Number of records to skip for pagination (default 0).
            limit: Maximum number of records to return (default 100).

        Returns:
            list[Exercise]: The visible exercises in the requested window
            (custom exercises first, then by name).

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting exercise listing | user_id={user_id}")
            visible_exercises = await self.exercises.list_visible_query(
                user_id, search=search, offset=offset, limit=limit
            )
            logger.info(f"Successfully retrieved {len(visible_exercises)} exercises")
            return visible_exercises
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the exercises: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the exercises: {exc}")
            raise ServiceError("Unexpected error while listing the exercises") from exc

    # Workouts

    async def create_workout(
        self, user_id: uuid.UUID, payload: WorkoutCreateRequest
    ) -> Workout:
        """Create a workout template owned by the user.

        Args:
            user_id: Owner of the workout.
            payload: Workout fields.

        Returns:
            Workout: The created workout.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout creation | user_id={user_id}")
            created_workout = await self.workouts.create_owned_query(user_id, **payload.model_dump())
            logger.info(f"Workout created with id: {created_workout.id}")
            return created_workout
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the workout: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the workout: {exc}")
            raise ServiceError("Unexpected error while creating the workout") from exc

    async def get_workout(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> Workout:
        """Fetch one workout owned by the user.

        Args:
            user_id: Owner the workout must belong to.
            workout_id: Primary key of the workout.

        Returns:
            Workout: The owned workout.

        Raises:
            NotFoundError: If the workout does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout retrieval | user_id={user_id} workout_id={workout_id}")
            workout = await self.workouts.get_owned_query(workout_id, user_id)
            if workout is None:
                logger.warning(f"Workout not found with id: {workout_id}")
                raise NotFoundError("Workout not found")
            logger.debug(f"Workout retrieval completed | user_id={user_id} workout_id={workout_id}")
            return workout
        except NotFoundError:
            logger.error(f"Workout fetch failed: workout not found | workout_id={workout_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the workout: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the workout: {exc}")
            raise ServiceError("Unexpected error while fetching the workout") from exc

    async def list_workouts(self, user_id: uuid.UUID) -> list[Workout]:
        """List the user's workouts (capped at 200 by the repository).

        Args:
            user_id: Owner of the workouts.

        Returns:
            list[Workout]: The user's workouts (the repository's total count
            is discarded).

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout listing | user_id={user_id}")
            items, _ = await self.workouts.list_owned_query(user_id, limit=200)
            logger.info(f"Successfully retrieved {len(items)} workouts")
            return items
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the workouts: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the workouts: {exc}")
            raise ServiceError("Unexpected error while listing the workouts") from exc

    async def update_workout(
        self, user_id: uuid.UUID, workout_id: uuid.UUID, payload: WorkoutUpdateRequest
    ) -> Workout:
        """Partially update an owned workout.

        Args:
            user_id: Owner the workout must belong to.
            workout_id: Primary key of the workout.
            payload: Fields to change; unset fields are ignored.

        Returns:
            Workout: The updated workout.

        Raises:
            NotFoundError: If the workout does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout update | user_id={user_id} workout_id={workout_id}")
            workout = await self.workouts.update_owned_query(
                workout_id, user_id, **payload.model_dump(exclude_unset=True)
            )
            if workout is None:
                logger.warning(f"Workout not found with id: {workout_id}")
                raise NotFoundError("Workout not found")
            logger.info(f"Workout updated | id={workout_id}")
            return workout
        except NotFoundError:
            logger.error(f"Workout update failed: workout not found | workout_id={workout_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the workout: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the workout: {exc}")
            raise ServiceError("Unexpected error while updating the workout") from exc

    async def delete_workout(self, user_id: uuid.UUID, workout_id: uuid.UUID) -> None:
        """Delete a workout owned by the user.

        Args:
            user_id: Owner the workout must belong to.
            workout_id: Primary key of the workout.

        Raises:
            NotFoundError: If the workout does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout deletion | user_id={user_id} workout_id={workout_id}")
            deleted = await self.workouts.delete_owned_query(workout_id, user_id)
            if not deleted:
                logger.warning(f"Workout not found with id: {workout_id}")
                raise NotFoundError("Workout not found")
            logger.info(f"Workout deleted | id={workout_id}")
        except NotFoundError:
            logger.error(f"Workout delete failed: workout not found | workout_id={workout_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the workout: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the workout: {exc}")
            raise ServiceError("Unexpected error while deleting the workout") from exc

    # Sessions

    async def create_session(
        self, user_id: uuid.UUID, payload: WorkoutSessionCreateRequest
    ) -> WorkoutSession:
        """Log a workout session with its sets, validating references first.

        Args:
            user_id: Owner of the session.
            payload: Session fields plus sets; `workout_id` must be owned
            when present and every set's exercise must be visible to the
            user.

        Returns:
            WorkoutSession: The created session, re-fetched with sets
            eagerly loaded.

        Raises:
            NotFoundError: If the referenced workout does not exist or
            belongs to another user.
            ValidationError: If a set references an unknown/invisible exercise.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout session creation | user_id={user_id}")
            if payload.workout_id is not None:
                await self.get_workout(user_id, payload.workout_id)
            await self._validate_exercise_ids(user_id, payload)

            logger.debug(f"Creating workout session | user_id={user_id}")
            session = await self.sessions.create_owned_query(
                user_id,
                workout_id=payload.workout_id,
                performed_at=payload.performed_at or now_utc(),
                duration_minutes=payload.duration_minutes,
                notes=payload.notes,
            )
            logger.debug(f"Adding {len(payload.sets)} sets to workout session | user_id={user_id}")
            for set_input in payload.sets:
                await self.sessions.add_set_query(session, **set_input.model_dump())
            # Re-fetch with sets eagerly loaded - attribute access on the bare
            # instance would lazy-load, which fails in async context.
            logger.debug(
                f"Re-fetching workout session with sets | user_id={user_id} session_id={session.id}"
            )
            loaded = await self.sessions.get_owned_with_sets_query(session.id, user_id)
            assert loaded is not None
            logger.info(f"Workout session created with id: {loaded.id}")
            return loaded
        except (NotFoundError, ValidationError):
            logger.error(
                f"Workout session creation failed: workout not found or unknown "
                f"exercise | user_id={user_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the workout session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the workout session: {exc}")
            raise ServiceError("Unexpected error while creating the workout session") from exc

    async def get_session(
        self, user_id: uuid.UUID, session_id: uuid.UUID
    ) -> WorkoutSession:
        """Fetch one workout session (with sets) owned by the user.

        Args:
            user_id: Owner the session must belong to.
            session_id: Primary key of the session.

        Returns:
            WorkoutSession: The owned session with sets eagerly loaded.

        Raises:
            NotFoundError: If the session does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(
                f"Starting workout session retrieval | user_id={user_id} session_id={session_id}"
            )
            session = await self.sessions.get_owned_with_sets_query(session_id, user_id)
            if session is None:
                logger.warning(f"Workout session not found with id: {session_id}")
                raise NotFoundError("Workout session not found")
            logger.debug(
                f"Workout session retrieval completed | user_id={user_id} session_id={session_id}"
            )
            return session
        except NotFoundError:
            logger.error(
                f"Workout session fetch failed: session not found | session_id={session_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the workout session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the workout session: {exc}")
            raise ServiceError("Unexpected error while fetching the workout session") from exc

    async def list_sessions(
        self, user_id: uuid.UUID, *, offset: int, limit: int
    ) -> tuple[list[WorkoutSession], int]:
        """List the user's workout sessions (sets eager-loaded), newest first.

        Args:
            user_id: Owner of the sessions.
            offset: Number of records to skip for pagination.
            limit: Maximum number of records to return.

        Returns:
            tuple[list[WorkoutSession], int]: The matching sessions and the
            total count before pagination.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting workout session listing | user_id={user_id}")
            sessions_and_total = await self.sessions.list_for_user_query(
                user_id, offset=offset, limit=limit
            )
            sessions, _total = sessions_and_total
            logger.info(f"Successfully retrieved {len(sessions)} workout sessions")
            return sessions, _total
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the workout sessions: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the workout sessions: {exc}")
            raise ServiceError("Unexpected error while listing the workout sessions") from exc

    async def delete_session(self, user_id: uuid.UUID, session_id: uuid.UUID) -> None:
        """Delete a workout session owned by the user.

        Args:
            user_id: Owner the session must belong to.
            session_id: Primary key of the session.

        Raises:
            NotFoundError: If the session does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(
                f"Starting workout session deletion | user_id={user_id} session_id={session_id}"
            )
            deleted = await self.sessions.delete_owned_query(session_id, user_id)
            if not deleted:
                logger.warning(f"Workout session not found with id: {session_id}")
                raise NotFoundError("Workout session not found")
            logger.info(f"Workout session deleted | id={session_id}")
        except NotFoundError:
            logger.error(
                f"Workout session delete failed: session not found | session_id={session_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the workout session: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the workout session: {exc}")
            raise ServiceError("Unexpected error while deleting the workout session") from exc

    async def _validate_exercise_ids(
        self, user_id: uuid.UUID, payload: WorkoutSessionCreateRequest
    ) -> None:
        """Validate that every set references an exercise the user can see.

        Args:
            user_id: Owner whose visible exercises are checked against.
            payload: Session payload whose sets carry `exercise_id`s.

        Raises:
            ValidationError: If a set references an unknown or invisible
            exercise.
        """
        logger.debug(
            f"Starting _validate_exercise_ids | user_id={user_id} set_count={len(payload.sets)}"
        )
        # One batched query rather than one round-trip per set (N+1).
        exercise_ids = {set_input.exercise_id for set_input in payload.sets}
        logger.debug(
            f"Fetching visible exercises | user_id={user_id} exercise_count={len(exercise_ids)}"
        )
        visible = await self.exercises.get_visible_many_query(exercise_ids, user_id)
        for set_input in payload.sets:
            if set_input.exercise_id not in visible:
                raise ValidationError(
                    "Unknown exercise", fields={"exercise_id": str(set_input.exercise_id)}
                )
        logger.debug(f"Exercise validation passed | user_id={user_id} set_count={len(payload.sets)}")

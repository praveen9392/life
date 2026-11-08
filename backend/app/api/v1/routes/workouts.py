"""Workout routes: exercises, workouts, sessions."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession, get_pagination
from app.core.exceptions import AppException
from app.schemas.workout import (
    ExerciseCreateRequest,
    ExerciseResponse,
    WorkoutCreateRequest,
    WorkoutResponse,
    WorkoutSessionCreateRequest,
    WorkoutSessionResponse,
    WorkoutUpdateRequest,
)
from app.services.workout_service import WorkoutService
from app.utils.pagination import Page, PaginationParams, build_page

router = APIRouter(tags=["workouts"])


# Exercise catalog


@router.get("/exercises", response_model=list[ExerciseResponse])
async def list_exercises(
    current_user: CurrentUser,
    db: DbSession,
    search: str | None = Query(default=None, max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ExerciseResponse]:
    try:
        service = WorkoutService(db)
        exercises = await service.list_exercises(current_user.id, search=search, offset=offset, limit=limit)
        return [ExerciseResponse.model_validate(exercise) for exercise in exercises]
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/exercises", response_model=ExerciseResponse, status_code=201)
async def create_exercise(
    payload: ExerciseCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> ExerciseResponse:
    try:
        service = WorkoutService(db)
        exercise = await service.create_exercise(current_user.id, payload)
        return ExerciseResponse.model_validate(exercise)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


# Workout templates


@router.get("/workouts", response_model=list[WorkoutResponse])
async def list_workouts(current_user: CurrentUser, db: DbSession) -> list[WorkoutResponse]:
    try:
        service = WorkoutService(db)
        workouts = await service.list_workouts(current_user.id)
        return [WorkoutResponse.model_validate(workout) for workout in workouts]
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/workouts", response_model=WorkoutResponse, status_code=201)
async def create_workout(
    payload: WorkoutCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkoutResponse:
    try:
        service = WorkoutService(db)
        workout = await service.create_workout(current_user.id, payload)
        return WorkoutResponse.model_validate(workout)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/workouts/{workout_id}", response_model=WorkoutResponse)
async def update_workout(
    workout_id: uuid.UUID,
    payload: WorkoutUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkoutResponse:
    try:
        service = WorkoutService(db)
        workout = await service.update_workout(current_user.id, workout_id, payload)
        return WorkoutResponse.model_validate(workout)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/workouts/{workout_id}", status_code=204)
async def delete_workout(
    workout_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        service = WorkoutService(db)
        await service.delete_workout(current_user.id, workout_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


# Sessions


@router.get("/workout-sessions", response_model=Page[WorkoutSessionResponse])
async def list_sessions(
    current_user: CurrentUser,
    db: DbSession,
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[WorkoutSessionResponse]:
    try:
        service = WorkoutService(db)
        items, total = await service.list_sessions(
            current_user.id, offset=pagination.offset, limit=pagination.page_size
        )
        return build_page(
            [WorkoutSessionResponse.model_validate(session) for session in items], total, pagination
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/workout-sessions", response_model=WorkoutSessionResponse, status_code=201)
async def create_session(
    payload: WorkoutSessionCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkoutSessionResponse:
    try:
        service = WorkoutService(db)
        session = await service.create_session(current_user.id, payload)
        return WorkoutSessionResponse.model_validate(session)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.get("/workout-sessions/{session_id}", response_model=WorkoutSessionResponse)
async def get_session(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> WorkoutSessionResponse:
    try:
        service = WorkoutService(db)
        session = await service.get_session(current_user.id, session_id)
        return WorkoutSessionResponse.model_validate(session)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/workout-sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        service = WorkoutService(db)
        await service.delete_session(current_user.id, session_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

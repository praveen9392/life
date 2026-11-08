"""Goal routes."""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.schemas.goal import (
    GoalCreateRequest,
    GoalResponse,
    GoalUpdateRequest,
    MilestoneCreateRequest,
    MilestoneResponse,
    MilestoneUpdateRequest,
)
from app.services.goal_service import GoalService

router = APIRouter(prefix="/goals", tags=["goals"])

# See the matching note in `habits.py` - generous default to stay backward
# compatible with the previously fully-unbounded endpoint.
_DEFAULT_LIST_LIMIT = 200


@router.get("", response_model=list[GoalResponse])
async def list_goals(
    current_user: CurrentUser,
    db: DbSession,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=_DEFAULT_LIST_LIMIT, ge=1, le=500),
) -> list[GoalResponse]:
    try:
        goals = await GoalService(db).list_goals(current_user.id, offset=offset, limit=limit)
        return [GoalResponse.model_validate(goal) for goal in goals]
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("", response_model=GoalResponse, status_code=201)
async def create_goal(
    payload: GoalCreateRequest, current_user: CurrentUser, db: DbSession
) -> GoalResponse:
    try:
        goal = await GoalService(db).create_goal(current_user.id, payload)
        return GoalResponse.model_validate(goal)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.get("/{goal_id}", response_model=GoalResponse)
async def get_goal(
    goal_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> GoalResponse:
    try:
        goal = await GoalService(db).get_goal(current_user.id, goal_id)
        return GoalResponse.model_validate(goal)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/{goal_id}", response_model=GoalResponse)
async def update_goal(
    goal_id: uuid.UUID, payload: GoalUpdateRequest, current_user: CurrentUser, db: DbSession
) -> GoalResponse:
    try:
        goal = await GoalService(db).update_goal(current_user.id, goal_id, payload)
        return GoalResponse.model_validate(goal)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/{goal_id}", status_code=204)
async def delete_goal(goal_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> None:
    try:
        await GoalService(db).delete_goal(current_user.id, goal_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/{goal_id}/milestones", response_model=MilestoneResponse, status_code=201)
async def add_milestone(
    goal_id: uuid.UUID,
    payload: MilestoneCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> MilestoneResponse:
    try:
        milestone = await GoalService(db).add_milestone(current_user.id, goal_id, payload)
        return MilestoneResponse.model_validate(milestone)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/milestones/{milestone_id}", response_model=MilestoneResponse)
async def update_milestone(
    milestone_id: uuid.UUID,
    payload: MilestoneUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> MilestoneResponse:
    try:
        milestone = await GoalService(db).update_milestone(current_user.id, milestone_id, payload)
        return MilestoneResponse.model_validate(milestone)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/milestones/{milestone_id}", status_code=204)
async def delete_milestone(
    milestone_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> None:
    try:
        await GoalService(db).delete_milestone(current_user.id, milestone_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

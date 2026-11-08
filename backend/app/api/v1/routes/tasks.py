"""Task routes - thin HTTP layer over TaskService."""

import uuid
from datetime import date

# Aliased: `list_tasks` has a query parameter named `status` that would shadow it.
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as fastapi_status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession, get_pagination
from app.core.exceptions import AppException
from app.repositories.task_repository import SortOrder, TaskSortField
from app.schemas.task import TaskCreateRequest, TaskResponse, TaskUpdateRequest
from app.services.task_service import TaskService
from app.utils.enums import TaskList, TaskPriority, TaskStatus
from app.utils.pagination import Page, PaginationParams, build_page

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=Page[TaskResponse])
async def list_tasks(
    current_user: CurrentUser,
    db: DbSession,
    status: TaskStatus | None = None,
    task_list: TaskList | None = Query(default=None, alias="list"),
    priority: TaskPriority | None = None,
    due_before: date | None = None,
    due_on: date | None = None,
    due_from: date | None = None,
    overdue: bool = False,
    search: str | None = Query(default=None, max_length=200),
    sort: TaskSortField | None = Query(
        default=None, description="Defaults to the fixed due-date/created-at ordering when omitted."
    ),
    order: SortOrder = Query(default="desc"),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[TaskResponse]:
    try:
        service = TaskService(db)
        items, total = await service.list_tasks(
            current_user.id,
            status=status,
            task_list=task_list.value if task_list else None,
            priority=priority,
            due_before=due_before,
            due_on=due_on,
            due_from=due_from,
            overdue=overdue,
            search=search,
            offset=pagination.offset,
            limit=pagination.page_size,
            sort=sort,
            order=order,
            user_timezone=current_user.timezone,
        )
        return build_page(
            [TaskResponse.model_validate(task) for task in items], total, pagination
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("", response_model=TaskResponse, status_code=201)
async def create_task(
    payload: TaskCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    try:
        service = TaskService(db)
        task = await service.create_task(
            current_user.id, payload, user_timezone=current_user.timezone
        )
        return TaskResponse.model_validate(task)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.get("/{task_id}", response_model=TaskResponse)
async def get_task(
    task_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    try:
        service = TaskService(db)
        task = await service.get_task(current_user.id, task_id)
        return TaskResponse.model_validate(task)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/{task_id}", response_model=TaskResponse)
async def update_task(
    task_id: uuid.UUID,
    payload: TaskUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    try:
        service = TaskService(db)
        task = await service.update_task(
            current_user.id, task_id, payload, user_timezone=current_user.timezone
        )
        return TaskResponse.model_validate(task)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        service = TaskService(db)
        await service.delete_task(current_user.id, task_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/templates/{template_id}", response_model=TaskResponse)
async def update_recurrence_template(
    template_id: uuid.UUID,
    payload: TaskUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TaskResponse:
    """Edit a recurrence template - 'this and future occurrences'."""
    try:
        service = TaskService(db)
        template = await service.update_template(current_user.id, template_id, payload)
        return TaskResponse.model_validate(template)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=fastapi_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

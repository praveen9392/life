"""Learning routes: items, course tree, study sessions."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession, get_pagination
from app.core.exceptions import AppException
from app.schemas.learning import (
    CourseCreateRequest,
    CourseDetailResponse,
    CourseLessonCreateRequest,
    CourseLessonUpdateRequest,
    CourseModuleCreateRequest,
    CourseResponse,
    CourseUpdateRequest,
    LearningItemCreateRequest,
    LearningItemResponse,
    LearningItemUpdateRequest,
    LearningSessionCreateRequest,
    LearningSessionResponse,
    LessonResponse,
    ModuleResponse,
)
from app.services.learning_service import LearningService, course_progress
from app.utils.pagination import Page, PaginationParams, build_page

router = APIRouter(prefix="/learning", tags=["learning"])


def _course_response(course, progress_percent: int) -> CourseResponse:
    """Build the response explicitly: progress is derived, never stored."""
    return CourseResponse(
        id=course.id,
        title=course.title,
        provider=course.provider,
        start_date=course.start_date,
        target_date=course.target_date,
        status=course.status,
        progress_percent=progress_percent,
        created_at=course.created_at,
    )


# Learning items


@router.get("/items", response_model=list[LearningItemResponse])
async def list_items(current_user: CurrentUser, db: DbSession) -> list[LearningItemResponse]:
    try:
        items = await LearningService(db).list_items(current_user.id)
        return [LearningItemResponse.model_validate(item) for item in items]
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/items", response_model=LearningItemResponse, status_code=201)
async def create_item(
    payload: LearningItemCreateRequest, current_user: CurrentUser, db: DbSession
) -> LearningItemResponse:
    try:
        item = await LearningService(db).create_item(current_user.id, payload)
        return LearningItemResponse.model_validate(item)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/items/{item_id}", response_model=LearningItemResponse)
async def update_item(
    item_id: uuid.UUID, payload: LearningItemUpdateRequest, current_user: CurrentUser, db: DbSession
) -> LearningItemResponse:
    try:
        item = await LearningService(db).update_item(current_user.id, item_id, payload)
        return LearningItemResponse.model_validate(item)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/items/{item_id}", status_code=204)
async def delete_item(item_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> None:
    try:
        await LearningService(db).delete_item(current_user.id, item_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


# Courses


@router.get("/courses", response_model=list[CourseResponse])
async def list_courses(
    current_user: CurrentUser,
    db: DbSession,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[CourseResponse]:
    try:
        courses = await LearningService(db).list_courses(current_user.id, offset=offset, limit=limit)
        return [_course_response(course, course_progress(course)) for course in courses]
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/courses", response_model=CourseResponse, status_code=201)
async def create_course(
    payload: CourseCreateRequest, current_user: CurrentUser, db: DbSession
) -> CourseResponse:
    try:
        course = await LearningService(db).create_course(current_user.id, payload)
        return _course_response(course, 0)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.get("/courses/{course_id}", response_model=CourseDetailResponse)
async def get_course(
    course_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> CourseDetailResponse:
    try:
        course = await LearningService(db).get_course_tree(current_user.id, course_id)
        detail = CourseDetailResponse(
            **_course_response(course, course_progress(course)).model_dump(),
            modules=[ModuleResponse.model_validate(module) for module in course.modules],
        )
        return detail
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/courses/{course_id}", response_model=CourseResponse)
async def update_course(
    course_id: uuid.UUID, payload: CourseUpdateRequest, current_user: CurrentUser, db: DbSession
) -> CourseResponse:
    try:
        await LearningService(db).update_course(current_user.id, course_id, payload)
        # Re-fetch with the tree so progress reflects current lesson states.
        tree = await LearningService(db).get_course_tree(current_user.id, course_id)
        return _course_response(tree, course_progress(tree))
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/courses/{course_id}", status_code=204)
async def delete_course(course_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> None:
    try:
        await LearningService(db).delete_course(current_user.id, course_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/courses/{course_id}/modules", response_model=ModuleResponse, status_code=201)
async def add_module(
    course_id: uuid.UUID,
    payload: CourseModuleCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> ModuleResponse:
    try:
        module = await LearningService(db).add_module(current_user.id, course_id, payload)
        return ModuleResponse(id=module.id, title=module.title, position=module.position, lessons=[])
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/modules/{module_id}/lessons", response_model=LessonResponse, status_code=201)
async def add_lesson(
    module_id: uuid.UUID,
    payload: CourseLessonCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> LessonResponse:
    try:
        lesson = await LearningService(db).add_lesson(current_user.id, module_id, payload)
        return LessonResponse.model_validate(lesson)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/lessons/{lesson_id}", response_model=LessonResponse)
async def update_lesson(
    lesson_id: uuid.UUID,
    payload: CourseLessonUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> LessonResponse:
    try:
        lesson = await LearningService(db).update_lesson(current_user.id, lesson_id, payload)
        return LessonResponse.model_validate(lesson)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


# Study sessions


@router.get("/sessions", response_model=Page[LearningSessionResponse])
async def list_sessions(
    current_user: CurrentUser,
    db: DbSession,
    since: date | None = Query(default=None),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[LearningSessionResponse]:
    try:
        items, total = await LearningService(db).list_sessions(
            current_user.id, since=since, offset=pagination.offset, limit=pagination.page_size
        )
        return build_page(
            [LearningSessionResponse.model_validate(session) for session in items], total, pagination
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/sessions", response_model=LearningSessionResponse, status_code=201)
async def log_session(
    payload: LearningSessionCreateRequest, current_user: CurrentUser, db: DbSession
) -> LearningSessionResponse:
    try:
        session = await LearningService(db).log_session(current_user.id, payload)
        return LearningSessionResponse.model_validate(session)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> None:
    try:
        await LearningService(db).delete_session(current_user.id, session_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

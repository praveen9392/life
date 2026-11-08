"""Tag routes - thin HTTP layer over TagService."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.schemas.tag import TagCreateRequest, TagResponse
from app.services.tag_service import TagService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
async def list_tags(
    current_user: CurrentUser,
    db: DbSession,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[TagResponse]:
    try:
        service = TagService(db)
        tags = await service.list_tags(current_user.id, offset=offset, limit=limit)
        return [TagResponse.model_validate(tag) for tag in tags]
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(
    payload: TagCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TagResponse:
    try:
        service = TagService(db)
        tag = await service.create_tag(current_user.id, payload)
        return TagResponse.model_validate(tag)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

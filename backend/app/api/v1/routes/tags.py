"""Tag routes - thin HTTP layer over TagService."""

from fastapi import APIRouter

from app.api.deps import CurrentUser, DbSession
from app.schemas.tag import TagCreateRequest, TagResponse
from app.services.tag_service import TagService

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[TagResponse])
async def list_tags(current_user: CurrentUser, db: DbSession) -> list[TagResponse]:
    service = TagService(db)
    tags = await service.list_tags(current_user.id)
    return [TagResponse.model_validate(tag) for tag in tags]


@router.post("", response_model=TagResponse, status_code=201)
async def create_tag(
    payload: TagCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TagResponse:
    service = TagService(db)
    tag = await service.create_tag(current_user.id, payload)
    return TagResponse.model_validate(tag)

"""Note routes - thin HTTP layer over NoteService."""

import uuid

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, DbSession, get_pagination
from app.repositories.note_repository import NoteSortField, SortOrder
from app.schemas.note import NoteCreateRequest, NoteResponse, NoteUpdateRequest
from app.services.note_service import NoteService
from app.utils.pagination import Page, PaginationParams

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("", response_model=Page[NoteResponse])
async def list_notes(
    current_user: CurrentUser,
    db: DbSession,
    search: str | None = Query(default=None, max_length=200),
    sort: NoteSortField | None = Query(
        default=None, description="Defaults to the fixed pinned-first/updated-at ordering when omitted."
    ),
    order: SortOrder = Query(default="desc"),
    pagination: PaginationParams = Depends(get_pagination),
) -> Page[NoteResponse]:
    service = NoteService(db)
    items, total = await service.list_notes(
        current_user.id,
        search=search,
        offset=pagination.offset,
        limit=pagination.page_size,
        sort=sort,
        order=order,
    )
    return Page(
        items=[NoteResponse.model_validate(note) for note in items],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post("", response_model=NoteResponse, status_code=201)
async def create_note(
    payload: NoteCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteResponse:
    service = NoteService(db)
    note = await service.create_note(current_user.id, payload)
    return NoteResponse.model_validate(note)


@router.get("/{note_id}", response_model=NoteResponse)
async def get_note(
    note_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteResponse:
    service = NoteService(db)
    note = await service.get_note(current_user.id, note_id)
    return NoteResponse.model_validate(note)


@router.patch("/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: uuid.UUID,
    payload: NoteUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteResponse:
    service = NoteService(db)
    note = await service.update_note(current_user.id, note_id, payload)
    return NoteResponse.model_validate(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    service = NoteService(db)
    await service.delete_note(current_user.id, note_id)

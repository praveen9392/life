"""Note directory routes - thin HTTP layer over NoteDirectoryService."""

import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.models.note_directory import NoteDirectory
from app.schemas.note_directory import (
    MoveNotesRequest,
    MoveNotesResponse,
    NoteDirectoryCreateRequest,
    NoteDirectoryListResponse,
    NoteDirectoryResponse,
    NoteDirectoryUpdateRequest,
)
from app.services.note_directory_service import NoteDirectoryService

router = APIRouter(prefix="/note-directories", tags=["notes"])


def _directory_response(directory: NoteDirectory, note_count: int) -> NoteDirectoryResponse:
    """`note_count` is derived, not an ORM column - responses are built
    explicitly instead of `model_validate`-ing the bare ORM object (see
    AGENTS.md learnings)."""
    return NoteDirectoryResponse(
        id=directory.id,
        name=directory.name,
        note_count=note_count,
        created_at=directory.created_at,
        updated_at=directory.updated_at,
    )


@router.get("", response_model=NoteDirectoryListResponse)
async def list_directories(
    current_user: CurrentUser,
    db: DbSession,
) -> NoteDirectoryListResponse:
    try:
        service = NoteDirectoryService(db)
        folders, unfiled_count, total_count = await service.list_directories(current_user.id)
        return NoteDirectoryListResponse(
            items=[_directory_response(folder, note_count) for folder, note_count in folders],
            unfiled_count=unfiled_count,
            total_count=total_count,
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("", response_model=NoteDirectoryResponse, status_code=201)
async def create_directory(
    payload: NoteDirectoryCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteDirectoryResponse:
    try:
        service = NoteDirectoryService(db)
        directory = await service.create_directory(current_user.id, payload)
        return _directory_response(directory, note_count=0)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.patch("/{directory_id}", response_model=NoteDirectoryResponse)
async def rename_directory(
    directory_id: uuid.UUID,
    payload: NoteDirectoryUpdateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> NoteDirectoryResponse:
    try:
        service = NoteDirectoryService(db)
        directory = await service.rename_directory(current_user.id, directory_id, payload)
        note_count = await service.count_notes(current_user.id, directory.id)
        return _directory_response(directory, note_count=note_count)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/{directory_id}", status_code=204)
async def delete_directory(
    directory_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    try:
        service = NoteDirectoryService(db)
        # The deleted-note count is internal bookkeeping; the client only needs 204.
        await service.delete_directory(current_user.id, directory_id)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.post("/{directory_id}/notes", response_model=MoveNotesResponse)
async def move_notes(
    directory_id: uuid.UUID,
    payload: MoveNotesRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> MoveNotesResponse:
    try:
        service = NoteDirectoryService(db)
        moved = await service.move_notes(current_user.id, directory_id, payload.note_ids)
        return MoveNotesResponse(moved=moved)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

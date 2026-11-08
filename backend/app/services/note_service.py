"""Note business logic."""

import uuid

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError
from app.core.logging import logger
from app.models.note import Note
from app.repositories.note_directory_repository import NoteDirectoryRepository
from app.repositories.note_repository import NoteRepository, NoteSortField, SortOrder
from app.schemas.note import NoteCreateRequest, NoteUpdateRequest
from app.services.tag_service import TagService


class NoteService:
    """Note business logic: CRUD with optional filing and tagging."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.notes = NoteRepository(session)

    async def _validate_directory(self, user_id: uuid.UUID, directory_id: uuid.UUID) -> None:
        """Raise 404 unless `directory_id` is a folder owned by `user_id`.

        Args:
            user_id: Owner the folder must belong to.
            directory_id: Primary key of the folder.

        Raises:
            NotFoundError: If the folder does not exist or belongs to another user.
        """
        logger.debug(f"Starting _validate_directory | user_id={user_id} directory_id={directory_id}")
        folder = await NoteDirectoryRepository(self.session).get_owned_query(directory_id, user_id)
        if folder is None:
            logger.warning(f"Folder not found with id: {directory_id}")
            raise NotFoundError("Folder not found")
        logger.debug(f"Directory validated | user_id={user_id} directory_id={directory_id}")

    async def create_note(self, user_id: uuid.UUID, payload: NoteCreateRequest) -> Note:
        """Create a note for the user, optionally filed and tagged.

        Args:
            user_id: Owner of the note.
            payload: Note fields plus optional `directory_id` (validated)
                and `tag_ids` (unowned ids dropped).

        Returns:
            Note: The created note with its `tags` relationship loaded.

        Raises:
            NotFoundError: If the target folder does not exist or belongs to
                another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting note creation | user_id={user_id}")
            if payload.directory_id is not None:
                await self._validate_directory(user_id, payload.directory_id)
            fields = payload.model_dump(exclude={"tag_ids"})
            logger.debug(f"Creating note | user_id={user_id}")
            note = await self.notes.create_owned_query(user_id, **fields)
            # Always resolve tags (empty list when none were sent) so the `tags`
            # relationship is loaded before serialization - lazy-loading it in
            # async context raises MissingGreenlet (see AGENTS.md learnings).
            await self._apply_tags(user_id, note, payload.tag_ids or [])
            logger.info(f"Note created with id: {note.id}")
            return note
        except NotFoundError:
            logger.error(
                f"Note creation failed: folder not found | directory_id={payload.directory_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the note: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the note: {exc}")
            raise ServiceError("Unexpected error while creating the note") from exc

    async def _apply_tags(self, user_id: uuid.UUID, note: Note, tag_ids: list[uuid.UUID]) -> None:
        """Attach exactly `tag_ids` to `note`, dropping unowned ids.

        Args:
            user_id: Owner the tags must belong to.
            note: Note to tag; refreshed with its `tags` relationship loaded.
            tag_ids: Tag primary keys to attach (unowned ids silently
                dropped).
        """
        logger.debug(
            f"Starting _apply_tags | user_id={user_id} note_id={note.id} tag_count={len(tag_ids)}"
        )
        owned_tags = await TagService(self.session).resolve_owned_tag_ids(user_id, tag_ids)
        await self.notes.set_tags_query(note.id, [tag.id for tag in owned_tags])
        await self.session.refresh(note, attribute_names=["tags"])
        logger.debug(f"Note tags applied | note_id={note.id} tag_count={len(owned_tags)}")

    async def get_note(self, user_id: uuid.UUID, note_id: uuid.UUID) -> Note:
        """Fetch one note owned by the user.

        Args:
            user_id: Owner the note must belong to.
            note_id: Primary key of the note.

        Returns:
            Note: The owned note.

        Raises:
            NotFoundError: If the note does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting note retrieval | user_id={user_id} note_id={note_id}")
            note = await self.notes.get_owned_query(note_id, user_id)
            if note is None:
                logger.warning(f"Note not found with id: {note_id}")
                raise NotFoundError("Note not found")
            logger.debug(f"Note retrieval completed | user_id={user_id} note_id={note_id}")
            return note
        except NotFoundError:
            logger.error(f"Note fetch failed: note not found | note_id={note_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the note: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the note: {exc}")
            raise ServiceError("Unexpected error while fetching the note") from exc

    async def list_notes(
        self,
        user_id: uuid.UUID,
        *,
        search: str | None,
        offset: int,
        limit: int,
        sort: NoteSortField | None = None,
        order: SortOrder = "desc",
        directory_id: uuid.UUID | None = None,
        unfiled_only: bool = False,
    ) -> tuple[list[Note], int]:
        """List the user's non-archived notes, filtered/sorted and paginated.

        Args:
            user_id: Owner of the notes.
            search: Optional case-insensitive title filter.
            offset: Number of records to skip for pagination.
            limit: Maximum number of records to return.
            sort: Optional sort field (repository default ordering when None).
            order: Sort direction, "asc" or "desc" (default "desc").
            directory_id: Optional folder filter.
            unfiled_only: When True, return only notes without a folder.

        Returns:
            tuple[list[Note], int]: The matching notes (pinned first, tags
            eager-loaded) and the total count before pagination.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting note listing | user_id={user_id}")
            notes_and_total = await self.notes.list_for_user_query(
                user_id,
                search=search,
                offset=offset,
                limit=limit,
                sort=sort,
                order=order,
                directory_id=directory_id,
                unfiled_only=unfiled_only,
            )
            notes, _total = notes_and_total
            logger.info(f"Successfully retrieved {len(notes)} notes")
            return notes, _total
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the notes: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the notes: {exc}")
            raise ServiceError("Unexpected error while listing the notes") from exc

    async def update_note(
        self, user_id: uuid.UUID, note_id: uuid.UUID, payload: NoteUpdateRequest
    ) -> Note:
        """Partially update a note, optionally re-filing and re-tagging it.

        Args:
            user_id: Owner the note must belong to.
            note_id: Primary key of the note.
            payload: Fields to change; a non-None `directory_id` is
                validated and a `tag_ids` list replaces the note's tags
                (unowned ids dropped).

        Returns:
            Note: The refreshed note with its `tags` relationship loaded.

        Raises:
            NotFoundError: If the note or target folder does not exist or
                belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting note update | user_id={user_id} note_id={note_id}")
            note = await self.get_note(user_id, note_id)
            changes = payload.model_dump(exclude_unset=True)
            tag_ids = changes.pop("tag_ids", None)
            if "directory_id" in changes and changes["directory_id"] is not None:
                await self._validate_directory(user_id, changes["directory_id"])
            logger.debug(f"Applying note update | note_id={note_id}")
            for key, value in changes.items():
                setattr(note, key, value)
            await self.session.flush()
            await self.session.refresh(note)
            if tag_ids is None:
                await self.session.refresh(note, attribute_names=["tags"])
            else:
                await self._apply_tags(user_id, note, tag_ids)
            logger.info(f"Note updated | id={note_id}")
            return note
        except NotFoundError:
            logger.error(f"Note update failed: note or folder not found | note_id={note_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the note: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the note: {exc}")
            raise ServiceError("Unexpected error while updating the note") from exc

    async def delete_note(self, user_id: uuid.UUID, note_id: uuid.UUID) -> None:
        """Soft-delete (trash) a note owned by the user.

        Args:
            user_id: Owner the note must belong to.
            note_id: Primary key of the note.

        Raises:
            NotFoundError: If the note does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting note deletion | user_id={user_id} note_id={note_id}")
            deleted = await self.notes.delete_owned_query(note_id, user_id)
            if not deleted:
                logger.warning(f"Note not found with id: {note_id}")
                raise NotFoundError("Note not found")
            logger.info(f"Note deleted | id={note_id}")
        except NotFoundError:
            logger.error(f"Note delete failed: note not found | note_id={note_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the note: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the note: {exc}")
            raise ServiceError("Unexpected error while deleting the note") from exc

"""Note directory business logic: flat folders for organizing notes."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ServiceError
from app.core.logging import logger
from app.models.note import Note
from app.models.note_directory import NoteDirectory
from app.repositories.note_directory_repository import NoteDirectoryRepository
from app.repositories.note_repository import NoteRepository
from app.schemas.note_directory import NoteDirectoryCreateRequest, NoteDirectoryUpdateRequest


class NoteDirectoryService:
    """Flat note folders (directories) with live note counts and moves."""

    def __init__(self, session: AsyncSession):
        """Wire the service (and its repositories) to the request's session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.directories = NoteDirectoryRepository(session)
        self.notes = NoteRepository(session)

    async def create_directory(
        self, user_id: uuid.UUID, payload: NoteDirectoryCreateRequest
    ) -> NoteDirectory:
        """Create a folder for the user.

        A duplicate name surfaces the `uq_note_directories_user_id_name`
        unique constraint as a 409 CONFLICT rather than a raw database error.

        Args:
            user_id: Owner of the folder.
            payload: Folder name.

        Returns:
            NoteDirectory: The created folder, refreshed so server-managed
            timestamps are loaded.

        Raises:
            ConflictError: If a folder with this name already exists.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting folder creation | user_id={user_id}")
            # A SAVEPOINT scopes the rollback to just this insert, so a
            # duplicate name doesn't abort the rest of the caller's request
            # transaction (mirrors `TagService.create_tag`).
            async with self.session.begin_nested():
                directory = await self.directories.create_owned_query(user_id, name=payload.name)
            # Server-managed columns (created_at/updated_at) expire on flush;
            # refresh eagerly so callers never trigger a lazy load in async code.
            await self.session.refresh(directory)
            logger.info(f"Folder created with id: {directory.id}")
            return directory
        except IntegrityError as exc:
            logger.warning(f"Folder name already exists for user {user_id}")
            raise ConflictError("A folder with this name already exists") from exc
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the folder: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the folder: {exc}")
            raise ServiceError("Unexpected error while creating the folder") from exc

    async def list_directories(
        self, user_id: uuid.UUID
    ) -> tuple[list[tuple[NoteDirectory, int]], int, int]:
        """List the user's folders with their live note counts.

        Args:
            user_id: Owner of the folders.

        Returns:
            tuple[list[tuple[NoteDirectory, int]], int, int]: (folder,
            live-note-count) pairs ordered by name, the user's unfiled note
            count, and the user's total live note count.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting folder listing | user_id={user_id}")
            directories_with_counts = await self.directories.list_with_counts_query(user_id)
            logger.info(f"Successfully retrieved {len(directories_with_counts)} folders")
            return directories_with_counts
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the folders: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the folders: {exc}")
            raise ServiceError("Unexpected error while listing the folders") from exc

    async def count_notes(self, user_id: uuid.UUID, directory_id: uuid.UUID) -> int:
        """Count the live (non-deleted, non-archived) notes in one owned folder.

        Used to rebuild a folder's response after a rename.

        Args:
            user_id: Owner the folder must belong to.
            directory_id: Primary key of the folder.

        Returns:
            int: Number of notes currently filed in the folder.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting folder note count | user_id={user_id} directory_id={directory_id}")
            note_count = await self.directories.count_notes_query(user_id, directory_id)
            logger.debug(
                f"Folder note count completed | directory_id={directory_id} count={note_count}"
            )
            return note_count
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while counting the notes: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while counting the notes: {exc}")
            raise ServiceError("Unexpected error while counting the notes") from exc

    async def rename_directory(
        self, user_id: uuid.UUID, directory_id: uuid.UUID, payload: NoteDirectoryUpdateRequest
    ) -> NoteDirectory:
        """Rename an owned folder.

        Args:
            user_id: Owner the folder must belong to.
            directory_id: Primary key of the folder.
            payload: New folder name.

        Returns:
            NoteDirectory: The refreshed folder.

        Raises:
            ConflictError: If a folder with the new name already exists.
            NotFoundError: If the folder does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting folder rename | user_id={user_id} directory_id={directory_id}")
            directory = await self.directories.get_owned_query(directory_id, user_id)
            if directory is None:
                logger.warning(f"Folder not found with id: {directory_id}")
                raise NotFoundError("Folder not found")
            directory.name = payload.name
            logger.debug(f"Applying folder rename | directory_id={directory_id}")
            async with self.session.begin_nested():
                await self.session.flush()
            await self.session.refresh(directory)
            logger.info(f"Folder renamed | id={directory_id}")
            return directory
        except IntegrityError as exc:
            logger.warning(f"Folder name already exists for user {user_id}")
            raise ConflictError("A folder with this name already exists") from exc
        except NotFoundError:
            logger.error(f"Folder rename failed: folder not found | directory_id={directory_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while renaming the folder: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while renaming the folder: {exc}")
            raise ServiceError("Unexpected error while renaming the folder") from exc

    async def delete_directory(self, user_id: uuid.UUID, directory_id: uuid.UUID) -> int:
        """Hard-delete a folder and soft-delete (trash) the notes it contained.

        The notes are trashed in the same request transaction and the number
        trashed is returned. Notes already in the trash keep their
        `directory_id` until the folder row disappears, whereupon the FK's
        ON DELETE SET NULL unfiles them.

        Args:
            user_id: Owner the folder must belong to.
            directory_id: Primary key of the folder.

        Returns:
            int: Number of live notes moved to the trash.

        Raises:
            NotFoundError: If the folder does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting folder deletion | user_id={user_id} directory_id={directory_id}")
            folder = await self.directories.get_owned_query(directory_id, user_id)
            if folder is None:
                logger.warning(f"Folder not found with id: {directory_id}")
                raise NotFoundError("Folder not found")
            logger.debug(f"Trashing folder notes | user_id={user_id} directory_id={directory_id}")
            result = await self.session.execute(
                update(Note)
                .where(
                    Note.directory_id == directory_id,
                    Note.user_id == user_id,
                    Note.deleted_at.is_(None),
                )
                .values(deleted_at=datetime.now(UTC), directory_id=None)
                .execution_options(synchronize_session=False)
            )
            await self.session.delete(folder)
            await self.session.flush()
            logger.info(f"Folder deleted | id={directory_id} | notes_trashed={result.rowcount}")
            return result.rowcount
        except NotFoundError:
            logger.error(f"Folder delete failed: folder not found | directory_id={directory_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the folder: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the folder: {exc}")
            raise ServiceError("Unexpected error while deleting the folder") from exc

    async def move_notes(
        self, user_id: uuid.UUID, directory_id: uuid.UUID | None, note_ids: list[uuid.UUID]
    ) -> int:
        """Move notes into a folder (or back to unfiled).

        Foreign note ids are silently dropped by the ownership-scoped UPDATE
        (see `NoteRepository.move_notes_query`).

        Args:
            user_id: Owner of the notes and destination folder.
            directory_id: Destination folder key, or None to unfile.
            note_ids: Primary keys of the notes to move.

        Returns:
            int: Number of notes actually moved.

        Raises:
            NotFoundError: If the destination folder does not exist or
                belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(
                f"Starting note move | user_id={user_id} directory_id={directory_id} "
                f"note_count={len(note_ids)}"
            )
            if directory_id is not None:
                logger.debug(
                    f"Fetching destination folder | user_id={user_id} directory_id={directory_id}"
                )
                folder = await self.directories.get_owned_query(directory_id, user_id)
                if folder is None:
                    logger.warning(f"Folder not found with id: {directory_id}")
                    raise NotFoundError("Folder not found")
            logger.debug(f"Moving notes | user_id={user_id} directory_id={directory_id}")
            moved_count = await self.notes.move_notes_query(user_id, note_ids, directory_id)
            destination = "unfiled" if directory_id is None else str(directory_id)
            logger.info(f"Moved {moved_count} notes to {destination}")
            return moved_count
        except NotFoundError:
            logger.error(
                f"Note move failed: destination folder not found | directory_id={directory_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while moving the notes: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while moving the notes: {exc}")
            raise ServiceError("Unexpected error while moving the notes") from exc

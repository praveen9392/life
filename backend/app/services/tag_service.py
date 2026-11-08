"""Tag business logic: a small, shared label catalog reused by tasks/notes."""

import uuid

from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ServiceError
from app.core.logging import logger
from app.models.tag import Tag
from app.repositories.tag_repository import TagRepository
from app.schemas.tag import TagCreateRequest


class TagService:
    """Shared label catalog reused by tasks and notes."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.tags = TagRepository(session)

    async def list_tags(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Tag]:
        """List the user's tags alphabetically, paginated.

        Args:
            user_id: Owner of the tags.
            offset: Number of records to skip for pagination (default 0).
            limit: Maximum number of records to return (default 100).

        Returns:
            list[Tag]: The user's tags in the requested window.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting tag listing | user_id={user_id}")
            user_tags = await self.tags.list_for_user_query(user_id, offset=offset, limit=limit)
            logger.info(f"Successfully retrieved {len(user_tags)} tags")
            return user_tags
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the tags: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the tags: {exc}")
            raise ServiceError("Unexpected error while listing the tags") from exc

    async def create_tag(self, user_id: uuid.UUID, payload: TagCreateRequest) -> Tag:
        """Create a tag for the user.

        A duplicate name surfaces the `uq_tags_user_name` unique constraint
        as a 409 CONFLICT rather than a raw database error.

        Args:
            user_id: Owner of the tag.
            payload: Tag name (trimmed before insert).

        Returns:
            Tag: The created tag.

        Raises:
            ConflictError: If a tag with this name already exists.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting tag creation | user_id={user_id}")
            tag = Tag(user_id=user_id, name=payload.name.strip())
            logger.debug(f"Creating tag | user_id={user_id}")
            self.session.add(tag)
            # A SAVEPOINT scopes the rollback to just this insert, so a
            # duplicate name doesn't abort the rest of the caller's request
            # transaction (e.g. when creating a task alongside a new tag).
            async with self.session.begin_nested():
                await self.session.flush()
            logger.info(f"Tag created with id: {tag.id}")
            return tag
        except IntegrityError as exc:
            logger.warning(f"Tag name already exists for user {user_id}")
            raise ConflictError("A tag with this name already exists") from exc
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the tag: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the tag: {exc}")
            raise ServiceError("Unexpected error while creating the tag") from exc

    async def resolve_owned_tag_ids(
        self, user_id: uuid.UUID, tag_ids: list[uuid.UUID] | None
    ) -> list[Tag]:
        """Validate that each tag id belongs to the user, dropping the rest.

        Ids that don't (either nonexistent or owned by someone else) are
        silently dropped rather than raising, matching the "don't leak
        existence" pattern used elsewhere (see ARCHITECTURE.md).

        Args:
            user_id: Owner the tags must belong to.
            tag_ids: Candidate tag primary keys; None or empty skips the
            query entirely.

        Returns:
            list[Tag]: The owned Tag rows for the ids that matched.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(
                f"Starting tag ownership resolution | user_id={user_id} tag_count={len(tag_ids or [])}"
            )
            if not tag_ids:
                return []
            logger.debug(f"Fetching owned tags | user_id={user_id} tag_count={len(tag_ids)}")
            owned_tags = await self.tags.list_owned_by_ids_query(user_id, tag_ids)
            if len(owned_tags) < len(tag_ids):
                logger.debug(
                    f"Dropped {len(tag_ids) - len(owned_tags)} unowned tag ids for user {user_id}"
                )
            logger.debug(
                f"Tag ownership resolution completed | user_id={user_id} owned_count={len(owned_tags)}"
            )
            return owned_tags
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while resolving the owned tags: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while resolving the owned tags: {exc}")
            raise ServiceError("Unexpected error while resolving the owned tags") from exc

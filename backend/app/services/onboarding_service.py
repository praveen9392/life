"""First-time user onboarding (see ARCHITECTURE.md "Onboarding Flow").

Fully skippable by design: completing or skipping simply stamps
`onboarding_completed_at`; sensible defaults (UTC timezone, system theme,
all in-app notifications on) are already the column defaults, so a user who
skips everything lands on a correctly empty dashboard.

The optional "initial habits/goals/learning interests" steps create ordinary
rows in the normal tables (with `created_via_onboarding=True`) once those
modules' create endpoints exist (Phases 7/9) - onboarding introduces no
parallel data structures.
"""

from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ServiceError
from app.core.logging import logger
from app.models.user import User


class OnboardingService:
    """First-time onboarding completion (fully skippable by design)."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session

    async def complete_onboarding(self, user: User) -> User:
        """Stamp onboarding as completed. Idempotent: calling it again is a no-op.

        Args:
            user: Authenticated user completing onboarding.

        Returns:
            User: The same user with `onboarding_completed_at` set.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting onboarding completion | user_id={user.id}")
            if user.onboarding_completed_at is None:
                user.onboarding_completed_at = datetime.now(UTC)
                await self.session.flush()
                logger.info(f"Onboarding completed | user_id={user.id}")
            else:
                logger.debug(f"Onboarding already completed; no-op | user_id={user.id}")
            return user
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while completing the onboarding: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while completing the onboarding: {exc}")
            raise ServiceError("Unexpected error while completing the onboarding") from exc

    @staticmethod
    def is_completed(user: User) -> bool:
        """Whether the user has completed onboarding.

        Args:
            user: User to check.

        Returns:
            bool: True when `onboarding_completed_at` is set.
        """
        return user.onboarding_completed_at is not None

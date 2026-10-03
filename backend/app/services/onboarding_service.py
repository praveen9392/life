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

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class OnboardingService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def complete_onboarding(self, user: User) -> User:
        """Stamp onboarding as completed. Idempotent: calling it again is a no-op."""
        if user.onboarding_completed_at is None:
            user.onboarding_completed_at = datetime.now(UTC)
            await self.session.flush()
        return user

    @staticmethod
    def is_completed(user: User) -> bool:
        return user.onboarding_completed_at is not None

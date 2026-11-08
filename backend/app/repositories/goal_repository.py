"""Goal repository - ownership-scoped; milestones owned via parent goal."""

import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import selectinload

from app.models.goal import Goal, GoalMilestone
from app.repositories.base import BaseRepository


class GoalRepository(BaseRepository[Goal]):
    model = Goal

    def _base_query(self, user_id: uuid.UUID) -> Select:
        return (
            super()
            ._base_query(user_id)
            .options(selectinload(Goal.milestones))
        )

    async def list_for_user_query(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Goal]:
        """List the user's goals (milestones eager-loaded), newest first, as one page."""
        query = (
            self._base_query(user_id)
            .order_by(Goal.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        query_result = await self.session.execute(query)
        matching_records = query_result.scalars().all()
        return list(matching_records)

    async def get_owned_milestone_query(
        self, milestone_id: uuid.UUID, user_id: uuid.UUID
    ) -> GoalMilestone | None:
        """Fetch a milestone only if its parent goal belongs to `user_id` (milestones have no
        user_id column - ownership flows through the parent goal).
        """
        query = (
            select(GoalMilestone)
            .join(Goal, GoalMilestone.goal_id == Goal.id)
            .where(GoalMilestone.id == milestone_id, Goal.user_id == user_id)
        )
        query_result = await self.session.execute(query)
        matching_record = query_result.scalar_one_or_none()
        return matching_record

    async def create_milestone_query(self, goal: Goal, **fields: object) -> GoalMilestone:
        """Add a milestone under an owned goal and flush so its ID is assigned."""
        milestone = GoalMilestone(goal_id=goal.id, **fields)
        self.session.add(milestone)
        await self.session.flush()
        return milestone

    async def delete_milestone_query(self, milestone: GoalMilestone) -> None:
        """Hard-delete a milestone row the caller already fetched as owned."""
        await self.session.delete(milestone)
        await self.session.flush()

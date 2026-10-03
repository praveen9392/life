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

    async def list_for_user(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Goal]:
        query = (
            self._base_query(user_id)
            .order_by(Goal.created_at.desc())
            .offset(offset)
            .limit(limit)
        )
        return list((await self.session.execute(query)).scalars().all())

    async def get_owned_milestone(
        self, milestone_id: uuid.UUID, user_id: uuid.UUID
    ) -> GoalMilestone | None:
        """Milestones have no user_id - ownership flows through the parent goal."""
        query = (
            select(GoalMilestone)
            .join(Goal, GoalMilestone.goal_id == Goal.id)
            .where(GoalMilestone.id == milestone_id, Goal.user_id == user_id)
        )
        return (await self.session.execute(query)).scalar_one_or_none()

    async def create_milestone(self, goal: Goal, **fields: object) -> GoalMilestone:
        milestone = GoalMilestone(goal_id=goal.id, **fields)
        self.session.add(milestone)
        await self.session.flush()
        return milestone

    async def delete_milestone(self, milestone: GoalMilestone) -> None:
        await self.session.delete(milestone)
        await self.session.flush()

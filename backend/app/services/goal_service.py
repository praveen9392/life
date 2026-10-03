"""Goal business logic: milestones drive progress when the goal's
progress_mode is 'milestones' (the canonical derivation); 'manual' mode
stores whatever percent the user sets. Status auto-syncs to progress."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.goal import Goal, GoalMilestone
from app.repositories.goal_repository import GoalRepository
from app.schemas.goal import (
    GoalCreateRequest,
    GoalUpdateRequest,
    MilestoneCreateRequest,
    MilestoneUpdateRequest,
)
from app.services.progress_rules import milestone_progress
from app.utils.enums import GoalProgressMode, GoalStatus


def _sync_progress_and_status(goal: Goal) -> None:
    """Derive progress (in milestones mode) and auto-advance status."""
    if goal.progress_mode == GoalProgressMode.MILESTONES and goal.milestones:
        completed = sum(1 for milestone in goal.milestones if milestone.is_completed)
        goal.progress_percent = milestone_progress(completed, len(goal.milestones))
    if goal.progress_percent >= 100:
        goal.status = GoalStatus.COMPLETED
    elif goal.progress_percent > 0 and goal.status == GoalStatus.NOT_STARTED:
        goal.status = GoalStatus.IN_PROGRESS


class GoalService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.goals = GoalRepository(session)

    async def create_goal(self, user_id: uuid.UUID, payload: GoalCreateRequest) -> Goal:
        goal = await self.goals.create_owned(user_id, **payload.model_dump())
        # Re-fetch so `milestones` is eager-loaded for response serialization.
        loaded = await self.goals.get_owned(goal.id, user_id)
        assert loaded is not None
        return loaded

    async def list_goals(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Goal]:
        return await self.goals.list_for_user(user_id, offset=offset, limit=limit)

    async def get_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal:
        goal = await self.goals.get_owned(goal_id, user_id)
        if goal is None:
            raise NotFoundError("Goal not found")
        return goal

    async def update_goal(
        self, user_id: uuid.UUID, goal_id: uuid.UUID, payload: GoalUpdateRequest
    ) -> Goal:
        goal = await self.get_goal(user_id, goal_id)
        changes = payload.model_dump(exclude_unset=True)
        # In milestones mode, manual progress edits are ignored - milestones rule.
        if goal.progress_mode == GoalProgressMode.MILESTONES:
            changes.pop("progress_percent", None)
        for key, value in changes.items():
            setattr(goal, key, value)
        _sync_progress_and_status(goal)
        await self.session.flush()
        await self.session.refresh(goal)
        return goal

    async def delete_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID) -> None:
        deleted = await self.goals.delete_owned(goal_id, user_id)
        if not deleted:
            raise NotFoundError("Goal not found")

    async def add_milestone(
        self, user_id: uuid.UUID, goal_id: uuid.UUID, payload: MilestoneCreateRequest
    ) -> GoalMilestone:
        goal = await self.get_goal(user_id, goal_id)
        return await self.goals.create_milestone(goal, **payload.model_dump())

    async def update_milestone(
        self, user_id: uuid.UUID, milestone_id: uuid.UUID, payload: MilestoneUpdateRequest
    ) -> GoalMilestone:
        milestone = await self.goals.get_owned_milestone(milestone_id, user_id)
        if milestone is None:
            raise NotFoundError("Milestone not found")
        changes = payload.model_dump(exclude_unset=True)
        if changes.get("is_completed") is True:
            milestone.completed_at = datetime.now(UTC)
        elif changes.get("is_completed") is False:
            milestone.completed_at = None
        for key, value in changes.items():
            setattr(milestone, key, value)
        await self.session.flush()

        goal = await self.goals.get_owned(milestone.goal_id, user_id)
        if goal is not None:
            _sync_progress_and_status(goal)
            await self.session.flush()
        return milestone

    async def delete_milestone(self, user_id: uuid.UUID, milestone_id: uuid.UUID) -> None:
        milestone = await self.goals.get_owned_milestone(milestone_id, user_id)
        if milestone is None:
            raise NotFoundError("Milestone not found")
        goal_id = milestone.goal_id
        await self.goals.delete_milestone(milestone)
        goal = await self.goals.get_owned(goal_id, user_id)
        if goal is not None:
            _sync_progress_and_status(goal)
            await self.session.flush()

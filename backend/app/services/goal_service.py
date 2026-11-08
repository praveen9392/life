"""Goal business logic: milestones drive progress when the goal's
progress_mode is 'milestones' (the canonical derivation); 'manual' mode
stores whatever percent the user sets. Status auto-syncs to progress."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ServiceError
from app.core.logging import logger
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
    """Derive progress (in milestones mode) and auto-advance the goal's status.

    Args:
        goal: Goal to update in place; `milestones` must be eager-loaded for
        milestones-mode derivation to see them.
    """
    if goal.progress_mode == GoalProgressMode.MILESTONES and goal.milestones:
        completed = sum(1 for milestone in goal.milestones if milestone.is_completed)
        goal.progress_percent = milestone_progress(completed, len(goal.milestones))
    if goal.progress_percent >= 100:
        goal.status = GoalStatus.COMPLETED
    elif goal.progress_percent > 0 and goal.status == GoalStatus.NOT_STARTED:
        goal.status = GoalStatus.IN_PROGRESS


class GoalService:
    """Goal and milestone business logic with derived progress/status sync."""

    def __init__(self, session: AsyncSession):
        """Wire the service to the request's database session.

        Args:
            session: SQLAlchemy async session for the request's transaction.
        """
        self.session = session
        self.goals = GoalRepository(session)

    async def create_goal(self, user_id: uuid.UUID, payload: GoalCreateRequest) -> Goal:
        """Create a goal for the user and return it with milestones loaded.

        Args:
            user_id: Owner of the goal.
            payload: Field values for the new goal.

        Returns:
            Goal: The created goal, re-fetched so `milestones` is
            eager-loaded for response serialization.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting goal creation | user_id={user_id}")
            goal = await self.goals.create_owned_query(user_id, **payload.model_dump())
            # Re-fetch so `milestones` is eager-loaded for response serialization.
            logger.debug(f"Re-fetching goal with milestones | user_id={user_id} goal_id={goal.id}")
            loaded = await self.goals.get_owned_query(goal.id, user_id)
            assert loaded is not None
            logger.info(f"Goal created with id: {goal.id}")
            return loaded
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while creating the goal: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while creating the goal: {exc}")
            raise ServiceError("Unexpected error while creating the goal") from exc

    async def list_goals(
        self, user_id: uuid.UUID, *, offset: int = 0, limit: int = 100
    ) -> list[Goal]:
        """List the user's goals (milestones eager-loaded), newest first.

        Args:
            user_id: Owner of the goals.
            offset: Number of records to skip for pagination (default 0).
            limit: Maximum number of records to return (default 100).

        Returns:
            list[Goal]: The user's goals in the requested window.

        Raises:
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting goal listing | user_id={user_id}")
            user_goals = await self.goals.list_for_user_query(user_id, offset=offset, limit=limit)
            logger.info(f"Successfully retrieved {len(user_goals)} goals")
            return user_goals
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while listing the goals: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while listing the goals: {exc}")
            raise ServiceError("Unexpected error while listing the goals") from exc

    async def get_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID) -> Goal:
        """Fetch one goal owned by the user.

        Args:
            user_id: Owner the goal must belong to.
            goal_id: Primary key of the goal.

        Returns:
            Goal: The owned goal (milestones eager-loaded).

        Raises:
            NotFoundError: If the goal does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting goal retrieval | user_id={user_id} goal_id={goal_id}")
            goal = await self.goals.get_owned_query(goal_id, user_id)
            if goal is None:
                logger.warning(f"Goal not found with id: {goal_id}")
                raise NotFoundError("Goal not found")
            logger.debug(f"Goal retrieval completed | user_id={user_id} goal_id={goal_id}")
            return goal
        except NotFoundError:
            logger.error(f"Goal fetch failed: goal not found | goal_id={goal_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while fetching the goal: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while fetching the goal: {exc}")
            raise ServiceError("Unexpected error while fetching the goal") from exc

    async def update_goal(
        self, user_id: uuid.UUID, goal_id: uuid.UUID, payload: GoalUpdateRequest
    ) -> Goal:
        """Partially update a goal, re-deriving progress and status afterwards.

        Args:
            user_id: Owner the goal must belong to.
            goal_id: Primary key of the goal.
            payload: Fields to change; unset fields are ignored. In
                milestones mode a manual `progress_percent` is ignored
                (milestones rule).

        Returns:
            Goal: The refreshed goal.

        Raises:
            NotFoundError: If the goal does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting goal update | user_id={user_id} goal_id={goal_id}")
            goal = await self.get_goal(user_id, goal_id)
            changes = payload.model_dump(exclude_unset=True)
            # In milestones mode, manual progress edits are ignored - milestones rule.
            if goal.progress_mode == GoalProgressMode.MILESTONES:
                logger.debug(
                    f"Ignoring manual progress_percent in milestones mode | goal_id={goal_id}"
                )
                changes.pop("progress_percent", None)
            logger.debug(f"Applying goal update | goal_id={goal_id}")
            for key, value in changes.items():
                setattr(goal, key, value)
            _sync_progress_and_status(goal)
            await self.session.flush()
            await self.session.refresh(goal)
            logger.info(f"Goal updated | id={goal_id}")
            return goal
        except NotFoundError:
            logger.error(f"Goal update failed: goal not found | goal_id={goal_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the goal: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the goal: {exc}")
            raise ServiceError("Unexpected error while updating the goal") from exc

    async def delete_goal(self, user_id: uuid.UUID, goal_id: uuid.UUID) -> None:
        """Delete a goal owned by the user.

        Args:
            user_id: Owner the goal must belong to.
            goal_id: Primary key of the goal.

        Raises:
            NotFoundError: If the goal does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting goal deletion | user_id={user_id} goal_id={goal_id}")
            deleted = await self.goals.delete_owned_query(goal_id, user_id)
            if not deleted:
                logger.warning(f"Goal not found with id: {goal_id}")
                raise NotFoundError("Goal not found")
            logger.info(f"Goal deleted | id={goal_id}")
        except NotFoundError:
            logger.error(f"Goal delete failed: goal not found | goal_id={goal_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the goal: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the goal: {exc}")
            raise ServiceError("Unexpected error while deleting the goal") from exc

    async def add_milestone(
        self, user_id: uuid.UUID, goal_id: uuid.UUID, payload: MilestoneCreateRequest
    ) -> GoalMilestone:
        """Add a milestone to an owned goal.

        Args:
            user_id: Owner the goal must belong to.
            goal_id: Primary key of the goal.
            payload: Field values for the new milestone.

        Returns:
            GoalMilestone: The created milestone.

        Raises:
            NotFoundError: If the goal does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting milestone creation | user_id={user_id} goal_id={goal_id}")
            goal = await self.get_goal(user_id, goal_id)
            logger.debug(f"Creating milestone | user_id={user_id} goal_id={goal_id}")
            created_milestone = await self.goals.create_milestone_query(goal, **payload.model_dump())
            logger.info(f"Milestone created with id: {created_milestone.id}")
            return created_milestone
        except NotFoundError:
            logger.error(f"Milestone creation failed: goal not found | goal_id={goal_id}")
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while adding the milestone: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while adding the milestone: {exc}")
            raise ServiceError("Unexpected error while adding the milestone") from exc

    async def update_milestone(
        self, user_id: uuid.UUID, milestone_id: uuid.UUID, payload: MilestoneUpdateRequest
    ) -> GoalMilestone:
        """Partially update an owned milestone and re-sync its goal's progress.

        Args:
            user_id: Owner the milestone (through its goal) must belong to.
            milestone_id: Primary key of the milestone.
            payload: Fields to change; setting `is_completed` stamps
                `completed_at`, clearing it removes the stamp.

        Returns:
            GoalMilestone: The updated milestone.

        Raises:
            NotFoundError: If the milestone does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting milestone update | user_id={user_id} milestone_id={milestone_id}")
            milestone = await self.goals.get_owned_milestone_query(milestone_id, user_id)
            if milestone is None:
                logger.warning(f"Milestone not found with id: {milestone_id}")
                raise NotFoundError("Milestone not found")
            changes = payload.model_dump(exclude_unset=True)
            if changes.get("is_completed") is True:
                logger.debug(f"Milestone marked complete; stamping completed_at | milestone_id={milestone_id}")
                milestone.completed_at = datetime.now(UTC)
            elif changes.get("is_completed") is False:
                logger.debug(f"Milestone marked incomplete; clearing completed_at | milestone_id={milestone_id}")
                milestone.completed_at = None
            logger.debug(f"Applying milestone update | milestone_id={milestone_id}")
            for key, value in changes.items():
                setattr(milestone, key, value)
            await self.session.flush()

            logger.debug(f"Re-syncing goal progress | goal_id={milestone.goal_id}")
            goal = await self.goals.get_owned_query(milestone.goal_id, user_id)
            if goal is not None:
                _sync_progress_and_status(goal)
                await self.session.flush()
            logger.info(f"Milestone updated | id={milestone_id}")
            return milestone
        except NotFoundError:
            logger.error(
                f"Milestone update failed: milestone not found | milestone_id={milestone_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while updating the milestone: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while updating the milestone: {exc}")
            raise ServiceError("Unexpected error while updating the milestone") from exc

    async def delete_milestone(self, user_id: uuid.UUID, milestone_id: uuid.UUID) -> None:
        """Delete an owned milestone and re-sync its goal's progress.

        Args:
            user_id: Owner the milestone (through its goal) must belong to.
            milestone_id: Primary key of the milestone.

        Raises:
            NotFoundError: If the milestone does not exist or belongs to another user.
            SQLAlchemyError: If the database operation fails (logged, then re-raised).
            ServiceError: If an unexpected error occurs (wrapped from any other exception).
        """
        try:
            logger.info(f"Starting milestone deletion | user_id={user_id} milestone_id={milestone_id}")
            milestone = await self.goals.get_owned_milestone_query(milestone_id, user_id)
            if milestone is None:
                logger.warning(f"Milestone not found with id: {milestone_id}")
                raise NotFoundError("Milestone not found")
            goal_id = milestone.goal_id
            logger.debug(f"Deleting milestone | user_id={user_id} milestone_id={milestone_id}")
            await self.goals.delete_milestone_query(milestone)
            logger.debug(f"Re-syncing goal progress | goal_id={goal_id}")
            goal = await self.goals.get_owned_query(goal_id, user_id)
            if goal is not None:
                _sync_progress_and_status(goal)
                await self.session.flush()
            logger.info(f"Milestone deleted | id={milestone_id}")
        except NotFoundError:
            logger.error(
                f"Milestone delete failed: milestone not found | milestone_id={milestone_id}"
            )
            raise
        except SQLAlchemyError as exc:
            logger.exception(f"Database error while deleting the milestone: {exc}")
            raise
        except Exception as exc:
            logger.error(f"Unexpected error while deleting the milestone: {exc}")
            raise ServiceError("Unexpected error while deleting the milestone") from exc

"""The explicit authorization layer (see ARCHITECTURE.md §2).

Authentication ("who is this user?") is handled by `api/deps.get_current_user`.
Authorization ("what is this user allowed to do?") lives here, as a named,
reusable component rather than being folded invisibly into repositories, so
future role/permission logic (shared plans, read-only collaborators) has one
obvious place to extend.

For the standard owned-entity pattern, ownership is enforced structurally by
`repositories/base.py` (the `user_id` filter is part of the query itself).
`require_owner` exists for resources managed outside that pattern.
"""

import uuid

from app.core.exceptions import ForbiddenError


def require_owner(resource_user_id: uuid.UUID, current_user_id: uuid.UUID) -> None:
    """Assert that `resource_user_id` belongs to `current_user_id`."""
    if resource_user_id != current_user_id:
        raise ForbiddenError("You do not have access to this resource")

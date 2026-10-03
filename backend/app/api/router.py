"""Aggregates every v1 feature route module under /api/v1.

New breaking API versions get an entirely new parallel router tree
(`app/api/v2/...`) rather than mutating this one in place - see
ARCHITECTURE.md "API Versioning Strategy". Infrastructure endpoints
(`/health`) are intentionally unversioned - see `app/main.py`.
"""

from fastapi import APIRouter

from app.api.v1.routes import (
    analytics,
    auth,
    dashboard,
    goals,
    habits,
    health,
    learning,
    notes,
    search,
    tags,
    tasks,
    users,
    workouts,
)

v1_router = APIRouter(prefix="/api/v1")
v1_router.include_router(auth.router)
v1_router.include_router(users.router)
v1_router.include_router(tasks.router)
v1_router.include_router(habits.router)
v1_router.include_router(notes.router)
v1_router.include_router(dashboard.router)
v1_router.include_router(health.router)
v1_router.include_router(workouts.router)
v1_router.include_router(learning.router)
v1_router.include_router(goals.router)
v1_router.include_router(analytics.router)
v1_router.include_router(search.router)
v1_router.include_router(tags.router)

# Feature routers are added here as each phase implements them.

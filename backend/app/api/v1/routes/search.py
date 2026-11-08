"""Global search route."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.schemas.search import SearchResponse
from app.services.search_service import SearchService

router = APIRouter(tags=["search", "notifications", "privacy"])


@router.get("/search", response_model=SearchResponse)
async def global_search(
    current_user: CurrentUser,
    db: DbSession,
    q: str = Query(min_length=1, max_length=200),
) -> SearchResponse:
    try:
        search_results = await SearchService(db).search(current_user.id, q)
        return search_results
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

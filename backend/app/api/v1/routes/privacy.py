"""Privacy routes: data export and account deletion."""

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.cookies import clear_auth_cookies
from app.api.deps import CurrentUser, DbSession
from app.core.exceptions import AppException
from app.core.rate_limit import limiter
from app.schemas.search import AccountDeleteRequest
from app.services.privacy_service import PrivacyService

router = APIRouter(tags=["search", "notifications", "privacy"])


@router.get("/privacy/export")
@limiter.limit("10/minute")
async def export_data(request: Request, current_user: CurrentUser, db: DbSession) -> JSONResponse:
    """Full JSON export of everything the user owns."""
    try:
        data = await PrivacyService(db).export_user_data(current_user)
        return JSONResponse(
            content=data,
            headers={"Content-Disposition": "attachment; filename=life-export.json"},
        )
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc


@router.delete("/privacy/account", status_code=204)
@limiter.limit("5/minute")
async def delete_account(
    request: Request,
    payload: AccountDeleteRequest,
    current_user: CurrentUser,
    db: DbSession,
    response: Response,
) -> None:
    """Permanently delete the account and all owned data, then clear the session.

    Requires the current password in the request body: deletion is
    irreversible, so a stolen session cookie alone must not be enough.
    """
    try:
        await PrivacyService(db).delete_account(current_user, payload.current_password)
        clear_auth_cookies(response)
    except (AppException, SQLAlchemyError):
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred",
        ) from exc

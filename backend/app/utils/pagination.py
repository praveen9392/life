"""Shared pagination request/response helpers used by every list endpoint."""

from typing import Generic, TypeVar

from pydantic import BaseModel, Field

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

T = TypeVar("T")


class PaginationParams(BaseModel):
    """Validated `page`/`page_size` query parameters."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class Page(BaseModel, Generic[T]):
    """The standard paginated-list response envelope."""

    items: list[T]
    total: int
    page: int
    page_size: int


def build_page(items: list[T], total: int, params: PaginationParams) -> Page[T]:
    """Assemble the standard `Page` envelope for a serialized item list.

    Shared by every paginated list route so the `page`/`page_size` echo
    can't drift per endpoint.
    """
    return Page(items=items, total=total, page=params.page, page_size=params.page_size)

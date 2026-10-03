"""SQLAlchemy declarative base and metadata naming convention.

A fixed naming convention ensures Alembic autogenerate always produces
stable, predictable constraint/index names instead of driver-generated
random ones - important for reviewable migrations.
"""

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Base class for every ORM model in the application."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)

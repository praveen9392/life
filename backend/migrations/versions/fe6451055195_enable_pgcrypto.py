"""enable_pgcrypto

Revision ID: fe6451055195
Revises: 
Create Date: 2026-09-26 21:26:40.142315

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'fe6451055195'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # gen_random_uuid() (used as the server_default for every primary key)
    # requires pgcrypto. This is a one-way, idempotent operation - see note
    # in downgrade().
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")


def downgrade() -> None:
    # Intentionally a no-op: dropping pgcrypto would break every table's
    # primary-key default. Extensions are treated as permanent infrastructure,
    # documented here rather than pretending a real downgrade is meaningful.
    pass

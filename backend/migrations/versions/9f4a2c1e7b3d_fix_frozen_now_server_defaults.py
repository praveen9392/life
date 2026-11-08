"""fix frozen 'now()' literal server defaults

The initial migration (2d27dbcfe619) stamped `server_default='now()'` - a
bare string literal rather than `sa.text('now()')` - on
`notifications.created_at` and `refresh_tokens.created_at`. Postgres baked
that in as a frozen literal timestamp captured once at migration-apply time,
not a live per-row function call, so every row relying on the default got
the same increasingly stale timestamp.

This migration restores the intended live `now()` function default on both
columns. (Application code already sets `created_at` explicitly at insert
time - see `NotificationRepository.create_notification` and
`UserRepository.create_refresh_token` - but the schema-level default should
still be correct.)

Revision ID: 9f4a2c1e7b3d
Revises: 53096170c4b1
Create Date: 2026-10-04 00:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '9f4a2c1e7b3d'
down_revision: str | None = '53096170c4b1'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        'notifications', 'created_at', server_default=sa.text('now()')
    )
    op.alter_column(
        'refresh_tokens', 'created_at', server_default=sa.text('now()')
    )


def downgrade() -> None:
    # Restore the (buggy) literal string default to prove reversibility.
    op.alter_column(
        'notifications', 'created_at', server_default='now()'
    )
    op.alter_column(
        'refresh_tokens', 'created_at', server_default='now()'
    )

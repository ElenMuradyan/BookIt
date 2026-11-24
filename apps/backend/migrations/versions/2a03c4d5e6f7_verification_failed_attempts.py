"""add failed_attempts column to verification_tokens

Revision ID: 2a03c4d5e6f7
Revises: 2a02c3d4e5f6
Create Date: 2026-11-22 13:15:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "2a03c4d5e6f7"
down_revision: Union[str, None] = "2a02c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "verification_tokens",
        sa.Column("failed_attempts", sa.Integer(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("verification_tokens", "failed_attempts")

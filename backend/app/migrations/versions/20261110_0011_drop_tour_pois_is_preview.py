"""Bỏ cờ nghe thử theo điểm trong tour.

Revision ID: 0011
Revises: 0010
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("tour_pois", "is_preview")


def downgrade() -> None:
    op.add_column(
        "tour_pois",
        sa.Column("is_preview", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )

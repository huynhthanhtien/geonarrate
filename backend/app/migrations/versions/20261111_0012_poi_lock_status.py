"""pois.status: active hoặc locked (khoá điểm).

Revision ID: 0012
Revises: 0011
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE pois SET status = 'active' WHERE status = 'draft'")
    op.alter_column("pois", "status", server_default=sa.text("'active'"))
    op.create_check_constraint("status", "pois", "status IN ('active', 'locked')")


def downgrade() -> None:
    op.drop_constraint(op.f("ck_pois_status"), "pois", type_="check")
    op.alter_column("pois", "status", server_default=None)
    op.execute("UPDATE pois SET status = 'draft'")

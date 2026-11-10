"""Bỏ chấm COMET QE: xoá cột translations.comet_qe và cờ low_comet_qe đã lưu.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE translations SET qa_flags = array_remove(qa_flags, 'low_comet_qe')")
    op.drop_column("translations", "comet_qe")


def downgrade() -> None:
    # Điểm cũ không khôi phục được; NULL nghĩa là chưa đánh giá.
    op.add_column("translations", sa.Column("comet_qe", sa.Double(), nullable=True))

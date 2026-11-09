"""Lưu điểm chất lượng thật; NULL biểu thị chưa đánh giá.

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("translations", sa.Column("comet_qe", sa.Double(), nullable=True))
    op.add_column("audio_assets", sa.Column("asr_wer", sa.Double(), nullable=True))


def downgrade() -> None:
    op.drop_column("audio_assets", "asr_wer")
    op.drop_column("translations", "comet_qe")

"""Bỏ chấm ASR WER: xoá cột audio_assets.asr_wer.

Revision ID: 0008
Revises: 0007
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("audio_assets", "asr_wer")


def downgrade() -> None:
    # Điểm cũ không khôi phục được; NULL nghĩa là chưa đánh giá.
    op.add_column("audio_assets", sa.Column("asr_wer", sa.Double(), nullable=True))

"""Bỏ slug; tour và POI được truy cập bằng UUID.

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for table in ("pois", "tours"):
        op.drop_column(table, "slug")


def downgrade() -> None:
    # Mã cũ chỉ có trong bản sao lưu; tạo mã hợp lệ và duy nhất từ UUID khi rollback.
    for table in ("pois", "tours"):
        op.add_column(table, sa.Column("slug", sa.Text(), nullable=True))
        op.execute(f"UPDATE {table} SET slug = replace(id::text, '-', '')")
        op.alter_column(table, "slug", existing_type=sa.Text(), nullable=False)
        op.create_unique_constraint(op.f(f"uq_{table}_slug"), table, ["slug"])

"""Mở rộng vai trò duyệt nội dung và vận hành.

Revision ID: 0010
Revises: 0009
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_users_roles"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_roles"),
        "users",
        "cardinality(roles) > 0 AND roles <@ "
        "ARRAY['admin', 'editor', 'translator', 'reviewer', 'operator']::text[]",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_users_roles"), "users", type_="check")
    op.create_check_constraint(
        op.f("ck_users_roles"),
        "users",
        "cardinality(roles) > 0 AND roles <@ ARRAY['admin', 'editor', 'translator']::text[]",
    )

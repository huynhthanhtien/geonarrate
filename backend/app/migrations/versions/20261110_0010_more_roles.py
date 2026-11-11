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
    # Vai trò reviewer/operator không còn hợp lệ: bỏ khỏi người dùng, ai hết vai trò thì về editor
    op.execute(
        "UPDATE users SET roles = ARRAY(SELECT r FROM unnest(roles) AS r "
        "WHERE r IN ('admin', 'editor', 'translator')) "
        "WHERE NOT roles <@ ARRAY['admin', 'editor', 'translator']::text[]"
    )
    op.execute("UPDATE users SET roles = ARRAY['editor'] WHERE cardinality(roles) = 0")
    op.create_check_constraint(
        op.f("ck_users_roles"),
        "users",
        "cardinality(roles) > 0 AND roles <@ ARRAY['admin', 'editor', 'translator']::text[]",
    )

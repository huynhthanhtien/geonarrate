"""Cho phép mỗi tài khoản có nhiều vai trò.

Revision ID: 0009
Revises: 0008
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import ARRAY

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("roles", ARRAY(sa.Text()), nullable=True))
    op.execute("UPDATE users SET roles = ARRAY[role]")
    op.alter_column("users", "roles", nullable=False)
    op.create_check_constraint(
        op.f("ck_users_roles"),
        "users",
        "cardinality(roles) > 0 AND roles <@ ARRAY['admin', 'editor', 'translator']::text[]",
    )
    op.drop_constraint(op.f("ck_users_role"), "users", type_="check")
    op.drop_column("users", "role")


def downgrade() -> None:
    # Không âm thầm làm mất các vai trò khi quay về schema cũ.
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM users WHERE cardinality(roles) <> 1) "
        "THEN RAISE EXCEPTION 'Cannot downgrade users with multiple roles'; END IF; END $$"
    )
    op.add_column("users", sa.Column("role", sa.Text(), nullable=True))
    op.execute("UPDATE users SET role = roles[1]")
    op.alter_column("users", "role", nullable=False)
    op.create_check_constraint(
        op.f("ck_users_role"), "users", "role IN ('admin', 'editor', 'translator')"
    )
    op.drop_constraint(op.f("ck_users_roles"), "users", type_="check")
    op.drop_column("users", "roles")

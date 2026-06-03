"""add roles to project_members

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-05-30 19:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # The role column already exists on project_members (String(50), default="developer").
    # This migration updates the default to "member" and adds a CHECK constraint
    # to allow both old role values (for backward compat) and new RBAC role values.
    op.alter_column(
        "project_members",
        "role",
        server_default="member",
        existing_type=sa.String(50),
        existing_nullable=False,
    )

    # Add a CHECK constraint allowing both legacy and new role values
    op.create_check_constraint(
        "ck_project_members_role",
        "project_members",
        sa.column("role").in_(
            [
                "owner",
                "admin",
                "member",
                "viewer",  # new RBAC roles
                "developer",
                "project_lead",  # legacy roles (backward compat)
            ]
        ),
    )


def downgrade() -> None:
    op.drop_constraint("ck_project_members_role", "project_members", type_="check")
    op.alter_column(
        "project_members",
        "role",
        server_default="developer",
        existing_type=sa.String(50),
        existing_nullable=False,
    )

"""add performance indexes

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-31 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── Single-column indexes ─────────────────────────────────────────────
    op.create_index("ix_tasks_project_id", "tasks", ["project_id"])
    op.create_index("ix_tasks_assignee_id", "tasks", ["assignee_id"])
    op.create_index("ix_tasks_status", "tasks", ["status"])
    op.create_index("ix_tasks_created_at_desc", "tasks", [sa.text("created_at DESC")])
    op.create_index("ix_project_members_user_id", "project_members", ["user_id"])

    # ── Composite indexes ─────────────────────────────────────────────────
    op.create_index(
        "ix_notifications_user_read",
        "notifications",
        ["user_id", "read"],
    )
    op.create_index(
        "ix_messages_channel_created",
        "messages",
        ["channel_id", sa.text("created_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_messages_channel_created", table_name="messages")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_index("ix_project_members_user_id", table_name="project_members")
    op.drop_index("ix_tasks_created_at_desc", table_name="tasks")
    op.drop_index("ix_tasks_status", table_name="tasks")
    op.drop_index("ix_tasks_assignee_id", table_name="tasks")
    op.drop_index("ix_tasks_project_id", table_name="tasks")

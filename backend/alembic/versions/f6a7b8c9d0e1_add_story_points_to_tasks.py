"""add story points to tasks

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-05-31 13:05:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: Union[str, None] = "e5f6a7b8c9d0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    columns = [c["name"] for c in inspector.get_columns("tasks")]
    if "story_points" not in columns:
        op.add_column("tasks", sa.Column("story_points", sa.Integer(), nullable=True))
        op.create_check_constraint(
            "ck_tasks_story_points_range",
            "tasks",
            "story_points IS NULL OR (story_points >= 0 AND story_points <= 100)",
        )


def downgrade() -> None:
    op.drop_constraint("ck_tasks_story_points_range", "tasks", type_="check")
    op.drop_column("tasks", "story_points")

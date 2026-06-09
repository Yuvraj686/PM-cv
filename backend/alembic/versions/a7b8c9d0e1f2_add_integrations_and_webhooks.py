"""add slack integrations and webhooks

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-05-31 15:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    tables = inspector.get_table_names()

    if "slack_integrations" not in tables:
        op.create_table(
            "slack_integrations",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "project_id",
                UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("workspace_id", sa.String(length=100), nullable=False),
            sa.Column("workspace_name", sa.String(length=255), nullable=True),
            sa.Column("bot_token_encrypted", sa.Text(), nullable=False),
            sa.Column("channel_id", sa.String(length=100), nullable=True),
            sa.Column(
                "default_active",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("true"),
            ),
            sa.Column("user_mappings", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_slack_integrations_workspace_id", "slack_integrations", ["workspace_id"]
        )
        op.create_index(
            "ix_slack_integrations_project_id",
            "slack_integrations",
            ["project_id"],
            unique=True,
        )

    if "webhooks" not in tables:
        op.create_table(
            "webhooks",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "project_id",
                UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("url", sa.Text(), nullable=False),
            sa.Column("secret", sa.Text(), nullable=False),
            sa.Column("events", sa.JSON(), nullable=False),
            sa.Column(
                "active", sa.Boolean(), nullable=False, server_default=sa.text("true")
            ),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index("ix_webhooks_project_id", "webhooks", ["project_id"])

    if "webhook_deliveries" not in tables:
        op.create_table(
            "webhook_deliveries",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "webhook_id",
                UUID(as_uuid=True),
                sa.ForeignKey("webhooks.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "project_id",
                UUID(as_uuid=True),
                sa.ForeignKey("projects.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("event", sa.String(length=100), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("signature", sa.String(length=255), nullable=False),
            sa.Column(
                "status", sa.String(length=30), nullable=False, server_default="pending"
            ),
            sa.Column("response_status", sa.Integer(), nullable=True),
            sa.Column("response_body", sa.Text(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("attempt", sa.Integer(), nullable=False, server_default="1"),
            sa.Column(
                "created_at",
                sa.DateTime(timezone=True),
                server_default=sa.text("now()"),
                nullable=False,
            ),
        )
        op.create_index(
            "ix_webhook_deliveries_webhook_id", "webhook_deliveries", ["webhook_id"]
        )
        op.create_index(
            "ix_webhook_deliveries_project_id", "webhook_deliveries", ["project_id"]
        )
        op.create_index(
            "ix_webhook_deliveries_created_at", "webhook_deliveries", ["created_at"]
        )


def downgrade() -> None:
    op.drop_index("ix_webhook_deliveries_created_at", table_name="webhook_deliveries")
    op.drop_index("ix_webhook_deliveries_project_id", table_name="webhook_deliveries")
    op.drop_index("ix_webhook_deliveries_webhook_id", table_name="webhook_deliveries")
    op.drop_table("webhook_deliveries")

    op.drop_index("ix_webhooks_project_id", table_name="webhooks")
    op.drop_table("webhooks")

    op.drop_index("ix_slack_integrations_project_id", table_name="slack_integrations")
    op.drop_index("ix_slack_integrations_workspace_id", table_name="slack_integrations")
    op.drop_table("slack_integrations")

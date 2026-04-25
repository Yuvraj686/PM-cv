"""add username and onboarding_complete to users

Revision ID: a1b2c3d4e5f6
Revises: 723ae0de6aad
Create Date: 2026-04-23 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '723ae0de6aad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add username column (unique, nullable for existing users)
    op.add_column('users', sa.Column('username', sa.String(length=50), nullable=True))
    op.create_unique_constraint('uq_users_username', 'users', ['username'])
    op.create_index('ix_users_username', 'users', ['username'], unique=True)

    # Add onboarding_complete column (defaults to False)
    op.add_column('users', sa.Column('onboarding_complete', sa.Boolean(), nullable=True, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_index('ix_users_username', table_name='users')
    op.drop_constraint('uq_users_username', 'users', type_='unique')
    op.drop_column('users', 'username')
    op.drop_column('users', 'onboarding_complete')

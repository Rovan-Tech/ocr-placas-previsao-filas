"""adiciona papel de admin e troca de senha obrigatoria

Admin master pode cadastrar funcionários; senha temporária/vencida força a troca no login.

Revision ID: 4c2dc2099079
Revises: ef8fe45f8351
Create Date: 2026-09-23 19:18:33.579898

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c2dc2099079'
down_revision: Union[str, Sequence[str], None] = 'ef8fe45f8351'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('employees', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('employees', sa.Column('must_change_password', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('employees', sa.Column('password_set_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('employees', 'password_set_at')
    op.drop_column('employees', 'must_change_password')
    op.drop_column('employees', 'is_admin')

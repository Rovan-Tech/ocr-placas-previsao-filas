from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4c2dc2099079'
down_revision: Union[str, Sequence[str], None] = 'ef8fe45f8351'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('employees', sa.Column('is_admin', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('employees', sa.Column('must_change_password', sa.Boolean(), server_default='true', nullable=False))
    op.add_column('employees', sa.Column('password_set_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False))


def downgrade() -> None:
    op.drop_column('employees', 'password_set_at')
    op.drop_column('employees', 'must_change_password')
    op.drop_column('employees', 'is_admin')

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'bbc355b916a9'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('checkins',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plate', sa.String(length=7), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('status', sa.Enum('waiting', 'admitted', 'cancelled', name='checkin_status', native_enum=False, create_constraint=True, length=20), server_default='waiting', nullable=False),
    sa.CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name=op.f('ck_checkins_plate_format')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_checkins'))
    )
    op.create_index(op.f('ix_checkins_created_at'), 'checkins', ['created_at'], unique=False)
    op.create_index(op.f('ix_checkins_plate'), 'checkins', ['plate'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_checkins_plate'), table_name='checkins')
    op.drop_index(op.f('ix_checkins_created_at'), table_name='checkins')
    op.drop_table('checkins')

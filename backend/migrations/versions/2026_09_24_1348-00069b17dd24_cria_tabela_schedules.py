from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '00069b17dd24'
down_revision: Union[str, Sequence[str], None] = '4c2dc2099079'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('schedules',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plate', sa.String(length=7), nullable=False),
    sa.Column('driver_name', sa.String(length=120), nullable=False),
    sa.Column('driver_document', sa.String(length=20), nullable=False),
    sa.Column('driver_document_photo_front_path', sa.String(length=255), nullable=True),
    sa.Column('driver_document_photo_back_path', sa.String(length=255), nullable=True),
    sa.Column('vehicle_document_photo_path', sa.String(length=255), nullable=True),
    sa.Column('cargo_type', sa.String(length=120), nullable=False),
    sa.Column('scheduled_date', sa.Date(), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name=op.f('ck_schedules_plate_format')),
    sa.ForeignKeyConstraint(['created_by_id'], ['employees.id'], name=op.f('fk_schedules_created_by_id_employees')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_schedules'))
    )
    op.create_index(op.f('ix_schedules_plate'), 'schedules', ['plate'], unique=False)
    op.create_index(op.f('ix_schedules_scheduled_date'), 'schedules', ['scheduled_date'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_schedules_scheduled_date'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_plate'), table_name='schedules')
    op.drop_table('schedules')

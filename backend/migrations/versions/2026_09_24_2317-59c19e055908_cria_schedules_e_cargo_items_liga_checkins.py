from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '59c19e055908'
down_revision: Union[str, Sequence[str], None] = '4c2dc2099079'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('schedules',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('plate', sa.String(length=7), nullable=False),
    sa.Column('driver_name', sa.String(length=120), nullable=False),
    sa.Column('driver_birth_date', sa.Date(), nullable=False),
    sa.Column('driver_birth_place', sa.String(length=120), nullable=False),
    sa.Column('driver_birth_state', sa.String(length=2), nullable=False),
    sa.Column('driver_document_type', sa.Enum('cpf', 'rg', 'cnh', name='driver_document_type', native_enum=False, create_constraint=True, length=10), nullable=False),
    sa.Column('driver_document', sa.String(length=20), nullable=False),
    sa.Column('driver_document_photo_front_path', sa.String(length=255), nullable=False),
    sa.Column('driver_document_photo_back_path', sa.String(length=255), nullable=False),
    sa.Column('driver_document_validated', sa.Boolean(), nullable=False),
    sa.Column('driver_document_validation_detail', sa.String(length=255), nullable=False),
    sa.Column('vehicle_document_photo_path', sa.String(length=255), nullable=False),
    sa.Column('vehicle_brand', sa.String(length=60), nullable=False),
    sa.Column('vehicle_model', sa.String(length=60), nullable=False),
    sa.Column('vehicle_year', sa.String(length=4), nullable=False),
    sa.Column('vehicle_chassis', sa.String(length=17), nullable=False),
    sa.Column('vehicle_color', sa.String(length=40), nullable=False),
    sa.Column('vehicle_length_m', sa.Float(), nullable=False),
    sa.Column('vehicle_height_m', sa.Float(), nullable=False),
    sa.Column('vehicle_width_m', sa.Float(), nullable=False),
    sa.Column('origin_location', sa.String(length=120), nullable=False),
    sa.Column('destination_location', sa.String(length=120), nullable=False),
    sa.Column('manifest_photo_path', sa.String(length=255), nullable=False),
    sa.Column('scheduled_date', sa.Date(), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("plate ~ '^[A-Z0-9]{7}$'", name=op.f('ck_schedules_plate_format')),
    sa.CheckConstraint("vehicle_chassis ~ '^[A-Z0-9]{17}$'", name=op.f('ck_schedules_vehicle_chassis_format')),
    sa.CheckConstraint("driver_birth_state ~ '^[A-Z]{2}$'", name=op.f('ck_schedules_driver_birth_state_format')),
    sa.ForeignKeyConstraint(['created_by_id'], ['employees.id'], name=op.f('fk_schedules_created_by_id_employees')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_schedules')),
    sa.UniqueConstraint('plate', 'scheduled_date', name='uq_schedules_plate_scheduled_date'),
    sa.UniqueConstraint('driver_document', 'scheduled_date', name='uq_schedules_driver_document_scheduled_date'),
    sa.UniqueConstraint('vehicle_chassis', 'scheduled_date', name='uq_schedules_vehicle_chassis_scheduled_date')
    )
    op.create_index(op.f('ix_schedules_plate'), 'schedules', ['plate'], unique=False)
    op.create_index(op.f('ix_schedules_scheduled_date'), 'schedules', ['scheduled_date'], unique=False)
    op.create_table('cargo_items',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('schedule_id', sa.Integer(), nullable=False),
    sa.Column('product_name', sa.String(length=120), nullable=False),
    sa.Column('category', sa.Enum('perecivel', 'nao_perecivel', 'quimico', 'toxico', 'inflamavel', name='cargo_category', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.ForeignKeyConstraint(['schedule_id'], ['schedules.id'], name=op.f('fk_cargo_items_schedule_id_schedules'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_cargo_items'))
    )
    op.add_column('checkins', sa.Column('created_by_id', sa.Integer(), nullable=False))
    op.add_column('checkins', sa.Column('schedule_id', sa.Integer(), nullable=True))
    op.add_column('checkins', sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(op.f('fk_checkins_created_by_id_employees'), 'checkins', 'employees', ['created_by_id'], ['id'])
    op.create_foreign_key(op.f('fk_checkins_schedule_id_schedules'), 'checkins', 'schedules', ['schedule_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint(op.f('fk_checkins_schedule_id_schedules'), 'checkins', type_='foreignkey')
    op.drop_constraint(op.f('fk_checkins_created_by_id_employees'), 'checkins', type_='foreignkey')
    op.drop_column('checkins', 'decided_at')
    op.drop_column('checkins', 'schedule_id')
    op.drop_column('checkins', 'created_by_id')
    op.drop_table('cargo_items')
    op.drop_index(op.f('ix_schedules_scheduled_date'), table_name='schedules')
    op.drop_index(op.f('ix_schedules_plate'), table_name='schedules')
    op.drop_table('schedules')

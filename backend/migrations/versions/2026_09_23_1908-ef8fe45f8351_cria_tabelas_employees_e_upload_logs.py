from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ef8fe45f8351'
down_revision: Union[str, Sequence[str], None] = 'bbc355b916a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('employees',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('username', sa.String(length=50), nullable=False),
    sa.Column('password_hash', sa.String(length=60), nullable=False),
    sa.Column('full_name', sa.String(length=120), nullable=False),
    sa.Column('active', sa.Boolean(), server_default='true', nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_employees'))
    )
    op.create_index(op.f('ix_employees_username'), 'employees', ['username'], unique=True)
    op.create_table('upload_logs',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('employee_id', sa.Integer(), nullable=False),
    sa.Column('endpoint', sa.Enum('upload', 'manual', name='upload_log_endpoint', native_enum=False, create_constraint=True, length=20), nullable=False),
    sa.Column('client_ip', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=300), nullable=True),
    sa.Column('ocr_plate', sa.String(length=7), nullable=True),
    sa.Column('ocr_confidence', sa.Float(), nullable=True),
    sa.Column('manual_plate', sa.String(length=7), nullable=True),
    sa.Column('final_plate', sa.String(length=7), nullable=True),
    sa.Column('final_plate_format', sa.Enum('mercosul', 'antigo', name='upload_log_plate_format', native_enum=False, create_constraint=True, length=20), nullable=True),
    sa.Column('needs_review', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('photo_path', sa.String(length=255), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint("final_plate IS NULL OR final_plate ~ '^[A-Z0-9]{7}$'", name=op.f('ck_upload_logs_final_plate_format')),
    sa.CheckConstraint("manual_plate IS NULL OR manual_plate ~ '^[A-Z0-9]{7}$'", name=op.f('ck_upload_logs_manual_plate_format')),
    sa.CheckConstraint("ocr_plate IS NULL OR ocr_plate ~ '^[A-Z0-9]{7}$'", name=op.f('ck_upload_logs_ocr_plate_format')),
    sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], name=op.f('fk_upload_logs_employee_id_employees')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_upload_logs'))
    )
    op.create_index(op.f('ix_upload_logs_created_at'), 'upload_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_upload_logs_employee_id'), 'upload_logs', ['employee_id'], unique=False)
    op.create_index(op.f('ix_upload_logs_final_plate'), 'upload_logs', ['final_plate'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_upload_logs_final_plate'), table_name='upload_logs')
    op.drop_index(op.f('ix_upload_logs_employee_id'), table_name='upload_logs')
    op.drop_index(op.f('ix_upload_logs_created_at'), table_name='upload_logs')
    op.drop_table('upload_logs')
    op.drop_index(op.f('ix_employees_username'), table_name='employees')
    op.drop_table('employees')

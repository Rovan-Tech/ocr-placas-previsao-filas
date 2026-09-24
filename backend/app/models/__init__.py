# Importar os modelos aqui garante que eles se registrem em Base.metadata
# (usado pelo Alembic para o autogenerate).
from app.models.checkin import CheckIn, CheckInStatus
from app.models.employee import Employee
from app.models.upload_log import UploadEndpoint, UploadLog

__all__ = ["CheckIn", "CheckInStatus", "Employee", "UploadEndpoint", "UploadLog"]

# Importar os modelos aqui garante que eles se registrem em Base.metadata
# (usado pelo Alembic para o autogenerate).
from app.models.checkin import CheckIn, CheckInStatus

__all__ = ["CheckIn", "CheckInStatus"]

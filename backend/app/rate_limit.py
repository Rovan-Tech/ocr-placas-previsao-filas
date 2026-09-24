from slowapi import Limiter
from slowapi.util import get_remote_address

# Módulo separado (em vez de definir direto em app/main.py) para evitar import
# circular: app/main.py registra o limiter na aplicação, e os routers (ex:
# app/routers/ocr.py) importam esse mesmo objeto para decorar suas rotas.
limiter = Limiter(key_func=get_remote_address)

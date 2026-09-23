from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente (ou de backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Padrão alinhado ao docker-compose.yml da raiz — funciona sem .env.
    database_url: str = "postgresql+psycopg://ocr:ocr@localhost:5433/ocr_placas"


settings = Settings()

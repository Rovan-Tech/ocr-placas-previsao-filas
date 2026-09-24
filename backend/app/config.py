from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente (ou de backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Padrão alinhado ao docker-compose.yml da raiz — funciona sem .env.
    database_url: str = "postgresql+psycopg://ocr:ocr@localhost:5433/ocr_placas"

    # Origem(ns) liberada(s) pelo CORS, separadas por vírgula (ex: produção com
    # frontend e backend em domínios diferentes). Vazio = nenhuma origem
    # liberada — é o caso do dev local, onde o proxy do Vite evita precisar de
    # CORS. Nunca usar "*" aqui (regra de segurança do projeto).
    frontend_origins: str = ""

    # Limite de requisições ao /ocr/upload por IP (proteção contra DoS no
    # endpoint mais pesado da API). Formato da lib `slowapi`/`limits`.
    ocr_upload_rate_limit: str = "10/minute"

    @property
    def frontend_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


settings = Settings()

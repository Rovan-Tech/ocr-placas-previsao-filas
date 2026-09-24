import secrets

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente (ou de backend/.env)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Padrão alinhado ao docker-compose.yml da raiz — funciona sem .env.
    database_url: str = "postgresql+psycopg://ocr:ocr@localhost:5433/ocr_placas"

    # Assina os tokens de login (JWT). Sem .env, gera uma chave aleatória a cada subida do
    # servidor — funciona para rodar local, mas invalida os logins a cada reinício. Em produção,
    # defina JWT_SECRET_KEY no .env (ex.: `openssl rand -hex 32`) para os logins sobreviverem a
    # um restart do servidor.
    jwt_secret_key: str = secrets.token_hex(32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 12 * 60  # um turno de trabalho

    # Pasta local onde ficam as fotos de resguardo (câmera não leu, fiscal digitou por cima) —
    # nunca no banco, e nunca versionada (ver .gitignore). Relativa a backend/, a não ser que um
    # caminho absoluto seja informado.
    upload_dir: str = "data/uploads"

    @field_validator("jwt_secret_key")
    @classmethod
    def _never_an_empty_secret(cls, value: str) -> str:
        # Uma JWT_SECRET_KEY="" no .env sobrescreveria a chave aleatória do default por uma
        # chave vazia — adivinhável, pior do que nunca ter definido nada.
        return value if value else secrets.token_hex(32)

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

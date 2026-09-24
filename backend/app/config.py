import secrets

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://ocr:ocr@localhost:5433/ocr_placas"

    jwt_secret_key: str = secrets.token_hex(32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 12 * 60

    upload_dir: str = "data/uploads"

    @field_validator("jwt_secret_key")
    @classmethod
    def _never_an_empty_secret(cls, value: str) -> str:
        return value if value else secrets.token_hex(32)

    frontend_origins: str = ""

    ocr_upload_rate_limit: str = "10/minute"

    api_brasil_device_token: str = ""
    api_brasil_bearer_token: str = ""
    api_brasil_timeout_seconds: float = 5.0

    @property
    def frontend_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


settings = Settings()

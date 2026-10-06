from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str

    mqtt_host: str = "mosquitto"
    mqtt_port: int = 1883
    mqtt_username: str = "backend"
    mqtt_password: str

    alerts_api_key: str
    dashboard_user: str = "superviseur"
    dashboard_password: str
    session_secret: str
    session_max_age_seconds: int = 12 * 3600
    cookie_secure: bool = True

    command_timeout_seconds: int = 10
    stale_after_seconds: int = 15
    video_stream_url: str = ""
    max_body_bytes: int = 16 * 1024

    @field_validator("mqtt_password", "alerts_api_key", "dashboard_password", "session_secret")
    @classmethod
    def no_placeholder(cls, value: str) -> str:
        # Refuse de démarrer avec les valeurs d'exemple de .env.example.
        if not value or value == "change-me":
            raise ValueError("secret manquant ou laissé à la valeur d'exemple")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()

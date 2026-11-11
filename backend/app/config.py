from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://gewu:gewu@localhost:5432/gewu"
    cors_origins: str = "http://localhost:5173"
    ai_api_key: str = ""
    ai_base_url: str = "https://aiping.cn/api/v1"
    ai_model: str = "Qwen3.5-35B-A3B"
    asset_dir: str = str(Path(__file__).resolve().parents[2] / "instance" / "assets")
    api_token: str = Field(default="gewulab233", validation_alias="GEWU_API_TOKEN")
    static_dir: str = str(Path(__file__).resolve().parents[2] / "frontend" / "dist")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def cors_origin_list(self):
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()

import os
from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+psycopg://trace_x:trace_x_secure_2026@localhost:5432/trace_x"
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "trace_x_neo4j_2026"

    # Security
    SECRET_KEY: str = "trace_x_secret_key_2026_change_in_production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    SCRYPT_N: int = 32768
    SCRYPT_R: int = 8
    SCRYPT_P: int = 1

    # Application
    APP_NAME: str = "TRACE-X"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    TRACEX_DEMO_MODE: bool = True
    LOG_LEVEL: str = "INFO"

    # ML
    MODEL_PATH: str = "/app/models/xgboost_model.json"
    SCALER_PATH: str = "/app/models/scaler.joblib"
    FEATURE_NAMES_PATH: str = "/app/models/feature_names.json"

    # File Upload
    MAX_UPLOAD_SIZE: int = 100 * 1024 * 1024
    UPLOAD_DIR: str = "/app/uploads"

    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://trace-x.localhost"]

    # Rate Limiting
    RATE_LIMIT_REQUESTS: int = 100
    RATE_LIMIT_WINDOW: int = 60


@lru_cache
def get_settings() -> Settings:
    return Settings()
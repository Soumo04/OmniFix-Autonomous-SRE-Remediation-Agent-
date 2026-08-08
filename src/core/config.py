"""
OmniFix Core Configuration
Pydantic-settings based config with environment variable support.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class LLMProvider(str, Enum):
    MOCK = "mock"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    OLLAMA = "ollama"
    GEMINI = "gemini"


class AppEnvironment(str, Enum):
    DEVELOPMENT = "development"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    app_name: str = "OmniFix"
    app_version: str = "1.0.0"
    app_env: AppEnvironment = AppEnvironment.DEVELOPMENT
    debug: bool = True
    secret_key: str = "omnifix-dev-secret-change-in-prod"

    # ── Server ────────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    mcp_host: str = "0.0.0.0"
    mcp_port: int = 9000

    # ── LLM Provider ─────────────────────────────────────────────────────────
    llm_provider: LLMProvider = LLMProvider.MOCK
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"
    redis_prefix: str = "omnifix:"
    redis_ttl: int = 3600  # seconds

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./omnifix.db"

    # ── Agent Configuration ───────────────────────────────────────────────────
    hitl_confidence_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    max_retry_attempts: int = 3
    retry_base_delay: float = 1.0  # seconds
    agent_timeout: int = 120  # seconds

    # ── External Integrations ─────────────────────────────────────────────────
    gmail_client_id: Optional[str] = None
    gmail_client_secret: Optional[str] = None
    slack_bot_token: Optional[str] = None
    notion_token: Optional[str] = None
    github_token: Optional[str] = None

    # ── Feature Flags ─────────────────────────────────────────────────────────
    enable_playwright: bool = False
    enable_ocr: bool = False
    enable_real_email: bool = False
    demo_mode: bool = True

    # ── Logging ───────────────────────────────────────────────────────────────
    log_level: str = "INFO"
    log_format: str = "json"  # json | console

    @field_validator("hitl_confidence_threshold")
    @classmethod
    def validate_threshold(cls, v: float) -> float:
        if not 0.0 <= v <= 1.0:
            raise ValueError("HITL threshold must be between 0.0 and 1.0")
        return v

    @property
    def is_production(self) -> bool:
        return self.app_env == AppEnvironment.PRODUCTION

    @property
    def use_real_llm(self) -> bool:
        return self.llm_provider != LLMProvider.MOCK

    @property
    def redis_enabled(self) -> bool:
        return not self.redis_url.startswith("memory://")


# Global singleton
settings = Settings()

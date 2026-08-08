"""
OmniFix — Core Configuration
SRE Orchestrator edition: three MCP server topology + MRTR secret key.
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
    app_version: str = "2.0.0"
    app_env: AppEnvironment = AppEnvironment.DEVELOPMENT
    debug: bool = True
    secret_key: str = "omnifix-dev-secret-change-in-prod"

    # ── Main API Server ────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # ── MCP Server Topology (Stateless ASGI-native micro-servers) ──────────────
    # Telemetry MCP — read-only log & metric tracing (Port 8001)
    telemetry_mcp_host: str = "0.0.0.0"
    telemetry_mcp_port: int = 8001

    # GitOps MCP — code inspection + hotfix PR staging (Port 8002)
    gitops_mcp_host: str = "0.0.0.0"
    gitops_mcp_port: int = 8002

    # InfraOps MCP — container runtime management (Port 8003)
    infraops_mcp_host: str = "0.0.0.0"
    infraops_mcp_port: int = 8003

    # ── Multi-Round-Trip Request (MRTR) Security ───────────────────────────────
    # Static shared key ensures MRTR state survives across multi-worker deployments.
    # MUST be changed to a secret random value in production.
    mrtr_secret_key: str = "omnifix-mrtr-static-key-change-in-prod"

    # ── LLM Provider ─────────────────────────────────────────────────────────
    llm_provider: LLMProvider = LLMProvider.MOCK
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # ── Agent Configuration ───────────────────────────────────────────────────
    hitl_confidence_threshold: float = Field(default=0.70, ge=0.0, le=1.0)
    max_retry_attempts: int = 3
    retry_base_delay: float = 1.0  # seconds
    agent_timeout: int = 300  # seconds — SRE incidents may need longer

    # ── Feature Flags ─────────────────────────────────────────────────────────
    demo_mode: bool = True  # Produces realistic simulated MCP tool outputs
    enable_real_docker: bool = False  # If True, calls real Docker socket
    enable_real_github: bool = False  # If True, calls real GitHub API
    github_token: Optional[str] = None

    # ── Logging ───────────────────────────────────────────────────────────────
    # CRITICAL: All MCP server logs must go to stderr, never stdout.
    # Stdout corruption will crash the JSON-RPC stream.
    log_level: str = "INFO"
    log_format: str = "json"  # json | console

    @property
    def is_production(self) -> bool:
        return self.app_env == AppEnvironment.PRODUCTION

    @property
    def use_real_llm(self) -> bool:
        return self.llm_provider != LLMProvider.MOCK


# Global singleton
settings = Settings()

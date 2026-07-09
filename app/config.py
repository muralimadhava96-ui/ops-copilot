"""Application configuration loaded from environment variables.

All secrets are read from environment variables (never hardcoded).
Copy `.env.example` to `.env` and fill in your API key before running.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Runtime configuration for the Stadium Ops Copilot."""

    gemini_api_key: str = ""
    model_name: str = "gemini-2.0-flash"
    port: int = 8000

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

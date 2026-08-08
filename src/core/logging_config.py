"""
OmniFix Structured Logging
JSON-formatted logs with rich console output for development.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone
from typing import Any

import structlog
from rich.console import Console
from rich.logging import RichHandler

from src.core.config import settings

console = Console(stderr=True)


def _add_timestamp(
    logger: Any, method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    event_dict["timestamp"] = datetime.now(timezone.utc).isoformat()
    return event_dict


def _add_app_context(
    logger: Any, method: str, event_dict: dict[str, Any]
) -> dict[str, Any]:
    event_dict["app"] = settings.app_name
    event_dict["version"] = settings.app_version
    event_dict["env"] = settings.app_env.value
    return event_dict


def setup_logging() -> None:
    """Configure structlog with JSON output (prod) or rich console (dev)."""

    shared_processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        _add_timestamp,
        _add_app_context,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.log_format == "json" or settings.is_production:
        renderer: Any = structlog.processors.JSONRenderer()
        logging.basicConfig(
            format="%(message)s",
            stream=sys.stdout,
            level=getattr(logging, settings.log_level.upper()),
        )
    else:
        renderer = structlog.dev.ConsoleRenderer(colors=True)
        logging.basicConfig(
            handlers=[
                RichHandler(
                    console=console,
                    rich_tracebacks=True,
                    show_path=True,
                )
            ],
            format="%(message)s",
            level=getattr(logging, settings.log_level.upper()),
        )

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Get a bound structlog logger with the given name."""
    return structlog.get_logger(name)


# Initialise on import
setup_logging()

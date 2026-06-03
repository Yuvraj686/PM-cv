import logging
import sys
import structlog
from core.config import settings


def configure_logger():
    # Clear any existing handlers to prevent duplicate logs
    root_logger = logging.getLogger()
    if root_logger.handlers:
        for handler in root_logger.handlers:
            root_logger.removeHandler(handler)

    # Base logging level
    logging.basicConfig(
        level=logging.INFO if settings.ENV == "production" else logging.DEBUG,
        format="%(message)s",
        stream=sys.stdout,
    )

    processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]

    if settings.ENV == "production":
        # Production JSON logging
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Development pretty console logging
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


configure_logger()
logger = structlog.get_logger()

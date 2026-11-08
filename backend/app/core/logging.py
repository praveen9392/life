import json
import logging
import re
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.core.config import Settings

request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")

TEXT_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(request_id)s | %(name)s:%(funcName)s:%(lineno)d - %(message)s"
)
_LOG_FILE_MAX_BYTES = 5 * 1024 * 1024
_LOG_FILE_BACKUP_COUNT = 5
_MASK = "***"

_DSN_PASSWORD = re.compile(r"(postgres(?:ql)?(?:\+\w+)?://[^:/@\s]+:)[^@\s]+(@)", re.IGNORECASE)
_SENSITIVE_KEY_VALUE = re.compile(
    r"""(?P<key>["']?[\w-]*(?:password|passwd|token|secret|authorization|cookie)[\w-]*["']?)"""
    r"""(?P<sep>\s*[=:]\s*)(?P<value>"[^"]*"|'[^']*'|[^\s,;&}]+)""",
    re.IGNORECASE,
)


def redact_sensitive_text(text: str) -> str:
    text = _DSN_PASSWORD.sub(rf"\g<1>{_MASK}\g<2>", text)
    return _SENSITIVE_KEY_VALUE.sub(lambda m: f"{m['key']}{m['sep']}{_MASK}", text)


class RedactionFilter(logging.Filter):
    """Masks secrets (passwords, tokens, DSN credentials) in messages and exception text."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.msg = redact_sensitive_text(record.getMessage())
        record.args = None
        if record.exc_info:
            record.exc_text = redact_sensitive_text(
                logging.Formatter().formatException(record.exc_info)
            )
            record.exc_info = None
        elif record.exc_text:
            record.exc_text = redact_sensitive_text(record.exc_text)
        return True


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        return True


class _ModuleNameFilter(logging.Filter):
    """%(name)s -> the call site's module path (e.g. `app.main`); records
    outside the app package (uvicorn, third-party) keep their logger name."""

    def filter(self, record: logging.LogRecord) -> bool:
        path = record.pathname.replace("\\", "/")
        if "/app/" in path:
            record.name = "app." + path.split("/app/")[-1].removesuffix(".py").replace("/", ".")
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        elif record.exc_text:
            payload["exc_info"] = record.exc_text
        return json.dumps(payload, default=str)


def configure_logging(settings: "Settings") -> None:
    """Configure root logging from settings; safe to call repeatedly."""
    formatter: logging.Formatter = (
        JsonFormatter() if settings.log_json_enabled else _TextFormatter(TEXT_FORMAT)
    )
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if settings.log_file and Path(settings.log_file).is_absolute():
        handlers.append(
            RotatingFileHandler(
                settings.log_file,
                maxBytes=_LOG_FILE_MAX_BYTES,
                backupCount=_LOG_FILE_BACKUP_COUNT,
            )
        )
    for handler in handlers:
        handler.setFormatter(formatter)
        handler.addFilter(_ModuleNameFilter())
        handler.addFilter(RequestIDFilter())
        handler.addFilter(RedactionFilter())

    root = logging.getLogger()
    for existing in list(root.handlers):
        root.removeHandler(existing)
        existing.close()
    root.setLevel(settings.log_level.upper())
    for handler in handlers:
        root.addHandler(handler)

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True


class _TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = "-"
        return super().format(record)


logger = logging.getLogger("life")

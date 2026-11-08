"""Logging redaction, formatting, and configuration tests."""

import json
import logging
import sys
from types import SimpleNamespace

import pytest

from app.core.logging import (
    JsonFormatter,
    RedactionFilter,
    RequestIDFilter,
    configure_logging,
    redact_sensitive_text,
    request_id_ctx,
)


@pytest.fixture
def restore_root_logging():
    root = logging.getLogger()
    saved_handlers, saved_level = list(root.handlers), root.level
    yield root
    for handler in list(root.handlers):
        root.removeHandler(handler)
        if handler not in saved_handlers:
            handler.close()
    for handler in saved_handlers:
        root.addHandler(handler)
    root.setLevel(saved_level)


def _settings(**overrides):
    values = {"log_json_enabled": False, "log_file": None, "log_level": "INFO"}
    values.update(overrides)
    return SimpleNamespace(**values)


def _record(message="msg", args=None, exc_info=None):
    return logging.LogRecord("t", logging.INFO, __file__, 1, message, args, exc_info)


def test_redacts_password_and_token_key_values() -> None:
    text = redact_sensitive_text("login password=hunter2 token: abc123 {'secret': 'xyz'}")
    assert "hunter2" not in text and "abc123" not in text and "xyz" not in text
    assert "***" in text


def test_redacts_dsn_password() -> None:
    text = redact_sensitive_text("connect postgresql+asyncpg://user:s3cretpw@localhost:5432/db")
    assert "s3cretpw" not in text
    assert "user:***@localhost" in text


def test_redaction_filter_masks_message_args() -> None:
    record = _record("failed with password=%s", ("topsecret",))
    assert RedactionFilter().filter(record) is True
    assert "topsecret" not in record.getMessage()


def test_redaction_filter_masks_exception_text() -> None:
    try:
        raise RuntimeError("bad dsn postgresql://u:pw12345@h/db token=abcdef")
    except RuntimeError:
        record = _record("boom", exc_info=sys.exc_info())
    RedactionFilter().filter(record)
    assert record.exc_info is None
    assert "pw12345" not in record.exc_text and "abcdef" not in record.exc_text


def test_json_formatter_outputs_valid_json_with_request_id() -> None:
    record = _record("hello")
    record.request_id = "req-12345678"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["message"] == "hello"
    assert payload["request_id"] == "req-12345678"
    assert payload["level"] == "INFO"


def test_json_formatter_includes_exception() -> None:
    try:
        raise ValueError("x")
    except ValueError:
        record = _record("err", exc_info=sys.exc_info())
    assert "ValueError" in json.loads(JsonFormatter().format(record))["exc_info"]


def test_request_id_default_and_filter_injection() -> None:
    assert request_id_ctx.get() == "-"
    record = _record()
    RequestIDFilter().filter(record)
    assert record.request_id == "-"
    token = request_id_ctx.set("abc-12345678")
    try:
        RequestIDFilter().filter(record)
    finally:
        request_id_ctx.reset(token)
    assert record.request_id == "abc-12345678"


def test_configure_logging_without_log_file_has_no_file_handler(restore_root_logging) -> None:
    configure_logging(_settings())
    assert not any(isinstance(h, logging.FileHandler) for h in restore_root_logging.handlers)


def test_configure_logging_adds_file_handler_for_absolute_path(restore_root_logging, tmp_path) -> None:
    log_path = tmp_path / "app.log"
    configure_logging(_settings(log_file=str(log_path)))
    file_handlers = [h for h in restore_root_logging.handlers if isinstance(h, logging.FileHandler)]
    assert len(file_handlers) == 1


def test_configure_logging_ignores_relative_log_file(restore_root_logging) -> None:
    configure_logging(_settings(log_file="relative/app.log"))
    assert not any(isinstance(h, logging.FileHandler) for h in restore_root_logging.handlers)


def test_configure_logging_honors_level(restore_root_logging) -> None:
    configure_logging(_settings(log_level="warning"))
    assert restore_root_logging.level == logging.WARNING

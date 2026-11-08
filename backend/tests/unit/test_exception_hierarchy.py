"""The AppException hierarchy: status codes, codes, fields and relationships."""

import re
from collections.abc import Callable
from pathlib import Path

import pytest

from app.core.exceptions import (
    AppException,
    BusinessRuleError,
    ConflictError,
    DuplicateRecordError,
    ExternalServiceError,
    ExternalServiceTimeoutError,
    ExternalServiceUnavailableError,
    ForbiddenError,
    InternalServerError,
    InvalidPayloadError,
    NotFoundError,
    ServiceError,
    UnauthorizedError,
    ValidationError,
)
from app.services.storage_service import StorageNotConfiguredError, StorageUploadError

GENERIC_EXCEPTIONS = [
    (NotFoundError, 404, "NOT_FOUND"),
    (ForbiddenError, 403, "FORBIDDEN"),
    (ValidationError, 422, "VALIDATION_ERROR"),
    (ConflictError, 409, "CONFLICT"),
    (UnauthorizedError, 401, "UNAUTHORIZED"),
    (BusinessRuleError, 422, "BUSINESS_RULE_VIOLATION"),
    (ExternalServiceError, 502, "EXTERNAL_SERVICE_ERROR"),
    (ExternalServiceUnavailableError, 503, "EXTERNAL_SERVICE_UNAVAILABLE"),
    (ExternalServiceTimeoutError, 504, "EXTERNAL_SERVICE_TIMEOUT"),
    (InternalServerError, 500, "INTERNAL_ERROR"),
]


@pytest.mark.parametrize(("exc_class", "status_code", "code"), GENERIC_EXCEPTIONS)
def test_exception_defaults(exc_class: type[AppException], status_code: int, code: str) -> None:
    exc = exc_class("boom")
    assert exc.status_code == status_code
    assert exc.code == code
    assert exc.message == "boom"
    assert str(exc) == "boom"
    assert exc.fields is None
    assert isinstance(exc, AppException)
    assert isinstance(exc, Exception)


@pytest.mark.parametrize(("exc_class", "status_code", "code"), GENERIC_EXCEPTIONS)
def test_custom_code_and_fields_override_defaults(
    exc_class: type[AppException], status_code: int, code: str
) -> None:
    exc = exc_class("boom", code="TASK_NOT_FOUND", fields={"title": "bad"})
    assert exc.code == "TASK_NOT_FOUND"
    assert exc.fields == {"title": "bad"}
    assert exc.status_code == status_code
    # Instance override must not mutate the class default.
    assert exc_class.code == code


@pytest.mark.parametrize(
    ("exc_class", "status_code", "code", "message"),
    [
        (StorageNotConfiguredError, 503, "STORAGE_NOT_CONFIGURED", "File storage is not configured on this server"),
        (StorageUploadError, 502, "STORAGE_UPLOAD_FAILED", "Uploading the file failed, please try again"),
    ],
)
def test_storage_exceptions(exc_class: Callable[[], AppException], status_code: int, code: str, message: str) -> None:
    exc = exc_class()
    assert (exc.status_code, exc.code, exc.message, exc.fields) == (status_code, code, message, None)


def test_storage_exception_relationships() -> None:
    assert issubclass(StorageNotConfiguredError, ExternalServiceUnavailableError)
    assert issubclass(StorageUploadError, ExternalServiceError)
    assert not issubclass(StorageUploadError, ExternalServiceUnavailableError)


def test_external_service_subclasses_share_base() -> None:
    assert issubclass(ExternalServiceUnavailableError, ExternalServiceError)
    assert issubclass(ExternalServiceTimeoutError, ExternalServiceError)
    assert not issubclass(ExternalServiceTimeoutError, ExternalServiceUnavailableError)


@pytest.mark.parametrize(
    "exc_class",
    [ForbiddenError, ValidationError, ConflictError, UnauthorizedError, BusinessRuleError],
)
def test_client_errors_are_direct_app_exception_subclasses(exc_class: type[AppException]) -> None:
    assert exc_class.__bases__ == (AppException,)
    assert 400 <= exc_class.status_code < 500


@pytest.mark.parametrize("exc_class", [NotFoundError, InvalidPayloadError])
def test_value_error_mixins_subclass_app_exception_and_value_error(
    exc_class: type[AppException],
) -> None:
    """NotFoundError / InvalidPayloadError keep dual bases: AppException routes them
    through the central handler, ValueError lets them double as idiomatic errors."""
    assert exc_class.__bases__ == (AppException, ValueError)
    assert issubclass(exc_class, AppException)
    assert issubclass(exc_class, ValueError)
    assert 400 <= exc_class.status_code < 500


def test_base_app_exception_defaults_to_400() -> None:
    exc = AppException("generic")
    assert exc.status_code == 400
    assert exc.code == "APP_ERROR"


def test_message_is_keyword_safe_and_required() -> None:
    # AppException requires its message; code/fields stay keyword-only.
    with pytest.raises(TypeError):
        AppException()  # type: ignore[call-arg]
    with pytest.raises(TypeError):
        AppException("x", "CODE")  # type: ignore[misc]  # code is keyword-only
    # NotFoundError takes the resource first; omitting it is a TypeError.
    with pytest.raises(TypeError):
        NotFoundError()  # type: ignore[call-arg]


def test_distinct_status_codes_per_class_do_not_leak_between_siblings() -> None:
    assert ValidationError.code != BusinessRuleError.code
    assert ExternalServiceError.status_code == 502
    assert ExternalServiceUnavailableError.status_code == 503


# ServiceError


def test_service_error_is_app_exception_subclass_with_safe_defaults() -> None:
    """ServiceError is an AppException (the central AppException handler renders it),
    not a bare Exception: 500 INTERNAL_ERROR with a generic default message."""
    assert issubclass(ServiceError, AppException)
    exc = ServiceError()
    assert (exc.status_code, exc.code) == (500, "INTERNAL_ERROR")
    assert exc.message == "Unexpected service error"
    assert str(exc) == "Unexpected service error"
    assert exc.fields is None


def test_service_error_keeps_custom_generic_message() -> None:
    exc = ServiceError("Unexpected error while listing habits")
    assert exc.message == "Unexpected error while listing habits"
    assert str(exc) == "Unexpected error while listing habits"
    assert (exc.status_code, exc.code) == (500, "INTERNAL_ERROR")


# NotFoundError: dual constructor


def test_not_found_error_resource_id_style_builds_message_and_attributes() -> None:
    exc = NotFoundError("Habit", id="abc-123")
    assert exc.message == "Habit not found with id: abc-123"
    assert str(exc) == "Habit not found with id: abc-123"
    assert exc.resource == "Habit"
    assert exc.resource_id == "abc-123"
    assert (exc.status_code, exc.code) == (404, "NOT_FOUND")
    assert exc.fields is None


def test_not_found_error_resource_id_style_accepts_message_code_fields() -> None:
    exc = NotFoundError("Task", id=7, message="Custom text", code="TASK_NOT_FOUND", fields={"tag": "x"})
    assert exc.message == "Custom text"
    assert exc.code == "TASK_NOT_FOUND"
    assert exc.fields == {"tag": "x"}
    assert exc.resource == "Task"
    assert exc.resource_id == 7


def test_not_found_error_legacy_message_style_leaves_resource_unset() -> None:
    exc = NotFoundError("Habit not found")
    assert exc.message == "Habit not found"
    assert str(exc) == "Habit not found"
    assert exc.resource is None
    assert exc.resource_id is None
    assert (exc.status_code, exc.code) == (404, "NOT_FOUND")


# InvalidPayloadError


def test_invalid_payload_error_auto_message_and_fields() -> None:
    exc = InvalidPayloadError("Habit", ["name", "frequency_type"])
    assert (exc.status_code, exc.code) == (422, "VALIDATION_ERROR")
    assert exc.message == "Invalid payload: cannot update ['name', 'frequency_type'] on Habit"
    assert exc.fields == {"invalid_fields": "name,frequency_type"}
    assert exc.resource == "Habit"
    assert exc.invalid_fields == ["name", "frequency_type"]


def test_invalid_payload_error_custom_message_overrides_auto_text() -> None:
    exc = InvalidPayloadError("Habit", ["name"], message="Custom payload problem")
    assert exc.message == "Custom payload problem"
    assert exc.fields == {"invalid_fields": "name"}
    assert (exc.status_code, exc.code) == (422, "VALIDATION_ERROR")


# DuplicateRecordError


def test_duplicate_record_error_is_conflict_with_structured_fields() -> None:
    assert issubclass(DuplicateRecordError, ConflictError)
    exc = DuplicateRecordError("Habit")
    assert (exc.status_code, exc.code) == (409, "CONFLICT")
    assert exc.message == "Habit already exists"
    # Envelope fields carry the structured details, never the message.
    assert exc.fields == {"resource": "Habit"}


def test_duplicate_record_error_auto_message_prefers_name_over_id() -> None:
    named = DuplicateRecordError("Habit", resource_name="Morning run")
    assert named.message == "Habit already exists with name: Morning run"
    assert named.fields == {"resource": "Habit", "resource_name": "Morning run"}

    with_id = DuplicateRecordError("Habit", resource_id=42)
    assert with_id.message == "Habit already exists with id: 42"
    assert with_id.fields == {"resource": "Habit", "resource_id": "42"}


def test_duplicate_record_error_to_dict_toggles_message() -> None:
    exc = DuplicateRecordError("Habit", resource_id=7, resource_name="Walk")
    assert exc.to_dict() == {
        "message": "Habit already exists with name: Walk",
        "resource": "Habit",
        "resource_id": "7",
        "resource_name": "Walk",
    }
    assert exc.to_dict(include_message=False) == {
        "resource": "Habit",
        "resource_id": "7",
        "resource_name": "Walk",
    }
    assert exc.fields == exc.to_dict(include_message=False)


def test_duplicate_record_error_custom_message_kept_out_of_fields() -> None:
    exc = DuplicateRecordError("Habit", resource_id=3, message="Custom duplicate text")
    assert exc.message == "Custom duplicate text"
    assert exc.fields == {"resource": "Habit", "resource_id": "3"}


# AppException is a pure parent


def test_app_exception_is_never_raised_directly_in_app_code() -> None:
    """AppException is a pure parent: no app module may raise it directly.

    Comments and docstrings are stripped with a simple regex first so
    documentation mentioning the class does not trip the assertion.
    """
    app_root = Path(__file__).resolve().parents[2] / "app"
    docstrings_and_comments = re.compile(r'"""[\s\S]*?"""|\'\'\'[\s\S]*?\'\'\'|#[^\n]*')
    offenders: list[str] = []
    for source_path in sorted(app_root.rglob("*.py")):
        cleaned_source = docstrings_and_comments.sub("", source_path.read_text(encoding="utf-8"))
        if "raise AppException(" in cleaned_source:
            offenders.append(source_path.as_posix())
    assert offenders == []

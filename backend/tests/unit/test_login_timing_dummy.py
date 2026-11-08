"""verify_password_dummy must run without raising (login timing equalizer)."""

from app.core.security import verify_password_dummy


def test_verify_password_dummy_runs_without_raising() -> None:
    assert verify_password_dummy("anything") is None
    assert verify_password_dummy("") is None

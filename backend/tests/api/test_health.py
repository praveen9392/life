"""Health metrics API tests: CRUD, filters, two-user isolation."""

import pytest
from httpx import AsyncClient

from tests.conftest import csrf_headers

pytestmark = pytest.mark.asyncio


async def test_health_metric_crud(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/health/metrics",
        json={"metric_type": "weight", "value": 72.5, "unit": "kg"},
        headers=csrf_headers(api_client),
    )
    assert created.status_code == 201, created.text
    metric = created.json()
    assert metric["metric_type"] == "weight"
    assert metric["value"] == 72.5
    assert metric["recorded_at"] is not None

    listed = await api_client.get("/api/v1/health/metrics?metric_type=weight")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == metric["id"]

    other_type = await api_client.get("/api/v1/health/metrics?metric_type=water")
    assert other_type.json()["total"] == 0

    deleted = await api_client.delete(
        f"/api/v1/health/metrics/{metric['id']}", headers=csrf_headers(api_client)
    )
    assert deleted.status_code == 204
    assert (await api_client.get("/api/v1/health/metrics")).json()["total"] == 0


async def test_health_metric_validation(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    negative = await api_client.post(
        "/api/v1/health/metrics",
        json={"metric_type": "weight", "value": -5, "unit": "kg"},
        headers=csrf_headers(api_client),
    )
    assert negative.status_code == 422

    bad_type = await api_client.post(
        "/api/v1/health/metrics",
        json={"metric_type": "mood", "value": 5, "unit": "pts"},
        headers=csrf_headers(api_client),
    )
    assert bad_type.status_code == 422


async def test_health_metrics_isolated_between_users(api_client: AsyncClient, user_a) -> None:  # type: ignore[no-untyped-def]
    created = await api_client.post(
        "/api/v1/health/metrics",
        json={"metric_type": "sleep", "value": 7.5, "unit": "hours"},
        headers=csrf_headers(api_client),
    )
    metric_id = created.json()["id"]

    headers = csrf_headers(api_client)
    await api_client.post(
        "/api/v1/auth/register",
        json={"email": "user-b@example.com", "password": "correct-horse-battery", "full_name": "B"},
        headers=headers,
    )
    await api_client.post(
        "/api/v1/auth/login",
        json={"email": "user-b@example.com", "password": "correct-horse-battery"},
        headers=csrf_headers(api_client),
    )

    assert (await api_client.get("/api/v1/health/metrics")).json()["total"] == 0
    assert (
        await api_client.delete(f"/api/v1/health/metrics/{metric_id}", headers=csrf_headers(api_client))
    ).status_code == 404

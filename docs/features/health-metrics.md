# Health Metrics

Last reviewed: 2026-10-10

## Overview
Time-stamped numeric measurements by type.

## Workflow
Create -> store `Numeric(10,2)`; list filters by `metric_type` and `on_date`, where the day boundary is computed in the user's timezone (`user_timezone` passed from the route).

## Components
`routes/health.py` (`/api/v1/health/metrics`, not the unversioned `/health` probe), `services/health_service.py`, `repositories/health_repository.py`, `schemas/health.py`.

## API contract
`GET /health/metrics` (Page), `POST /health/metrics` (201), `DELETE /health/metrics/{id}` (204). `value` > 0 and <= 1,000,000 in the schema (DB CHECK allows 0); `unit` 1..20; `note` <=2000.

## Data model
`health_metrics` (CHECK value >= 0; index user+type+recorded_at).

## Failure scenarios
Foreign id -> 404. Invalid enum/date -> 422. No update endpoint.

## Edge cases
Export converts `Decimal` to float. Schema rejects 0 although DB allows it.

## Security
Owner-scoped.

## Logging
None.

## Testing
`backend/tests/api/test_health.py`; liveness in `test_liveness.py` (no DB-down 503 test per audit).

## Known limitations
No bulk or update endpoints.

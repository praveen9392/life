# Error Responses

Last reviewed: 2026-10-10

Full lifecycle and table: [../architecture/error-handling.md](../architecture/error-handling.md). Source: `backend/app/core/exceptions.py`.

## Shape

```json
{"error": {"code": "VALIDATION_ERROR", "message": "Invalid request data", "fields": {"title": "Field required"}}}
```

`fields` appears only for validation errors; keys are dotted paths with the leading location segment (`body`/`query`) dropped.

## Examples

| Situation | Status | code | message |
|---|---|---|---|
| Missing/expired access cookie | 401 | `UNAUTHORIZED` | "Authentication required" / "Session expired, please log in again" |
| Bad credentials | 401 | `UNAUTHORIZED` | "Invalid email or password" (same for unknown user) |
| Missing/mismatched CSRF | 403 | `CSRF_VALIDATION_FAILED` | "CSRF token missing or invalid" |
| Resource missing or not yours | 404 | `NOT_FOUND` | e.g. "Task not found" |
| Duplicate email/tag/folder | 409 | `CONFLICT` | e.g. "An account with this email already exists" |
| DB unique violation not translated | 409 | `CONFLICT` | "The request conflicts with existing data" |
| Body too large | 413 | `PAYLOAD_TOO_LARGE` | "Request body too large" |
| Bad input (schema, `page_size=0`, `period=year`) | 422 | `VALIDATION_ERROR` | "Invalid request data" or specific |
| Rate limited | 429 | `RATE_LIMITED` | "Too many requests, please try again later" |
| Unexpected | 500 | `INTERNAL_ERROR` | "An unexpected error occurred" |
| Storage upload failed | 502 | `STORAGE_UPLOAD_FAILED` | "Uploading the file failed, please try again" |
| DB unreachable | 503 | `SERVICE_UNAVAILABLE` | "Service temporarily unavailable" |
| Storage not configured | 503 | `STORAGE_NOT_CONFIGURED` | "File storage is not configured on this server" |

Notes: the 404 for unknown routes and 405 use code `HTTP_ERROR`. Rate-limit 429 responses carry no `Retry-After` header from this handler (unverified for slowapi header injection). Validation is **422**, not 400.

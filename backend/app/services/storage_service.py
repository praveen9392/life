"""S3-compatible object storage for avatars (provider-agnostic: MinIO locally,
Cloudflare R2 / AWS S3 in production - see ARCHITECTURE.md "File Storage").

Security notes (see the security review checklist):
- Content-type/size are validated BEFORE upload; the object key is randomly
  generated server-side (a client-supplied filename/path is never trusted)
  and scoped per-user under `avatars/{user_id}/`.
"""

import uuid
from typing import BinaryIO

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.core.exceptions import AppException, ValidationError
from app.core.logging import get_logger

logger = get_logger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB


class StorageNotConfiguredError(AppException):
    status_code = 503
    code = "STORAGE_NOT_CONFIGURED"

    def __init__(self) -> None:
        super().__init__("File storage is not configured on this server")


class StorageUploadError(AppException):
    status_code = 502
    code = "STORAGE_UPLOAD_FAILED"

    def __init__(self) -> None:
        super().__init__("Uploading the file failed, please try again")


class StorageService:
    """Thin wrapper over an S3-compatible object store."""

    def __init__(self) -> None:
        settings = get_settings()
        self._bucket = settings.s3_bucket_name
        self._public_base_url = settings.s3_public_base_url
        self._configured = all(
            [settings.s3_endpoint_url, settings.s3_access_key, settings.s3_secret_key]
        )
        if self._configured:
            assert settings.s3_endpoint_url is not None
            assert settings.s3_access_key is not None
            assert settings.s3_secret_key is not None
            self._client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint_url,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                region_name=settings.s3_region,
                config=BotoConfig(signature_version="s3v4"),
            )
        else:
            self._client = None

    def is_configured(self) -> bool:
        return self._configured

    def upload_avatar(self, user_id: uuid.UUID, content: BinaryIO, content_type: str, size: int) -> str:
        """Upload an avatar image and return its public URL.

        Raises StorageNotConfiguredError when no S3 backend is configured and
        StorageUploadError when the upload itself fails.
        """
        if not self._configured or self._client is None:
            raise StorageNotConfiguredError()
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise ValidationError(
                message="Unsupported image type. Use JPEG, PNG, WebP, or GIF.",
                fields={"file": "Unsupported image type"},
            )
        if size > MAX_AVATAR_BYTES:
            raise ValidationError(
                message="Image is too large (max 2 MB).",
                fields={"file": "Image is too large (max 2 MB)"},
            )

        # Random server-generated key; never trust a client filename.
        extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}[content_type]
        key = f"avatars/{user_id}/{uuid.uuid4()}.{extension}"
        try:
            self._client.upload_fileobj(content, self._bucket, key, ExtraArgs={"ContentType": content_type})
        except (BotoCoreError, ClientError) as exc:
            logger.error("avatar_upload_failed", user_id=str(user_id), error=str(exc))
            raise StorageUploadError() from exc

        if self._public_base_url:
            return f"{self._public_base_url.rstrip('/')}/{key}"
        return f"/{self._bucket}/{key}"

    def delete_user_avatars(self, user_id: uuid.UUID) -> int:
        """Delete every object under the user's `avatars/{user_id}/` prefix.

        Used by account deletion so no personal file lingers at a public URL.
        Returns the number of objects deleted; returns 0 (and logs the
        underlying error) when storage is unconfigured or the call fails -
        callers treat this as best-effort, never fatal.
        """
        if not self._configured or self._client is None:
            return 0
        deleted = 0
        try:
            paginator = self._client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self._bucket, Prefix=f"avatars/{user_id}/"):
                keys = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if keys:
                    self._client.delete_objects(Bucket=self._bucket, Delete={"Objects": keys})
                    deleted += len(keys)
        except (BotoCoreError, ClientError) as exc:
            logger.error("avatar_delete_failed", user_id=str(user_id), error=str(exc))
        return deleted

"""S3-compatible object storage for avatars (provider-agnostic: MinIO locally,
Cloudflare R2 / AWS S3 in production - see ARCHITECTURE.md "File Storage").

Security notes (see the security review checklist):
- Content-type/size are validated BEFORE upload; the object key is randomly
  generated server-side (a client-supplied filename/path is never trusted)
  and scoped per-user under `avatars/{user_id}/`.
"""

import asyncio
import uuid
from typing import BinaryIO

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.core.exceptions import (
    ExternalServiceError,
    ExternalServiceUnavailableError,
    ValidationError,
)
from app.core.logging import logger

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_AVATAR_BYTES = 2 * 1024 * 1024  # 2 MB


class StorageNotConfiguredError(ExternalServiceUnavailableError):
    """Raised when an avatar operation runs with no S3 backend configured."""

    code = "STORAGE_NOT_CONFIGURED"

    def __init__(self) -> None:
        """Initialize the error with its fixed user-facing message."""
        super().__init__("File storage is not configured on this server")


class StorageUploadError(ExternalServiceError):
    """Raised when the S3 upload itself fails after validation passed."""

    code = "STORAGE_UPLOAD_FAILED"

    def __init__(self) -> None:
        """Initialize the error with its fixed user-facing message."""
        super().__init__("Uploading the file failed, please try again")


class StorageService:
    """Thin wrapper over an S3-compatible object store."""

    def __init__(self) -> None:
        """Load storage settings and build the S3 client when configured."""
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
                config=BotoConfig(
                    signature_version="s3v4",
                    connect_timeout=5,
                    read_timeout=10,
                    retries={"max_attempts": 3},
                ),
            )
        else:
            self._client = None

    def is_configured(self) -> bool:
        """Whether an S3 backend is configured.

        Returns:
            bool: True when the endpoint and credentials are all set.
        """
        return self._configured

    def upload_avatar(self, user_id: uuid.UUID, content: BinaryIO, content_type: str, size: int) -> str:
        """Upload an avatar image and return its public URL.

        The object key is randomly generated server-side (a client-supplied
        filename/path is never trusted) and scoped per-user under
        `avatars/{user_id}/`.

        Args:
            user_id: Owner the object is scoped to.
            content: Binary file-like object to upload.
            content_type: Image MIME type; must be in ALLOWED_CONTENT_TYPES.
            size: Content size in bytes; must not exceed MAX_AVATAR_BYTES.

        Returns:
            str: Public URL of the uploaded object (public base URL when
            configured, otherwise a bucket-prefixed path).

        Raises:
            StorageNotConfiguredError: If no S3 backend is configured.
            ValidationError: If the content type or size is unsupported.
            StorageUploadError: If the upload itself fails.
        """
        logger.info(f"Starting avatar upload | user_id={user_id} size={size} content_type={content_type}")
        if not self._configured or self._client is None:
            logger.warning(f"Avatar upload skipped for user {user_id}: storage not configured")
            raise StorageNotConfiguredError()
        if content_type not in ALLOWED_CONTENT_TYPES:
            logger.warning(f"Avatar upload rejected: unsupported image type | user_id={user_id} content_type={content_type}")
            raise ValidationError(
                message="Unsupported image type. Use JPEG, PNG, WebP, or GIF.",
                fields={"file": "Unsupported image type"},
            )
        if size > MAX_AVATAR_BYTES:
            logger.warning(f"Avatar upload rejected: image too large | user_id={user_id} size={size}")
            raise ValidationError(
                message="Image is too large (max 2 MB).",
                fields={"file": "Image is too large (max 2 MB)"},
            )

        # Random server-generated key; never trust a client filename.
        extension = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif"}[content_type]
        key = f"avatars/{user_id}/{uuid.uuid4()}.{extension}"
        logger.debug(f"Uploading avatar object | user_id={user_id} key={key}")
        try:
            self._client.upload_fileobj(content, self._bucket, key, ExtraArgs={"ContentType": content_type})
        except (BotoCoreError, ClientError) as exc:
            logger.exception(f"Avatar upload failed for user {user_id}: {exc}")
            logger.error(
                "Check: 1) S3 credentials valid, 2) bucket exists and is writable, 3) network reachable"
            )
            raise StorageUploadError() from exc

        logger.info(f"Avatar uploaded for user {user_id} | key={key}")
        if self._public_base_url:
            return f"{self._public_base_url.rstrip('/')}/{key}"
        return f"/{self._bucket}/{key}"

    def delete_user_avatars(self, user_id: uuid.UUID) -> int:
        """Delete every object under the user's `avatars/{user_id}/` prefix.

        Used by account deletion so no personal file lingers at a public
        URL. Best-effort by contract: returns 0 when storage is unconfigured
        or the call fails - callers treat this as non-fatal.

        Args:
            user_id: Owner whose avatar objects are removed.

        Returns:
            int: Number of objects deleted (0 when unconfigured or on
            failure).
        """
        logger.info(f"Starting avatar deletion | user_id={user_id}")
        if not self._configured or self._client is None:
            logger.debug(f"Avatar deletion skipped: storage not configured | user_id={user_id}")
            return 0
        logger.debug(f"Deleting avatar objects | user_id={user_id}")
        deleted = 0
        try:
            paginator = self._client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self._bucket, Prefix=f"avatars/{user_id}/"):
                keys = [{"Key": obj["Key"]} for obj in page.get("Contents", [])]
                if keys:
                    self._client.delete_objects(Bucket=self._bucket, Delete={"Objects": keys})
                    deleted += len(keys)
            logger.info(f"Avatars deleted for user {user_id} | deleted={deleted}")
        except (BotoCoreError, ClientError) as exc:
            logger.exception(f"Avatar deletion failed for user {user_id}: {exc}")
        return deleted

    async def upload_avatar_async(
        self, user_id: uuid.UUID, content: BinaryIO, content_type: str, size: int
    ) -> str:
        """Non-blocking `upload_avatar` (runs boto3 in a worker thread).

        Args:
            user_id: Owner the object is scoped to.
            content: Binary file-like object to upload.
            content_type: Image MIME type; must be in ALLOWED_CONTENT_TYPES.
            size: Content size in bytes; must not exceed MAX_AVATAR_BYTES.

        Returns:
            str: Public URL of the uploaded object.

        Raises:
            StorageNotConfiguredError: If no S3 backend is configured.
            ValidationError: If the content type or size is unsupported.
            StorageUploadError: If the upload itself fails.
        """
        return await asyncio.to_thread(self.upload_avatar, user_id, content, content_type, size)

    async def delete_user_avatars_async(self, user_id: uuid.UUID) -> int:
        """Non-blocking `delete_user_avatars` (runs boto3 in a worker thread).

        Args:
            user_id: Owner whose avatar objects are removed.

        Returns:
            int: Number of objects deleted (0 when unconfigured or on
            failure).
        """
        return await asyncio.to_thread(self.delete_user_avatars, user_id)

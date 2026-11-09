"""Kho S3 riêng tư; cache local phục vụ FileResponse sau khi API đã kiểm tra quyền."""

import importlib
from pathlib import Path
from typing import Any

from app.integrations.storage.local import LocalStorage, atomic_write


class S3Storage(LocalStorage):
    def __init__(
        self, root: str, bucket: str, endpoint_url: str = "", *, client: Any = None
    ) -> None:
        super().__init__(root)
        if not bucket:
            raise ValueError("S3 cần S3_BUCKET")
        self._bucket = bucket
        self._client = (
            client
            if client is not None
            else importlib.import_module("boto3").client("s3", endpoint_url=endpoint_url or None)
        )

    def put(self, key: str, data: bytes) -> None:
        # Kiểm tra khoá trước khi gọi dịch vụ bên ngoài.
        target = super().path(key)
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data)
        atomic_write(target, data)

    def path(self, key: str) -> Path:
        target = super().path(key)
        if not target.is_file():
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            body = response["Body"]
            try:
                data = body.read()
            finally:
                body.close()
            atomic_write(target, data)
        return target

    def exists(self, key: str) -> bool:
        if super().path(key).is_file():
            return True
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
        except Exception as exc:
            response = getattr(exc, "response", {})
            if response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
                return False
            raise  # Lỗi quyền/mạng không được xem như file không tồn tại.
        return True

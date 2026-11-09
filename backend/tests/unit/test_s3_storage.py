import io
from pathlib import Path
from typing import Any

import pytest

from app.integrations.storage.s3 import S3Storage


class MissingObject(Exception):
    response = {"ResponseMetadata": {"HTTPStatusCode": 404}}


class FakeS3:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.failure = False

    def put_object(self, **kwargs: Any) -> None:
        if self.failure:
            raise PermissionError("S3 denied")
        self.objects[kwargs["Key"]] = kwargs["Body"]

    def get_object(self, **kwargs: Any) -> dict[str, io.BytesIO]:
        return {"Body": io.BytesIO(self.objects[kwargs["Key"]])}

    def head_object(self, **kwargs: Any) -> None:
        if self.failure:
            raise PermissionError("S3 denied")
        if kwargs["Key"] not in self.objects:
            raise MissingObject()


def test_cloud_write_and_hydrate_another_cache(tmp_path: Path) -> None:
    client = FakeS3()
    worker = S3Storage(str(tmp_path / "worker"), "bucket", client=client)
    api = S3Storage(str(tmp_path / "api"), "bucket", client=client)
    worker.put("audio/test.mp3", b"audio")
    assert api.exists("audio/test.mp3")
    assert api.read("audio/test.mp3") == b"audio"
    assert api.path("audio/test.mp3").read_bytes() == b"audio"
    assert not api.exists("missing")


def test_cloud_failure_does_not_write_local_file(tmp_path: Path) -> None:
    client = FakeS3()
    client.failure = True
    storage = S3Storage(str(tmp_path), "bucket", client=client)
    with pytest.raises(PermissionError):
        storage.put("audio.mp3", b"audio")
    assert not (tmp_path / "audio.mp3").exists()
    with pytest.raises(PermissionError):
        storage.exists("audio.mp3")


def test_cloud_rejects_traversal_and_missing_bucket(tmp_path: Path) -> None:
    client = FakeS3()
    storage = S3Storage(str(tmp_path), "bucket", client=client)
    for operation in (storage.path, storage.exists, storage.read):
        with pytest.raises(ValueError):
            operation("../secret")
    with pytest.raises(ValueError):
        storage.put("../secret", b"data")
    assert not client.objects
    with pytest.raises(ValueError):
        S3Storage(str(tmp_path), "", client=client)

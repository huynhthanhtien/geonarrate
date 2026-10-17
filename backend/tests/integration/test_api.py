import pytest
from fastapi.testclient import TestClient

from app.main import app

pytestmark = pytest.mark.integration


def test_healthz_and_languages() -> None:
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        codes = [x["code"] for x in client.get("/api/v1/languages").json()]
        assert codes == ["en", "ja", "ko", "vi", "zh"]

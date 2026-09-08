from io import BytesIO
from types import SimpleNamespace

import pytest

from app.services import report_artifact_storage as storage


class FakeS3Client:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}
        self.put_requests: list[dict] = []
        self.deleted: list[tuple[str, str]] = []

    def put_object(self, **request):
        self.put_requests.append(request)
        self.objects[(request["Bucket"], request["Key"])] = request["Body"]

    def get_object(self, *, Bucket: str, Key: str):
        return {"Body": BytesIO(self.objects[(Bucket, Key)])}

    def delete_object(self, *, Bucket: str, Key: str):
        self.deleted.append((Bucket, Key))
        self.objects.pop((Bucket, Key), None)


def test_database_artifact_storage_remains_the_safe_default(monkeypatch):
    monkeypatch.setattr(storage.config, "REPORT_ARTIFACT_STORAGE", "database")
    result = storage.store_report_artifact(
        export_id="job-1",
        content=b"report-content",
        content_type="application/pdf",
        filename="report.pdf",
    )
    assert result.backend == "database"
    assert result.inline_content == b"report-content"
    assert result.container is None
    assert result.object_key is None


def test_s3_artifact_is_private_encrypted_and_checksum_verified(monkeypatch):
    client = FakeS3Client()
    monkeypatch.setattr(storage.config, "REPORT_ARTIFACT_STORAGE", "s3")
    monkeypatch.setattr(storage.config, "REPORT_ARTIFACT_S3_BUCKET", "reports")
    monkeypatch.setattr(storage.config, "REPORT_ARTIFACT_S3_PREFIX", "private/exports")
    monkeypatch.setattr(storage, "_s3_client", lambda: client)

    result = storage.store_report_artifact(
        export_id="job-2",
        content=b"xlsx-content",
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="claims.xlsx",
    )
    assert result.backend == "s3"
    assert result.inline_content is None
    assert result.container == "reports"
    assert result.object_key == "private/exports/job-2"
    assert client.put_requests[0]["ServerSideEncryption"] == "AES256"
    assert "ACL" not in client.put_requests[0]

    job = SimpleNamespace(
        artifact=None,
        artifact_storage="s3",
        artifact_container=result.container,
        artifact_key=result.object_key,
        checksum_sha256=client.put_requests[0]["Metadata"]["checksum-sha256"],
    )
    assert storage.report_artifact_exists(job)
    assert storage.read_report_artifact(job) == b"xlsx-content"
    storage.delete_report_artifact(job)
    assert client.deleted == [("reports", "private/exports/job-2")]

    second = storage.StoredReportArtifact(
        backend="s3",
        inline_content=None,
        container="reports",
        object_key="private/exports/orphan",
    )
    client.objects[("reports", "private/exports/orphan")] = b"orphan"
    storage.delete_stored_report_artifact(second)
    assert ("reports", "private/exports/orphan") in client.deleted


def test_s3_artifact_checksum_mismatch_is_rejected(monkeypatch):
    client = FakeS3Client()
    client.objects[("reports", "private/job-3")] = b"tampered"
    monkeypatch.setattr(storage.config, "REPORT_ARTIFACT_S3_BUCKET", "reports")
    monkeypatch.setattr(storage, "_s3_client", lambda: client)
    job = SimpleNamespace(
        artifact=None,
        artifact_storage="s3",
        artifact_container="reports",
        artifact_key="private/job-3",
        checksum_sha256="0" * 64,
    )
    with pytest.raises(RuntimeError, match="checksum"):
        storage.read_report_artifact(job)

from dataclasses import dataclass
from hashlib import sha256

from app import config
from app.models.report_export_job import ReportExportJob


@dataclass(frozen=True)
class StoredReportArtifact:
    backend: str
    inline_content: bytes | None
    container: str | None
    object_key: str | None


def _s3_client():
    try:
        import boto3
    except ImportError as error:  # pragma: no cover - deployment configuration
        raise RuntimeError(
            "boto3 is required when REPORT_ARTIFACT_STORAGE=s3"
        ) from error
    return boto3.client(
        "s3",
        endpoint_url=config.REPORT_ARTIFACT_S3_ENDPOINT_URL,
        region_name=config.REPORT_ARTIFACT_S3_REGION,
    )


def _s3_settings() -> tuple[str, str]:
    bucket = config.REPORT_ARTIFACT_S3_BUCKET
    if not bucket:
        raise RuntimeError(
            "REPORT_ARTIFACT_S3_BUCKET is required when report artifact storage is s3"
        )
    return bucket, config.REPORT_ARTIFACT_S3_PREFIX


def store_report_artifact(
    *,
    export_id: str,
    content: bytes,
    content_type: str,
    filename: str,
) -> StoredReportArtifact:
    if config.REPORT_ARTIFACT_STORAGE == "database":
        return StoredReportArtifact("database", content, None, None)

    bucket, prefix = _s3_settings()
    key = f"{prefix}/{export_id}" if prefix else export_id
    _s3_client().put_object(
        Bucket=bucket,
        Key=key,
        Body=content,
        ContentType=content_type,
        ContentDisposition=f'attachment; filename="{filename}"',
        ServerSideEncryption="AES256",
        Metadata={"checksum-sha256": sha256(content).hexdigest()},
    )
    return StoredReportArtifact("s3", None, bucket, key)


def report_artifact_exists(job: ReportExportJob) -> bool:
    return job.artifact is not None or (
        job.artifact_storage == "s3" and bool(job.artifact_key)
    )


def read_report_artifact(job: ReportExportJob) -> bytes:
    if job.artifact is not None:
        return bytes(job.artifact)
    if job.artifact_storage != "s3" or not job.artifact_key:
        raise RuntimeError("Report artifact is unavailable")
    bucket = job.artifact_container or _s3_settings()[0]
    response = _s3_client().get_object(Bucket=bucket, Key=job.artifact_key)
    content = response["Body"].read()
    if job.checksum_sha256 and sha256(content).hexdigest() != job.checksum_sha256:
        raise RuntimeError("Stored report artifact checksum does not match")
    return content


def delete_report_artifact(job: ReportExportJob) -> None:
    if job.artifact_storage != "s3" or not job.artifact_key:
        return
    bucket = job.artifact_container or _s3_settings()[0]
    _s3_client().delete_object(Bucket=bucket, Key=job.artifact_key)


def delete_stored_report_artifact(artifact: StoredReportArtifact) -> None:
    """Compensate an external upload when its database locator was not committed."""
    if artifact.backend != "s3" or not artifact.container or not artifact.object_key:
        return
    _s3_client().delete_object(
        Bucket=artifact.container,
        Key=artifact.object_key,
    )

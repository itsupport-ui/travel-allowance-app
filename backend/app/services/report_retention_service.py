from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.report_export_job import ReportExportJob
from app.models.report_snapshot import ReportSnapshot
from app.services.report_artifact_storage import delete_report_artifact


@dataclass(frozen=True)
class ReportRetentionResult:
    deleted_jobs: int
    deleted_snapshots: int
    cutoff: datetime


def cleanup_expired_report_artifacts(
    db: Session,
    *,
    cutoff: datetime | None = None,
    commit: bool = True,
) -> ReportRetentionResult:
    """Delete expired artifacts before their parent snapshots.

    Export audit records are intentionally retained because they contain no
    artifact bytes or report rows and provide the durable access history.
    """
    effective_cutoff = cutoff or datetime.now(timezone.utc)
    external_jobs = (
        db.query(ReportExportJob)
        .filter(
            ReportExportJob.expires_at <= effective_cutoff,
            ReportExportJob.artifact_storage == "s3",
            ReportExportJob.artifact_key.isnot(None),
        )
        .all()
    )
    for job in external_jobs:
        delete_report_artifact(job)
    deleted_jobs = (
        db.query(ReportExportJob)
        .filter(ReportExportJob.expires_at <= effective_cutoff)
        .delete(synchronize_session=False)
    )
    deleted_snapshots = (
        db.query(ReportSnapshot)
        .filter(ReportSnapshot.expires_at <= effective_cutoff)
        .delete(synchronize_session=False)
    )
    if commit:
        db.commit()
    return ReportRetentionResult(
        deleted_jobs=deleted_jobs,
        deleted_snapshots=deleted_snapshots,
        cutoff=effective_cutoff,
    )

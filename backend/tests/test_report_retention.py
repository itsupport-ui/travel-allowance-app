from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.report_export_audit import ReportExportAudit
from app.models.report_export_job import ReportExportJob
from app.models.report_snapshot import ReportSnapshot
from app.models.user import User
from app.services.report_retention_service import (
    cleanup_expired_report_artifacts,
)


def test_retention_deletes_expired_bytes_but_preserves_audit_history():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    cutoff = datetime.now(timezone.utc)
    user = User(
        username="Retention Admin",
        email="retention-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    db.add(user)
    db.flush()

    def add_snapshot(snapshot_id: str, expires_at: datetime) -> None:
        snapshot = ReportSnapshot(
            id=snapshot_id,
            requested_by=user.id,
            report_type="consolidated_claims",
            scope="organization",
            filters={},
            rows=[["row"]],
            row_count=1,
            total_amount=1,
            summary={},
            snapshot_at=cutoff - timedelta(hours=1),
            expires_at=expires_at,
        )
        db.add(snapshot)
        db.flush()
        db.add(
            ReportExportJob(
                id=f"job-{snapshot_id}",
                snapshot_id=snapshot_id,
                requested_by=user.id,
                report_type=snapshot.report_type,
                scope=snapshot.scope,
                format="csv",
                status="completed",
                idempotency_key=f"key-{snapshot_id}",
                filename="report.csv",
                mime_type="text/csv",
                size_bytes=8,
                checksum_sha256="a" * 64,
                row_count=1,
                total_amount=1,
                summary={},
                artifact=b"artifact",
                completed_at=cutoff - timedelta(hours=1),
                expires_at=expires_at,
            )
        )

    expired_id = "00000000-0000-0000-0000-000000000001"
    active_id = "00000000-0000-0000-0000-000000000002"
    add_snapshot(expired_id, cutoff - timedelta(seconds=1))
    add_snapshot(active_id, cutoff + timedelta(hours=1))
    db.add(
        ReportExportAudit(
            id="00000000-0000-0000-0000-000000000003",
            snapshot_id=expired_id,
            requested_by=user.id,
            report_type="consolidated_claims",
            scope="organization",
            format="csv",
            filters={},
            row_count=1,
            total_amount=1,
            summary={},
            snapshot_at=cutoff - timedelta(hours=2),
            snapshot_expires_at=cutoff - timedelta(seconds=1),
            filename="report.csv",
            mime_type="text/csv",
            size_bytes=8,
            checksum_sha256="a" * 64,
            download_count=1,
            first_generated_at=cutoff - timedelta(hours=1),
            last_downloaded_at=cutoff - timedelta(hours=1),
        )
    )
    db.commit()

    try:
        result = cleanup_expired_report_artifacts(db, cutoff=cutoff)
        assert result.deleted_jobs == 1
        assert result.deleted_snapshots == 1
        assert db.get(ReportSnapshot, expired_id) is None
        assert db.get(ReportExportJob, f"job-{expired_id}") is None
        assert db.get(ReportSnapshot, active_id) is not None
        assert db.get(ReportExportJob, f"job-{active_id}") is not None
        assert db.query(ReportExportAudit).count() == 1

        repeated = cleanup_expired_report_artifacts(db, cutoff=cutoff)
        assert repeated.deleted_jobs == 0
        assert repeated.deleted_snapshots == 0
    finally:
        db.close()
        engine.dispose()

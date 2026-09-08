from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.report_export_job import ReportExportJob
from app.models.report_snapshot import ReportSnapshot
from app.models.user import User
from app.routers.reports import router
from app.utils.auth import get_current_user


def test_report_operations_health_is_admin_only_and_flags_actionable_backlog():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    admin = User(
        username="Admin",
        email="report-health-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Therapist",
        email="report-health-therapist@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    db.add_all([admin, therapist])
    db.flush()
    now = datetime.now(timezone.utc)

    def add_job(identifier: str, status: str, expires_at: datetime, **values):
        snapshot_id = f"00000000-0000-0000-0000-{identifier:0>12}"
        db.add(
            ReportSnapshot(
                id=snapshot_id,
                requested_by=admin.id,
                report_type="consolidated_claims",
                scope="organization",
                filters={},
                rows=[],
                row_count=0,
                total_amount=0,
                summary={},
                snapshot_at=now,
                expires_at=expires_at,
            )
        )
        db.flush()
        db.add(
            ReportExportJob(
                id=f"job-{identifier}",
                snapshot_id=snapshot_id,
                requested_by=admin.id,
                report_type="consolidated_claims",
                scope="organization",
                format="csv",
                status=status,
                idempotency_key=f"health-key-{identifier}",
                row_count=0,
                total_amount=0,
                summary={},
                expires_at=expires_at,
                **values,
            )
        )

    add_job("1", "queued", now + timedelta(hours=1))
    add_job(
        "2",
        "processing",
        now + timedelta(hours=1),
        started_at=now - timedelta(minutes=15),
    )
    add_job(
        "3",
        "failed",
        now + timedelta(hours=1),
        completed_at=now - timedelta(hours=1),
    )
    add_job("4", "completed", now - timedelta(minutes=1))
    db.commit()

    current_user = admin
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    client = TestClient(app)
    try:
        response = client.get("/reports/operations/health")
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "degraded"
        assert data["storage_backend"] == "database"
        assert data["external_storage_configured"] is True
        assert data["queued_jobs"] == 1
        assert data["processing_jobs"] == 1
        assert data["stale_processing_jobs"] == 1
        assert data["failed_jobs_last_24h"] == 1
        assert data["expired_artifacts_pending_cleanup"] == 1
        assert data["oldest_pending_seconds"] >= 0

        current_user = therapist
        forbidden = client.get("/reports/operations/health")
        assert forbidden.status_code == 403
    finally:
        db.close()
        engine.dispose()

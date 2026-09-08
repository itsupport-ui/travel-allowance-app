from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.domain_audit_event import DomainAuditEvent
from app.models.report_export_audit import ReportExportAudit
from app.models.report_export_event import ReportExportEvent
from app.models.report_export_job import ReportExportJob
from app.models.report_snapshot import ReportSnapshot
from app.models.therapist_workday import TherapistWorkDay
from app.models.travel import TravelEntry
from app.models.treatment_plan import TreatmentPlan
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers import reports
from app.routers.reports import (
    _job_response,
    _process_queued_export_job_in_session,
)
from app.services.expense_report_service import EXPENSE_REPORT_SPEC
from app.utils.auth import get_current_user
from app.utils.timezone import india_now


def test_incomplete_export_jobs_never_expose_a_download_url():
    from types import SimpleNamespace

    now = datetime.now(timezone.utc)
    base = {
        "id": "queued-job",
        "snapshot_id": "snapshot-id",
        "report_type": "my_claims",
        "scope": "self",
        "format": "csv",
        "filename": None,
        "mime_type": None,
        "size_bytes": None,
        "checksum_sha256": None,
        "row_count": 1001,
        "total_amount": 0,
        "summary": {},
        "created_at": now,
        "completed_at": None,
        "attempt_count": 0,
        "error_code": None,
        "expires_at": now + timedelta(hours=1),
    }
    queued = _job_response(SimpleNamespace(status="queued", **base))
    assert queued.status == "queued"
    assert queued.download_url is None
    completed = _job_response(SimpleNamespace(status="completed", **base))
    assert completed.download_url == "/reports/exports/queued-job/download"


def test_report_catalog_preview_and_self_export_are_role_scoped():
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
        email="report-center-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    other_admin = User(
        username="Admin Two",
        email="report-center-admin-two@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Therapist One",
        email="report-center-therapist@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    other_therapist = User(
        username="Therapist Two",
        email="report-center-other@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    doctor_user = User(
        username="Doctor User",
        email="report-center-doctor@example.com",
        password_hash="unused",
        role="doctor",
        is_active=True,
    )
    db.add_all(
        [admin, other_admin, therapist, other_therapist, doctor_user]
    )
    db.flush()
    doctor = Doctor(
        user_id=doctor_user.id,
        name="Doctor One",
        specialization="General",
        phone="9999999999",
    )
    db.add(doctor)
    db.flush()
    today = india_now().date()
    db.add_all(
        [
            Claim(
                therapist_id=therapist.id,
                claim_date=today,
                total_km=5,
                travel_total=40,
                daily_allowance=150,
                grand_total=190,
                per_km_rate=8,
                status="pending",
            ),
            Claim(
                therapist_id=other_therapist.id,
                claim_date=today,
                total_km=2,
                travel_total=16,
                daily_allowance=150,
                grand_total=166,
                per_km_rate=8,
                status="approved",
            ),
            DoctorClaim(
                doctor_id=doctor.id,
                claim_date=today,
                total_amount=250,
                expense_count=2,
                status="approved",
                submitted_at=datetime.now(timezone.utc),
            ),
        ]
    )
    db.commit()

    current_user = therapist
    app = FastAPI()
    app.include_router(reports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    client = TestClient(app)

    try:
        catalog = client.get("/reports/catalog")
        assert catalog.status_code == 200
        assert catalog.json()[0]["report_type"] == "my_claims"
        assert catalog.json()[0]["formats"] == ["pdf", "xlsx", "csv"]

        preview = client.post(
            "/reports/preview",
            json={
                "report_type": "my_claims",
                "role": "all",
                "therapist_id": other_therapist.id,
            },
        )
        assert preview.status_code == 200, preview.text
        preview_data = preview.json()
        assert preview_data["scope"] == "self"
        assert preview_data["row_count"] == 1
        assert preview_data["total_amount"] == 190
        assert preview_data["applied_filters"]["therapist_id"] == therapist.id
        assert preview_data["snapshot_id"]
        assert preview_data["expires_at"] > preview_data["snapshot_at"]

        original_threshold = reports.REPORT_ASYNC_ROW_THRESHOLD
        original_worker = reports._process_queued_export_job
        reports.REPORT_ASYNC_ROW_THRESHOLD = 0
        reports._process_queued_export_job = lambda _export_id: None
        try:
            queued_response = client.post(
                "/reports/exports",
                json={
                    "snapshot_id": preview_data["snapshot_id"],
                    "format": "csv",
                    "idempotency_key": "queued-worker-test-key",
                },
            )
        finally:
            reports.REPORT_ASYNC_ROW_THRESHOLD = original_threshold
            reports._process_queued_export_job = original_worker
        assert queued_response.status_code == 200, queued_response.text
        assert queued_response.json()["status"] == "queued"
        assert queued_response.json()["download_url"] is None
        queued_job = db.get(ReportExportJob, queued_response.json()["id"])
        _process_queued_export_job_in_session(db, queued_job.id)
        db.refresh(queued_job)
        assert queued_job.status == "completed"
        assert queued_job.attempt_count == 1
        assert queued_job.artifact.startswith(b"\xef\xbb\xbf")
        _process_queued_export_job_in_session(db, queued_job.id)
        db.refresh(queued_job)
        assert queued_job.attempt_count == 1
        db.delete(queued_job)
        db.commit()

        created_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": preview_data["snapshot_id"],
                "format": "csv",
                "idempotency_key": "therapist-preview-csv",
            },
        )
        assert created_job.status_code == 200, created_job.text
        created_job_data = created_job.json()
        assert created_job_data["status"] == "completed"
        assert created_job_data["row_count"] == 1
        assert created_job_data["total_amount"] == 190
        assert created_job_data["download_url"] == (
            f"/reports/exports/{created_job_data['id']}/download"
        )
        repeated_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": preview_data["snapshot_id"],
                "format": "csv",
                "idempotency_key": "therapist-preview-csv",
            },
        )
        assert repeated_job.status_code == 200
        assert repeated_job.json()["id"] == created_job_data["id"]
        assert db.query(ReportExportJob).count() == 1
        conflicting_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": preview_data["snapshot_id"],
                "format": "pdf",
                "idempotency_key": "therapist-preview-csv",
            },
        )
        assert conflicting_job.status_code == 409
        lifecycle = client.get("/reports/exports/events")
        assert lifecycle.status_code == 200
        assert {
            item["event_type"] for item in lifecycle.json()
        } == {
            "generation_completed",
            "generation_queued",
            "generation_reused",
            "generation_failed",
        }
        failed_event = next(
            item
            for item in lifecycle.json()
            if item["event_type"] == "generation_failed"
        )
        assert failed_event["error_code"] == "idempotency_conflict"
        assert failed_event["details"] == {}
        assert {
            event.action
            for event in db.query(DomainAuditEvent)
            .filter(DomainAuditEvent.domain == "reporting")
            .all()
        } == {
            "generation_completed",
            "generation_queued",
            "generation_reused",
            "generation_failed",
        }
        job_status = client.get(
            f"/reports/exports/{created_job_data['id']}"
        )
        assert job_status.status_code == 200
        first_job_download = client.get(created_job_data["download_url"])
        assert first_job_download.status_code == 200
        assert first_job_download.headers["X-Report-Job-Id"] == (
            created_job_data["id"]
        )
        assert first_job_download.headers["Cache-Control"] == (
            "private, no-store"
        )
        assert first_job_download.headers["X-Content-Type-Options"] == (
            "nosniff"
        )
        retained_csv = first_job_download.content.decode("utf-8-sig")
        assert ",pending," in retained_csv
        assert ",190.0," in retained_csv

        therapist_claim = (
            db.query(Claim)
            .filter(Claim.therapist_id == therapist.id)
            .one()
        )
        therapist_claim.status = "approved"
        therapist_claim.grand_total = 999
        db.commit()

        retained_after_mutation = client.get(created_job_data["download_url"])
        assert retained_after_mutation.status_code == 200
        assert retained_after_mutation.content == first_job_download.content

        exported = client.get(
            "/reports/my-claims/export",
            params={
                "format": "csv",
                "snapshot_id": preview_data["snapshot_id"],
            },
        )
        assert exported.status_code == 200, exported.text
        assert exported.headers["X-Report-Scope"] == "self"
        assert (
            exported.headers["X-Report-Snapshot-Id"]
            == preview_data["snapshot_id"]
        )
        assert exported.headers["X-Report-Row-Count"] == "1"
        assert "my-claims-therapist" in exported.headers["Content-Disposition"]
        snapshot_csv = exported.content.decode("utf-8-sig")
        assert "Therapist One" in snapshot_csv
        assert "Therapist Two" not in snapshot_csv
        assert ",pending," in snapshot_csv
        assert ",190.0," in snapshot_csv

        repeated_export = client.get(
            "/reports/my-claims/export",
            params={
                "format": "csv",
                "snapshot_id": preview_data["snapshot_id"],
            },
        )
        assert repeated_export.status_code == 200
        audit_record = db.query(ReportExportAudit).one()
        assert audit_record.download_count == 4
        assert audit_record.row_count == 1
        assert float(audit_record.total_amount) == 190
        assert audit_record.size_bytes == len(exported.content)
        assert len(audit_record.checksum_sha256) == 64
        history = client.get("/reports/exports/history")
        assert history.status_code == 200
        assert history.json()[0]["snapshot_id"] == preview_data["snapshot_id"]
        assert history.json()[0]["download_count"] == 4
        assert history.json()[0]["requester_name"] == "Therapist One"
        assert client.get(
            "/reports/exports/history?scope=organization"
        ).status_code == 403

        live_export = client.get("/reports/my-claims/export?format=csv")
        live_csv = live_export.content.decode("utf-8-sig")
        assert ",approved," in live_csv
        assert ",999.0," in live_csv

        current_user = other_therapist
        assert client.get(
            f"/reports/exports/{created_job_data['id']}"
        ).status_code == 404
        assert client.get(created_job_data["download_url"]).status_code == 404
        unauthorized_snapshot = client.get(
            "/reports/my-claims/export",
            params={
                "format": "csv",
                "snapshot_id": preview_data["snapshot_id"],
            },
        )
        assert unauthorized_snapshot.status_code == 404

        current_user = therapist
        therapist.role = "admin"
        db.commit()
        assert client.get(
            f"/reports/exports/{created_job_data['id']}"
        ).status_code == 404
        therapist.role = "therapist"
        db.commit()

        snapshot = db.get(ReportSnapshot, preview_data["snapshot_id"])
        expired_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        snapshot.expires_at = expired_at
        db.get(ReportExportJob, created_job_data["id"]).expires_at = expired_at
        therapist_claim.status = "pending"
        therapist_claim.grand_total = 190
        db.commit()
        expired_job_status = client.get(
            f"/reports/exports/{created_job_data['id']}"
        )
        assert expired_job_status.status_code == 200
        assert expired_job_status.json()["status"] == "expired"
        assert expired_job_status.json()["download_url"] is None
        assert client.get(created_job_data["download_url"]).status_code == 410
        assert (
            db.query(ReportExportEvent)
            .filter(
                ReportExportEvent.event_type == "download_failed",
                ReportExportEvent.error_code == "artifact_expired",
            )
            .count()
            == 1
        )
        expired_snapshot = client.get(
            "/reports/my-claims/export",
            params={
                "format": "csv",
                "snapshot_id": preview_data["snapshot_id"],
            },
        )
        assert expired_snapshot.status_code == 410
        refreshed_preview = client.post(
            "/reports/preview",
            json={"report_type": "my_claims"},
        )
        assert refreshed_preview.status_code == 200
        assert (
            db.query(ReportSnapshot)
            .filter(ReportSnapshot.id == preview_data["snapshot_id"])
            .count()
            == 0
        )
        assert db.query(ReportExportJob).count() == 0

        current_user = doctor_user
        doctor_preview = client.post(
            "/reports/preview",
            json={"report_type": "my_claims"},
        )
        assert doctor_preview.status_code == 200, doctor_preview.text
        assert doctor_preview.json()["row_count"] == 1
        assert doctor_preview.json()["total_amount"] == 250
        assert doctor_preview.json()["applied_filters"]["doctor_id"] == doctor.id

        current_user = admin
        admin_catalog = client.get("/reports/catalog")
        assert admin_catalog.json()[0]["report_type"] == "consolidated_claims"
        consolidated = client.post(
            "/reports/preview",
            json={"report_type": "consolidated_claims"},
        )
        assert consolidated.status_code == 200, consolidated.text
        consolidated_data = consolidated.json()
        assert consolidated_data["row_count"] == 3
        assert consolidated_data["total_amount"] == 606
        organization_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": consolidated_data["snapshot_id"],
                "format": "xlsx",
                "idempotency_key": "admin-consolidated-xlsx",
            },
        )
        assert organization_job.status_code == 200, organization_job.text
        organization_job_data = organization_job.json()
        organization_export = client.get(
            f"/reports/exports/{consolidated_data['snapshot_id']}/download",
            params={"format": "xlsx"},
        )
        assert organization_export.status_code == 200
        assert organization_export.headers["X-Report-Scope"] == "organization"
        assert organization_export.headers["X-Report-Row-Count"] == "3"
        assert organization_export.headers["X-Report-Snapshot-Id"] == (
            consolidated_data["snapshot_id"]
        )
        organization_history = client.get(
            "/reports/exports/history?scope=organization"
        )
        assert organization_history.status_code == 200
        assert organization_history.json()[0]["scope"] == "organization"
        assert organization_history.json()[0]["format"] == "xlsx"
        assert organization_history.json()[0]["row_count"] == 3

        current_user = other_admin
        peer_job_status = client.get(
            f"/reports/exports/{organization_job_data['id']}"
        )
        assert peer_job_status.status_code == 200
        peer_job_download = client.get(
            organization_job_data["download_url"]
        )
        assert peer_job_download.status_code == 200
        assert peer_job_download.content
        peer_admin_download = client.get(
            f"/reports/exports/{consolidated_data['snapshot_id']}/download",
            params={"format": "xlsx"},
        )
        assert peer_admin_download.status_code == 200
        peer_history = client.get(
            "/reports/exports/history?scope=organization"
        )
        assert peer_history.status_code == 200
        assert {item["requester_name"] for item in peer_history.json()} == {
            "Admin",
            "Admin Two",
        }
        peer_events = client.get(
            "/reports/exports/events?scope=organization"
        )
        assert peer_events.status_code == 200
        assert any(
            item["event_type"] == "generation_completed"
            and item["scope"] == "organization"
            for item in peer_events.json()
        )

        current_user = admin
        assert client.get("/reports/my-claims/export").status_code == 403
    finally:
        db.close()
        engine.dispose()


def test_attendance_reports_are_cross_role_private_and_format_consistent():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    admin = User(
        username="Attendance Admin",
        email="attendance-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Attendance Therapist",
        email="attendance-therapist@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    other_therapist = User(
        username="Other Attendance Therapist",
        email="attendance-other@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    doctor_user = User(
        username="Attendance Doctor User",
        email="attendance-doctor@example.com",
        password_hash="unused",
        role="doctor",
        is_active=True,
    )
    db.add_all([admin, therapist, other_therapist, doctor_user])
    db.flush()
    doctor = Doctor(
        user_id=doctor_user.id,
        name="Attendance Doctor",
        specialization="General",
        phone="9888888888",
    )
    db.add(doctor)
    db.flush()
    today = india_now().date()
    started_at = datetime.now(timezone.utc) - timedelta(hours=8)
    ended_at = datetime.now(timezone.utc)
    db.add_all(
        [
            TherapistWorkDay(
                therapist_id=therapist.id,
                work_date=today,
                start_address="Private therapist home address",
                started_at=started_at,
                ended_at=ended_at,
                is_active=False,
                ended_early=True,
                end_reason="Approved personal emergency",
                total_work_minutes=420,
                completed_schedules_count=4,
                pending_schedules_count=1,
                missed_schedules_count=0,
            ),
            TherapistWorkDay(
                therapist_id=other_therapist.id,
                work_date=today,
                start_address="Another private address",
                started_at=started_at,
                is_active=True,
                ended_early=False,
            ),
            DoctorWorkDay(
                doctor_id=doctor.id,
                work_date=today,
                start_address="Private doctor home address",
                start_latitude=12.9,
                start_longitude=77.6,
                started_at=started_at,
                ended_at=ended_at,
                is_active=False,
                ended_early=False,
                total_work_minutes=480,
                total_visits_count=3,
                completed_visits_count=3,
                pending_visits_count=0,
                total_distance_km=14.25,
            ),
        ]
    )
    db.commit()

    current_user = therapist
    app = FastAPI()
    app.include_router(reports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    client = TestClient(app)

    try:
        catalog_types = {
            item["report_type"] for item in client.get("/reports/catalog").json()
        }
        assert catalog_types == {
            "my_claims",
            "my_attendance",
            "my_expenses",
            "my_clinical_activity",
            "my_performance",
        }
        self_preview = client.post(
            "/reports/preview",
            json={
                "report_type": "my_attendance",
                "role": "doctor",
                "doctor_id": doctor.id,
            },
        )
        assert self_preview.status_code == 200, self_preview.text
        self_data = self_preview.json()
        assert self_data["scope"] == "self"
        assert self_data["row_count"] == 1
        assert self_data["total_amount"] == 0
        assert self_data["summary"]["early_end_days"] == 1
        assert self_data["summary"]["total_work_minutes"] == 420
        assert self_data["applied_filters"]["role"] == "therapist"
        assert client.post(
            "/reports/preview",
            json={"report_type": "my_attendance", "status": "pending"},
        ).status_code == 422

        self_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": self_data["snapshot_id"],
                "format": "csv",
                "idempotency_key": "self-attendance-csv",
            },
        )
        assert self_job.status_code == 200, self_job.text
        assert self_job.json()["summary"]["completed_activities"] == 4
        self_csv = client.get(self_job.json()["download_url"])
        assert self_csv.status_code == 200
        self_text = self_csv.content.decode("utf-8-sig")
        assert "Attendance Therapist" in self_text
        assert "Attendance Doctor" not in self_text
        assert "Private therapist home address" not in self_text

        current_user = doctor_user
        doctor_preview = client.post(
            "/reports/preview",
            json={"report_type": "my_attendance"},
        )
        assert doctor_preview.status_code == 200
        assert doctor_preview.json()["row_count"] == 1
        assert doctor_preview.json()["summary"]["total_distance_km"] == 14.25

        current_user = admin
        admin_catalog_types = {
            item["report_type"] for item in client.get("/reports/catalog").json()
        }
        assert admin_catalog_types == {
            "consolidated_claims",
            "organization_attendance",
            "organization_expenses",
            "organization_clinical_activity",
            "organization_exceptions",
            "organization_performance",
        }
        organization_preview = client.post(
            "/reports/preview",
            json={"report_type": "organization_attendance"},
        )
        assert organization_preview.status_code == 200
        organization_data = organization_preview.json()
        assert organization_data["row_count"] == 3
        assert organization_data["status_counts"] == {
            "active": 1,
            "completed": 1,
            "ended_early": 1,
        }
        assert organization_data["summary"]["completed_activities"] == 7

        for export_format, signature in (
            ("csv", b"\xef\xbb\xbf"),
            ("xlsx", b"PK"),
            ("pdf", b"%PDF"),
        ):
            job = client.post(
                "/reports/exports",
                json={
                    "snapshot_id": organization_data["snapshot_id"],
                    "format": export_format,
                    "idempotency_key": f"organization-attendance-{export_format}",
                },
            )
            assert job.status_code == 200, job.text
            artifact = client.get(job.json()["download_url"])
            assert artifact.status_code == 200
            assert artifact.content.startswith(signature)
            assert "attendance-register" in artifact.headers[
                "Content-Disposition"
            ]

        doctor_only = client.post(
            "/reports/preview",
            json={
                "report_type": "organization_attendance",
                "role": "doctor",
                "status": "completed",
            },
        )
        assert doctor_only.status_code == 200
        assert doctor_only.json()["row_count"] == 1
        assert doctor_only.json()["summary"]["total_distance_km"] == 14.25

        history = client.get("/reports/exports/history?scope=organization")
        assert history.status_code == 200
        assert len(history.json()) == 3
        assert all(
            item["report_type"] == "organization_attendance"
            for item in history.json()
        )
        assert history.json()[0]["summary"]["early_end_days"] == 1

        current_user = other_therapist
        assert client.get(
            f"/reports/exports/{job.json()['id']}"
        ).status_code == 404
        assert client.post(
            "/reports/preview",
            json={"report_type": "organization_attendance"},
        ).status_code == 403
    finally:
        db.close()
        engine.dispose()


def test_travel_expense_reports_reconcile_both_professions_without_locations():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    admin = User(
        username="Expense Admin",
        email="expense-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Expense Therapist",
        email="expense-therapist@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    other_therapist = User(
        username="=Formula Therapist",
        email="expense-other@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    doctor_user = User(
        username="Expense Doctor User",
        email="expense-doctor@example.com",
        password_hash="unused",
        role="doctor",
        is_active=True,
    )
    db.add_all([admin, therapist, other_therapist, doctor_user])
    db.flush()
    doctor = Doctor(
        user_id=doctor_user.id,
        name="Expense Doctor",
        specialization="General",
        phone="9777777777",
    )
    db.add(doctor)
    db.flush()
    today = india_now().date()
    created_at = datetime.now(timezone.utc)
    other_claim = Claim(
        therapist_id=other_therapist.id,
        claim_date=today,
        total_km=5,
        travel_total=40,
        daily_allowance=0,
        grand_total=40,
        per_km_rate=8,
        status="approved",
    )
    doctor_claim = DoctorClaim(
        doctor_id=doctor.id,
        claim_date=today,
        total_amount=250,
        expense_count=1,
        status="pending",
        submitted_at=created_at,
    )
    db.add_all([other_claim, doctor_claim])
    db.flush()
    db.add_all(
        [
            TravelEntry(
                therapist_id=therapist.id,
                travel_date=created_at,
                from_address="Private therapist origin",
                to_address="Private patient destination",
                total_km=10,
                per_km_rate=8,
                travel_fare=80,
                patient_visited=True,
                patient_name="Private Patient",
                transport_mode="Vehicle",
                status="draft",
                invoice_file="secret-invoice.pdf",
                created_at=created_at,
            ),
            TravelEntry(
                therapist_id=other_therapist.id,
                travel_date=created_at,
                from_address="Other private origin",
                to_address="Other private destination",
                total_km=5,
                per_km_rate=8,
                travel_fare=40,
                claim_id=other_claim.id,
                patient_visited=False,
                transport_mode="Vehicle",
                status="submitted",
                created_at=created_at,
            ),
            DoctorExpense(
                doctor_id=doctor.id,
                expense_date=today,
                from_location="Private doctor origin",
                to_location="Private clinic destination",
                distance_km=12.5,
                transport_mode="Car",
                fare=250,
                approved_amount=225,
                claim_id=doctor_claim.id,
                proof_file="secret-proof.pdf",
                remarks="Confidential remark",
                expense_category="authorized_other",
                manual_review_status="approved",
                status="submitted",
                created_at=created_at,
            ),
        ]
    )
    db.commit()

    current_user = therapist
    app = FastAPI()
    app.include_router(reports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    client = TestClient(app)

    try:
        assert {
            item["report_type"] for item in client.get("/reports/catalog").json()
        } == {
            "my_claims",
            "my_attendance",
            "my_expenses",
            "my_clinical_activity",
            "my_performance",
        }
        own_preview = client.post(
            "/reports/preview",
            json={
                "report_type": "my_expenses",
                "role": "doctor",
                "status": "draft",
            },
        )
        assert own_preview.status_code == 200, own_preview.text
        own_data = own_preview.json()
        assert own_data["row_count"] == 1
        assert own_data["total_amount"] == 80
        assert own_data["summary"]["total_distance_km"] == 10
        assert own_data["summary"]["proof_attached_entries"] == 1
        assert own_data["applied_filters"]["role"] == "therapist"
        assert client.post(
            "/reports/preview",
            json={"report_type": "my_expenses", "status": "approved"},
        ).status_code == 422

        own_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": own_data["snapshot_id"],
                "format": "csv",
                "idempotency_key": "self-expenses-csv",
            },
        )
        own_csv = client.get(own_job.json()["download_url"])
        own_text = own_csv.content.decode("utf-8-sig")
        assert "Expense Therapist" in own_text
        assert "Expense Doctor" not in own_text
        for private_value in (
            "Private therapist origin",
            "Private patient destination",
            "Private Patient",
            "secret-invoice.pdf",
        ):
            assert private_value not in own_text

        own_performance = client.post(
            "/reports/preview",
            json={"report_type": "my_performance"},
        )
        assert own_performance.status_code == 200, own_performance.text
        assert own_performance.json()["row_count"] == 1
        assert own_performance.json()["summary"]["staff_count"] == 1
        assert own_performance.json()["summary"]["total_reimbursable_amount"] == 80
        assert client.post(
            "/reports/preview",
            json={"report_type": "my_performance", "status": "completed"},
        ).status_code == 422

        current_user = doctor_user
        doctor_preview = client.post(
            "/reports/preview",
            json={"report_type": "my_expenses", "status": "submitted"},
        )
        assert doctor_preview.status_code == 200
        assert doctor_preview.json()["row_count"] == 1
        assert doctor_preview.json()["total_amount"] == 225
        assert doctor_preview.json()["summary"]["total_distance_km"] == 12.5

        current_user = admin
        assert {
            item["report_type"] for item in client.get("/reports/catalog").json()
        } == {
            "consolidated_claims",
            "organization_attendance",
            "organization_expenses",
            "organization_clinical_activity",
            "organization_exceptions",
            "organization_performance",
        }
        performance_preview = client.post(
            "/reports/preview",
            json={"report_type": "organization_performance"},
        )
        assert performance_preview.status_code == 200, performance_preview.text
        performance_data = performance_preview.json()
        assert performance_data["row_count"] == 3
        assert performance_data["status_counts"] == {}
        assert performance_data["summary"]["therapist_count"] == 2
        assert performance_data["summary"]["doctor_count"] == 1
        assert performance_data["summary"]["total_reimbursable_amount"] == 345
        assert performance_data["summary"]["total_claim_amount"] == 290
        performance_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": performance_data["snapshot_id"],
                "format": "xlsx",
                "idempotency_key": "organization-performance-xlsx",
            },
        )
        performance_artifact = client.get(performance_job.json()["download_url"])
        assert performance_artifact.content.startswith(b"PK")
        assert b"Private patient destination" not in performance_artifact.content
        organization_preview = client.post(
            "/reports/preview",
            json={"report_type": "organization_expenses"},
        )
        assert organization_preview.status_code == 200
        organization_data = organization_preview.json()
        assert organization_data["row_count"] == 3
        assert organization_data["total_amount"] == 345
        assert organization_data["status_counts"] == {
            "draft": 1,
            "submitted": 2,
        }
        assert organization_data["summary"]["proof_attached_entries"] == 2
        assert organization_data["summary"]["approved_claim_entries"] == 1
        assert organization_data["summary"]["pending_claim_entries"] == 1
        assert organization_data["summary"]["unclaimed_entries"] == 1

        organization_job = client.post(
            "/reports/exports",
            json={
                "snapshot_id": organization_data["snapshot_id"],
                "format": "csv",
                "idempotency_key": "organization-expenses-csv",
            },
        )
        assert organization_job.status_code == 200
        artifact = client.get(organization_job.json()["download_url"])
        artifact_text = artifact.content.decode("utf-8-sig")
        assert EXPENSE_REPORT_SPEC.currency_columns == (9, 10)
        assert (
            "Expense category,Exception review status,Proof attached"
            in artifact_text
        )
        assert "Authorized Other,approved,Yes" in artifact_text
        assert ",225.0,250.0," in artifact_text
        assert "Travel and expense" not in artifact_text
        assert "'=Formula Therapist" in artifact_text
        for private_value in (
            "Private doctor origin",
            "Private clinic destination",
            "secret-proof.pdf",
            "Confidential remark",
        ):
            assert private_value not in artifact_text

        doctor_only = client.post(
            "/reports/preview",
            json={
                "report_type": "organization_expenses",
                "role": "doctor",
                "status": "submitted",
            },
        )
        assert doctor_only.status_code == 200
        assert doctor_only.json()["row_count"] == 1
        assert doctor_only.json()["total_amount"] == 225

        current_user = other_therapist
        assert client.get(
            f"/reports/exports/{organization_job.json()['id']}"
        ).status_code == 404
    finally:
        db.close()
        engine.dispose()


def test_clinical_activity_reports_are_cross_role_and_privacy_safe():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    admin = User(
        username="Clinical Admin",
        email="clinical-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Clinical Therapist",
        email="clinical-therapist@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    other_therapist = User(
        username="Other Clinical Therapist",
        email="clinical-other@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    doctor_user = User(
        username="Clinical Doctor User",
        email="clinical-doctor@example.com",
        password_hash="unused",
        role="doctor",
        is_active=True,
    )
    db.add_all([admin, therapist, other_therapist, doctor_user])
    db.flush()
    doctor = Doctor(
        user_id=doctor_user.id,
        name="=Clinical Doctor",
        specialization="General",
        phone="9666666666",
    )
    db.add(doctor)
    db.flush()
    today = india_now().date()
    created_at = datetime.now(timezone.utc)
    consultation = DoctorConsultation(
        patient_name="Private Consultation Patient",
        patient_phone="9000000000",
        patient_address="Private consultation address",
        doctor_id=doctor.id,
        scheduled_date=today,
        scheduled_time=created_at.time().replace(tzinfo=None),
        purpose="Private purpose",
        notes="Private consultation notes",
        patient_decision="confirmed",
        status="completed",
        created_by=admin.id,
        completed_at=created_at,
    )
    db.add(consultation)
    db.flush()
    visit = DoctorVisit(
        patient_name="Private Visit Patient",
        patient_phone="9111111111",
        patient_address="Private visit address",
        doctor_id=doctor.id,
        visit_date=today,
        visit_time=created_at.time().replace(tzinfo=None),
        chief_complaint="Private complaint",
        remarks="Private visit notes",
        status="visited",
        created_by=admin.id,
        consultation_id=consultation.id,
        treatment_duration=35,
        session_status="COMPLETED",
    )
    db.add(visit)
    db.flush()
    consultation.doctor_visit_id = visit.id
    plan = TreatmentPlan(
        doctor_visit_id=visit.id,
        doctor_id=doctor.id,
        patient_name="Private Plan Patient",
        diagnosis="Private diagnosis",
        treatment_plan="Private treatment plan",
        status="approved",
        revision=2,
    )
    schedule = TreatmentSchedule(
        patient_name="Private Treatment Patient",
        patient_phone="9222222222",
        patient_address="Private treatment address",
        doctor_id=doctor.id,
        therapist_id=therapist.id,
        treatment_name="Private therapy",
        schedule_type="one_time",
        treatment_date=today,
        occurrence_date=today,
        in_time=created_at.time().replace(tzinfo=None),
        status="completed",
        completion_notes="Private completion notes",
        treatment_duration=50,
        session_status="COMPLETED",
    )
    other_schedule = TreatmentSchedule(
        patient_name="Other Private Patient",
        patient_address="Other private address",
        doctor_id=doctor.id,
        therapist_id=other_therapist.id,
        treatment_name="Other private therapy",
        schedule_type="one_time",
        treatment_date=today,
        occurrence_date=today,
        status="scheduled",
        session_status="NOT_STARTED",
    )
    db.add_all([plan, schedule, other_schedule])
    db.commit()

    current_user = therapist
    app = FastAPI()
    app.include_router(reports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    client = TestClient(app)

    try:
        own = client.post(
            "/reports/preview",
            json={
                "report_type": "my_clinical_activity",
                "role": "doctor",
                "status": "completed",
            },
        )
        assert own.status_code == 200, own.text
        own_data = own.json()
        assert own_data["row_count"] == 1
        assert own_data["total_amount"] == 0
        assert own_data["summary"]["treatment_sessions"] == 1
        assert own_data["summary"]["total_clinical_minutes"] == 50
        assert own_data["applied_filters"]["role"] == "therapist"

        current_user = doctor_user
        doctor_preview = client.post(
            "/reports/preview",
            json={"report_type": "my_clinical_activity"},
        )
        assert doctor_preview.status_code == 200, doctor_preview.text
        doctor_data = doctor_preview.json()
        assert doctor_data["row_count"] == 3
        assert doctor_data["summary"]["consultations"] == 1
        assert doctor_data["summary"]["doctor_visits"] == 1
        assert doctor_data["summary"]["treatment_plans"] == 1
        assert doctor_data["summary"]["total_clinical_minutes"] == 35

        doctor_performance = client.post(
            "/reports/preview",
            json={"report_type": "my_performance"},
        )
        assert doctor_performance.status_code == 200, doctor_performance.text
        assert doctor_performance.json()["row_count"] == 1
        assert doctor_performance.json()["summary"]["completed_clinical_activities"] == 2

        current_user = admin
        organization = client.post(
            "/reports/preview",
            json={"report_type": "organization_clinical_activity"},
        )
        assert organization.status_code == 200, organization.text
        organization_data = organization.json()
        assert organization_data["row_count"] == 5
        assert organization_data["status_counts"]["completed"] == 3
        assert organization_data["status_counts"]["scheduled"] == 1
        assert organization_data["status_counts"]["approved"] == 1

        performance = client.post(
            "/reports/preview",
            json={"report_type": "organization_performance"},
        )
        assert performance.status_code == 200, performance.text
        assert performance.json()["row_count"] == 3
        assert performance.json()["summary"]["completed_clinical_activities"] == 3
        assert performance.json()["summary"]["therapist_count"] == 2
        assert performance.json()["summary"]["doctor_count"] == 1

        approved_plans = client.post(
            "/reports/preview",
            json={
                "report_type": "organization_clinical_activity",
                "role": "doctor",
                "status": "approved",
            },
        )
        assert approved_plans.status_code == 200
        assert approved_plans.json()["row_count"] == 1
        assert approved_plans.json()["summary"]["treatment_plans"] == 1

        for export_format, signature in (
            ("csv", b"\xef\xbb\xbf"),
            ("xlsx", b"PK"),
            ("pdf", b"%PDF"),
        ):
            job = client.post(
                "/reports/exports",
                json={
                    "snapshot_id": organization_data["snapshot_id"],
                    "format": export_format,
                    "idempotency_key": f"clinical-activity-{export_format}",
                },
            )
            assert job.status_code == 200, job.text
            artifact = client.get(job.json()["download_url"])
            assert artifact.status_code == 200
            assert artifact.content.startswith(signature)
            assert "clinical-activity-register" in artifact.headers[
                "Content-Disposition"
            ]
            if export_format == "csv":
                text = artifact.content.decode("utf-8-sig")
                assert "'=Clinical Doctor" in text
                for private_value in (
                    "Private Consultation Patient",
                    "Private consultation address",
                    "Private consultation notes",
                    "Private Visit Patient",
                    "Private complaint",
                    "Private Plan Patient",
                    "Private diagnosis",
                    "Private Treatment Patient",
                    "Private completion notes",
                ):
                    assert private_value not in text

        current_user = other_therapist
        assert client.get(job.json()["download_url"]).status_code == 404
        assert client.post(
            "/reports/preview",
            json={"report_type": "organization_clinical_activity"},
        ).status_code == 403
    finally:
        db.close()
        engine.dispose()


def test_exception_report_surfaces_actions_without_sensitive_free_text():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine)
    db = session_factory()
    admin = User(
        username="Exception Admin",
        email="exception-admin@example.com",
        password_hash="unused",
        role="admin",
        is_active=True,
    )
    therapist = User(
        username="Exception Therapist",
        email="exception-therapist@example.com",
        password_hash="unused",
        role="therapist",
        is_active=True,
    )
    doctor_user = User(
        username="Exception Doctor User",
        email="exception-doctor@example.com",
        password_hash="unused",
        role="doctor",
        is_active=True,
    )
    db.add_all([admin, therapist, doctor_user])
    db.flush()
    doctor = Doctor(
        user_id=doctor_user.id,
        name="+Exception Doctor",
        specialization="General",
        phone="9555555555",
    )
    db.add(doctor)
    db.flush()
    business_date = india_now().date() - timedelta(days=2)
    created_at = datetime.now(timezone.utc) - timedelta(days=2)
    therapist_claim = Claim(
        therapist_id=therapist.id,
        claim_date=business_date,
        total_km=1,
        travel_total=8,
        daily_allowance=0,
        grand_total=8,
        per_km_rate=8,
        status="rejected",
        rejection_reason="Sensitive therapist rejection reason",
    )
    doctor_claim = DoctorClaim(
        doctor_id=doctor.id,
        claim_date=business_date,
        total_amount=20,
        expense_count=1,
        status="rejected",
        rejection_reason="Sensitive doctor rejection reason",
        submitted_at=created_at,
    )
    db.add_all([therapist_claim, doctor_claim])
    db.flush()
    visit = DoctorVisit(
        patient_name="Sensitive Visit Patient",
        patient_phone="9333333333",
        patient_address="Sensitive visit address",
        doctor_id=doctor.id,
        visit_date=business_date,
        visit_time=created_at.time().replace(tzinfo=None),
        chief_complaint="Sensitive complaint",
        status="scheduled",
        created_by=admin.id,
        session_status="IN_PROGRESS",
    )
    db.add(visit)
    db.flush()
    db.add_all(
        [
            TherapistWorkDay(
                therapist_id=therapist.id,
                work_date=business_date,
                start_address="Sensitive therapist address",
                started_at=created_at,
                is_active=True,
            ),
            DoctorWorkDay(
                doctor_id=doctor.id,
                work_date=business_date,
                start_address="Sensitive doctor address",
                start_latitude=12.9,
                start_longitude=77.6,
                started_at=created_at,
                ended_at=created_at + timedelta(hours=3),
                is_active=False,
                ended_early=True,
                end_reason="Sensitive early closure reason",
            ),
            TreatmentSchedule(
                patient_name="Sensitive Treatment Patient",
                patient_address="Sensitive treatment address",
                doctor_id=doctor.id,
                therapist_id=therapist.id,
                treatment_name="Sensitive therapy",
                schedule_type="one_time",
                treatment_date=business_date,
                occurrence_date=business_date,
                status="missed",
                missed_reason="Sensitive missed reason",
                session_status="NOT_STARTED",
            ),
            TreatmentPlan(
                doctor_visit_id=visit.id,
                doctor_id=doctor.id,
                patient_name="Sensitive Plan Patient",
                diagnosis="Sensitive diagnosis",
                treatment_plan="Sensitive plan",
                status="rejected",
                rejection_reason="Sensitive plan rejection reason",
            ),
            TravelEntry(
                therapist_id=therapist.id,
                travel_date=created_at,
                from_address="Sensitive travel origin",
                to_address="Sensitive travel destination",
                total_km=1,
                per_km_rate=8,
                travel_fare=8,
                patient_visited=False,
                patient_name="Sensitive Travel Patient",
                transport_mode="Vehicle",
                status="draft",
                invoice_file="sensitive-travel-proof.pdf",
            ),
            DoctorExpense(
                doctor_id=doctor.id,
                expense_date=business_date,
                from_location="Sensitive expense origin",
                to_location="Sensitive expense destination",
                distance_km=1,
                transport_mode="Car",
                fare=20,
                proof_file="sensitive-expense-proof.pdf",
                remarks="Sensitive expense remark",
                status="draft",
            ),
        ]
    )
    db.commit()

    current_user = admin
    app = FastAPI()
    app.include_router(reports.router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: current_user
    client = TestClient(app)

    try:
        catalog_types = {
            item["report_type"] for item in client.get("/reports/catalog").json()
        }
        assert "organization_exceptions" in catalog_types
        preview = client.post(
            "/reports/preview",
            json={"report_type": "organization_exceptions"},
        )
        assert preview.status_code == 200, preview.text
        data = preview.json()
        assert data["row_count"] == 9
        assert data["total_amount"] == 0
        assert data["status_counts"] == {
            "open": 2,
            "needs_review": 1,
            "needs_correction": 3,
            "missed": 1,
            "manual": 2,
        }
        assert data["summary"]["overdue_exceptions"] == 9

        doctor_corrections = client.post(
            "/reports/preview",
            json={
                "report_type": "organization_exceptions",
                "role": "doctor",
                "status": "needs_correction",
            },
        )
        assert doctor_corrections.status_code == 200
        assert doctor_corrections.json()["row_count"] == 2

        for export_format, signature in (
            ("csv", b"\xef\xbb\xbf"),
            ("xlsx", b"PK"),
            ("pdf", b"%PDF"),
        ):
            job = client.post(
                "/reports/exports",
                json={
                    "snapshot_id": data["snapshot_id"],
                    "format": export_format,
                    "idempotency_key": f"organization-exceptions-{export_format}",
                },
            )
            assert job.status_code == 200, job.text
            artifact = client.get(job.json()["download_url"])
            assert artifact.status_code == 200
            assert artifact.content.startswith(signature)
            assert "operational-exception-register" in artifact.headers[
                "Content-Disposition"
            ]
            if export_format == "csv":
                artifact_text = artifact.content.decode("utf-8-sig")
                assert "'+Exception Doctor" in artifact_text
                assert "Correct and resubmit" in artifact_text
                for sensitive_value in (
                    "Sensitive therapist rejection reason",
                    "Sensitive doctor rejection reason",
                    "Sensitive Visit Patient",
                    "Sensitive visit address",
                    "Sensitive complaint",
                    "Sensitive therapist address",
                    "Sensitive doctor address",
                    "Sensitive Treatment Patient",
                    "Sensitive treatment address",
                    "Sensitive missed reason",
                    "Sensitive Plan Patient",
                    "Sensitive diagnosis",
                    "Sensitive plan rejection reason",
                    "Sensitive travel origin",
                    "Sensitive travel destination",
                    "Sensitive Travel Patient",
                    "sensitive-travel-proof.pdf",
                    "Sensitive expense origin",
                    "Sensitive expense destination",
                    "Sensitive expense remark",
                    "sensitive-expense-proof.pdf",
                ):
                    assert sensitive_value not in artifact_text

        current_user = therapist
        assert client.post(
            "/reports/preview",
            json={"report_type": "organization_exceptions"},
        ).status_code == 403
        assert client.get(job.json()["download_url"]).status_code == 404
    finally:
        db.close()
        engine.dispose()

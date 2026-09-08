from datetime import datetime, time, timezone
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.doctor_claim import DoctorClaim
from app.models.doctor_visit import DoctorVisit
from app.models.operational_follow_up import OperationalFollowUp
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers import admin_dashboard
from app.utils.auth import get_current_user
from app.utils.timezone import india_now


def test_admin_dashboard_aggregates_both_professions_and_active_staff():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    try:
        admin = User(username="Admin", email="dashboard-admin@example.com", password_hash="x", role="admin", is_active=True)
        therapist = User(username="Therapist", email="dashboard-therapist@example.com", password_hash="x", role="therapist", is_active=True)
        inactive = User(username="Inactive", email="dashboard-inactive@example.com", password_hash="x", role="therapist", is_active=False)
        doctor_user = User(username="Doctor", email="dashboard-doctor@example.com", password_hash="x", role="doctor", is_active=True)
        db.add_all([admin, therapist, inactive, doctor_user])
        db.flush()
        doctor = Doctor(user_id=doctor_user.id, name="Dr Dashboard", active=True)
        db.add(doctor)
        db.flush()
        today = india_now().date()
        now = datetime.now(timezone.utc)
        schedules = [
            TreatmentSchedule(patient_name="Hidden A", doctor_id=doctor.id, therapist_id=therapist.id, treatment_name="Care", patient_address="Hidden", schedule_type="one_time", treatment_date=today, in_time=time(9), status="scheduled"),
            TreatmentSchedule(patient_name="Hidden B", doctor_id=doctor.id, therapist_id=therapist.id, treatment_name="Care", patient_address="Hidden", schedule_type="one_time", treatment_date=today, in_time=time(10), status="completed", completed_at=now),
            TreatmentSchedule(patient_name="Hidden C", doctor_id=doctor.id, therapist_id=therapist.id, treatment_name="Care", patient_address="Hidden", schedule_type="one_time", treatment_date=today, in_time=time(11), status="missed"),
        ]
        db.add_all(schedules)
        db.add_all([
            DoctorVisit(patient_name="Hidden D", patient_phone="0000000000", doctor_id=doctor.id, visit_date=today, visit_time=time(12), status="scheduled", created_by=admin.id),
            DoctorVisit(patient_name="Hidden E", patient_phone="0000000000", doctor_id=doctor.id, visit_date=today, visit_time=time(13), status="visited", created_by=admin.id, completed_at=now),
            Claim(therapist_id=therapist.id, claim_date=today, grand_total=Decimal("100.00"), status="pending"),
            DoctorClaim(doctor_id=doctor.id, claim_date=today, total_amount=Decimal("200.00"), expense_count=1, status="approved", submitted_at=now),
            OperationalFollowUp(source_domain="attendance", source_entity_type="therapist_workday", source_entity_id="42", title="Review closure", priority="medium", status="open", created_by=admin.id, created_reason="Confirm the operational handover."),
        ])
        db.commit()

        app = FastAPI()
        app.include_router(admin_dashboard.router)
        app.dependency_overrides[get_db] = lambda: db
        app.dependency_overrides[get_current_user] = lambda: admin
        response = TestClient(app).get("/admin-dashboard/summary")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["total_therapists"] == 1
        assert body["total_doctors"] == 1
        assert body["total_clinical_staff"] == 2
        assert body["todays_therapist_schedules"] == 1
        assert body["todays_doctor_visits"] == 1
        assert body["todays_schedules"] == 2
        assert body["completed_treatments"] == 2
        assert body["missed_clinical_activities"] == 1
        assert body["pending_claims"] == 1
        assert body["approved_claims"] == 1
        assert body["todays_claims"] == 2
        assert body["open_follow_ups"] == 1
    finally:
        db.close()
        engine.dispose()

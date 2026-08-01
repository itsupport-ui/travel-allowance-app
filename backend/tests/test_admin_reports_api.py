import unittest
from datetime import date, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.travel import TravelEntry
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers.admin_reports import router
from app.utils.auth import get_current_user


class AdminReportsApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        self.admin = User(
            username="Admin",
            email="admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Therapist One",
            email="therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.other_therapist = User(
            username="Therapist Two",
            email="other@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        doctor_user = User(
            username="Doctor",
            email="doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all(
            [
                self.admin,
                self.therapist,
                self.other_therapist,
                doctor_user,
            ]
        )
        self.db.flush()

        doctor = Doctor(user_id=doctor_user.id, name="Doctor")
        self.db.add(doctor)
        self.db.flush()

        today = date.today()
        completed = TreatmentSchedule(
            patient_name="Private",
            doctor_id=doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Treatment",
            patient_address="Private",
            schedule_type="one_time",
            treatment_date=today - timedelta(days=1),
            status="completed",
            completed_at=datetime.combine(
                today - timedelta(days=1),
                datetime.min.time(),
            ),
        )
        scheduled = TreatmentSchedule(
            patient_name="Private",
            doctor_id=doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Treatment",
            patient_address="Private",
            schedule_type="one_time",
            treatment_date=today,
            status="scheduled",
        )
        self.db.add_all([completed, scheduled])
        self.db.flush()

        self.db.add_all(
            [
                TravelEntry(
                    therapist_id=self.therapist.id,
                    schedule_id=completed.id,
                    travel_date=datetime.combine(
                        today - timedelta(days=1),
                        datetime.min.time(),
                    ),
                    from_address="Private",
                    to_address="Private",
                    total_km=12.5,
                    per_km_rate=8,
                    travel_fare=100,
                    patient_visited=True,
                    status="submitted",
                ),
                Claim(
                    therapist_id=self.therapist.id,
                    claim_date=today - timedelta(days=1),
                    total_km=12.5,
                    travel_total=100,
                    daily_allowance=150,
                    grand_total=250,
                    status="pending",
                ),
                Claim(
                    therapist_id=self.other_therapist.id,
                    claim_date=today - timedelta(days=2),
                    total_km=5,
                    travel_total=40,
                    grand_total=40,
                    status="approved",
                ),
            ]
        )
        self.db.commit()

        self.current_user = self.admin
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = (
            lambda: self.current_user
        )
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_returns_aggregated_report_without_patient_details(self):
        response = self.client.get("/admin-reports/overview")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["kpis"]["todays_treatments"], 1)
        self.assertEqual(body["kpis"]["completed_treatments"], 1)
        self.assertEqual(body["kpis"]["total_claims"], 2)
        self.assertEqual(body["kpis"]["pending_claims"], 1)
        self.assertEqual(body["kpis"]["total_km"], 12.5)
        self.assertEqual(body["kpis"]["total_travel_amount"], 100)
        self.assertEqual(
            body["top_therapists"][0]["therapist_name"],
            "Therapist One",
        )
        self.assertNotIn("patient_name", str(body))

    def test_applies_therapist_and_claim_status_filters(self):
        response = self.client.get(
            "/admin-reports/overview",
            params={
                "therapist_id": self.therapist.id,
                "status": "pending",
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["kpis"]["total_claims"], 1)
        self.assertEqual(body["kpis"]["approved_claims"], 0)
        self.assertEqual(len(body["top_therapists"]), 1)

    def test_rejects_invalid_date_range(self):
        response = self.client.get(
            "/admin-reports/overview",
            params={
                "from_date": "2026-02-02",
                "to_date": "2026-02-01",
            },
        )

        self.assertEqual(response.status_code, 422)

    def test_non_admin_cannot_view_reports(self):
        self.current_user = self.therapist

        response = self.client.get("/admin-reports/overview")

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()

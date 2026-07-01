import tempfile
import unittest
from datetime import date, datetime, time
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import claims, therapist_workday, treatment_schedule, travel
from app.utils.auth import get_current_user


class TherapistMobileContractTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.therapist = self.create_user(
            "Therapist One",
            "therapist-one@example.com",
            "therapist",
        )
        self.other_therapist = self.create_user(
            "Therapist Two",
            "therapist-two@example.com",
            "therapist",
        )
        self.admin = self.create_user(
            "Administrator",
            "admin@example.com",
            "admin",
        )
        self.doctor = Doctor(
            name="Doctor One",
            specialization="General",
            phone="1234567890",
        )
        self.db.add(self.doctor)
        self.db.commit()
        self.db.refresh(self.doctor)

        app = FastAPI()
        app.include_router(therapist_workday.router)
        app.include_router(treatment_schedule.router)
        app.include_router(claims.router)
        app.include_router(travel.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.therapist
        self.app = app
        self.client = TestClient(app)

        self.temporary_uploads = tempfile.TemporaryDirectory()
        self.original_upload_root = travel.UPLOAD_ROOT
        travel.UPLOAD_ROOT = Path(self.temporary_uploads.name).resolve()

    def tearDown(self):
        travel.UPLOAD_ROOT = self.original_upload_root
        self.temporary_uploads.cleanup()
        self.db.close()
        self.engine.dispose()

    def create_user(self, username, email, role):
        user = User(
            username=username,
            email=email,
            password_hash="not-used",
            role=role,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def use_user(self, user):
        self.app.dependency_overrides[get_current_user] = lambda: user

    def create_schedule(self, therapist, status):
        schedule = TreatmentSchedule(
            patient_name=f"Patient {therapist.id} {status}",
            doctor_id=self.doctor.id,
            therapist_id=therapist.id,
            treatment_name="Physiotherapy",
            patient_address="Patient address",
            schedule_type="one_time",
            treatment_date=date.today(),
            in_time=time(9, 0),
            out_time=time(10, 0),
            instructions="Instructions",
            priority="normal",
            status=status,
            completion_notes="Completed" if status == "completed" else None,
            missed_reason="Unavailable" if status == "missed" else None,
        )
        self.db.add(schedule)
        self.db.commit()
        self.db.refresh(schedule)
        return schedule

    def create_claim_with_travel(self, therapist, invoice_path=None):
        claim = Claim(
            therapist_id=therapist.id,
            claim_date=date.today(),
            total_km=12.5,
            per_km_rate=8,
            travel_total=100,
            daily_allowance=150,
            grand_total=250,
            patient_visited_today="true",
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()
        self.db.refresh(claim)

        travel_entry = TravelEntry(
            therapist_id=therapist.id,
            claim_id=claim.id,
            travel_date=datetime.combine(date.today(), time.min),
            from_address="Origin",
            to_address="Destination",
            total_km=12.5,
            per_km_rate=8,
            travel_fare=100,
            patient_visited=True,
            status="draft",
            patient_name="Patient",
            transport_mode="vehicle",
            invoice_file=str(invoice_path) if invoice_path else None,
        )
        self.db.add(travel_entry)
        self.db.commit()
        self.db.refresh(travel_entry)
        return claim, travel_entry

    def test_today_workday_returns_false_then_active_record(self):
        response = self.client.get("/therapist/workday/today")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["started"], False)
        self.assertEqual(response.json()["work_date"], date.today().isoformat())

        workday = TherapistWorkDay(
            therapist_id=self.therapist.id,
            work_date=date.today(),
            start_address="Starting address",
            start_latitude=12.1,
            start_longitude=77.1,
            is_active=True,
        )
        self.db.add(workday)
        self.db.commit()
        self.db.refresh(workday)

        active_response = self.client.get("/therapist/workday/today")

        self.assertEqual(active_response.status_code, 200)
        self.assertEqual(active_response.json()["started"], True)
        self.assertEqual(active_response.json()["workday_id"], workday.id)
        self.assertEqual(
            active_response.json()["start_address"],
            "Starting address",
        )

    def test_schedule_history_is_scoped_for_therapists_and_global_for_admin(self):
        own_completed = self.create_schedule(self.therapist, "completed")
        self.create_schedule(self.other_therapist, "completed")
        own_missed = self.create_schedule(self.therapist, "missed")
        self.create_schedule(self.other_therapist, "missed")
        own_pending = self.create_schedule(self.therapist, "scheduled")
        self.create_schedule(self.other_therapist, "scheduled")

        completed = self.client.get("/schedule/completed")
        missed = self.client.get("/schedule/missed")
        pending = self.client.get("/schedule/pending")

        self.assertEqual(
            [item["id"] for item in completed.json()],
            [own_completed.id],
        )
        self.assertEqual(
            [item["id"] for item in missed.json()],
            [own_missed.id],
        )
        self.assertEqual(
            [item["id"] for item in pending.json()],
            [own_pending.id],
        )

        self.use_user(self.admin)
        self.assertEqual(len(self.client.get("/schedule/completed").json()), 2)
        self.assertEqual(len(self.client.get("/schedule/missed").json()), 2)
        self.assertEqual(len(self.client.get("/schedule/pending").json()), 2)

    def test_claim_details_enforce_ownership_and_include_travel_fields(self):
        claim, travel_entry = self.create_claim_with_travel(self.therapist)

        response = self.client.get(f"/claims/{claim.id}/details")

        self.assertEqual(response.status_code, 200)
        travel_payload = response.json()["travels"][0]
        self.assertEqual(travel_payload["id"], travel_entry.id)
        self.assertEqual(travel_payload["per_km_rate"], 8)
        self.assertEqual(travel_payload["patient_visited"], True)
        self.assertEqual(travel_payload["status"], "draft")
        self.assertEqual(
            travel_payload["travel_date"],
            date.today().isoformat(),
        )

        self.use_user(self.other_therapist)
        self.assertEqual(
            self.client.get(f"/claims/{claim.id}/details").status_code,
            403,
        )

        self.use_user(self.admin)
        self.assertEqual(
            self.client.get(f"/claims/{claim.id}/details").status_code,
            200,
        )

    def test_invoice_download_is_protected_and_path_checked(self):
        invoice_path = Path(self.temporary_uploads.name) / "invoice.pdf"
        invoice_path.write_bytes(b"invoice-content")
        _, travel_entry = self.create_claim_with_travel(
            self.therapist,
            invoice_path,
        )

        response = self.client.get(f"/travel/{travel_entry.id}/invoice")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"invoice-content")
        self.assertEqual(response.headers["content-type"], "application/pdf")

        self.use_user(self.other_therapist)
        self.assertEqual(
            self.client.get(f"/travel/{travel_entry.id}/invoice").status_code,
            403,
        )

        self.use_user(self.admin)
        self.assertEqual(
            self.client.get(f"/travel/{travel_entry.id}/invoice").status_code,
            200,
        )

        outside_path = Path(self.temporary_uploads.name).parent / "outside.pdf"
        outside_path.write_bytes(b"outside")
        travel_entry.invoice_file = str(outside_path)
        self.db.commit()

        self.assertEqual(
            self.client.get(f"/travel/{travel_entry.id}/invoice").status_code,
            404,
        )
        outside_path.unlink()


if __name__ == "__main__":
    unittest.main()

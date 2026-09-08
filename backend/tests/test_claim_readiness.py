import unittest
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import claims, doctor_claim
from app.utils.auth import get_current_user
from app.utils.domain_errors import (
    DomainHTTPException,
    domain_exception_handler,
)
from app.utils.timezone import india_now


class ClaimReadinessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.today = india_now().date()
        self.therapist = User(
            username="Preview Therapist",
            email="preview-therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.doctor_user = User(
            username="Preview Doctor",
            email="preview-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all([self.therapist, self.doctor_user])
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Preview Doctor",
            active=True,
        )
        self.policy = ReimbursementPolicy(
            version=4,
            effective_from=self.today,
            per_km_rate=Decimal("9.50"),
            daily_allowance=Decimal("175.00"),
        )
        self.db.add_all([self.doctor, self.policy])
        self.db.commit()

        app = FastAPI()
        app.add_exception_handler(
            DomainHTTPException,
            domain_exception_handler,
        )
        app.include_router(claims.router)
        app.include_router(doctor_claim.router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.current_user = self.therapist
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_therapist_preview_and_submission_use_identical_snapshot(self):
        first = TravelEntry(
            therapist_id=self.therapist.id,
            travel_date=india_now(),
            from_address="Clinic",
            to_address="First visit",
            total_km=Decimal("4.25"),
            per_km_rate=Decimal("9.50"),
            travel_fare=Decimal("40.38"),
            patient_visited=True,
            transport_mode="vehicle",
            schedule_id=101,
            status="draft",
        )
        second = TravelEntry(
            therapist_id=self.therapist.id,
            travel_date=india_now(),
            from_address="First visit",
            to_address="Second visit",
            total_km=Decimal("2.10"),
            per_km_rate=Decimal("9.50"),
            travel_fare=Decimal("19.95"),
            patient_visited=True,
            transport_mode="vehicle",
            schedule_id=102,
            status="draft",
        )
        self.db.add_all([first, second])
        self.db.commit()

        preview = self.client.get("/claims/preview")
        self.assertEqual(preview.status_code, 200, preview.text)
        data = preview.json()
        self.assertEqual(data["state"], "ready")
        self.assertTrue(data["can_submit"])
        self.assertEqual(data["submission_mode"], "submit")
        self.assertEqual(data["eligible_record_ids"], [first.id, second.id])
        self.assertEqual(data["total_km"], 6.35)
        self.assertEqual(data["travel_total"], 60.33)
        self.assertEqual(data["daily_allowance"], 175.0)
        self.assertEqual(data["total_amount"], 235.33)
        self.assertEqual(data["policy_version"], 4)
        self.assertEqual(data["available_actions"], ["submit_claim"])

        submitted = self.client.post("/claims/submit")
        self.assertEqual(submitted.status_code, 200, submitted.text)
        claim = submitted.json()
        self.assertEqual(claim["included_travel_ids"], data["eligible_record_ids"])
        self.assertEqual(claim["total_km"], data["total_km"])
        self.assertEqual(claim["travel_total"], data["travel_total"])
        self.assertEqual(claim["daily_allowance"], data["daily_allowance"])
        self.assertEqual(claim["grand_total"], data["total_amount"])

        after = self.client.get("/claims/preview")
        self.assertEqual(after.status_code, 200, after.text)
        self.assertEqual(after.json()["state"], "already_submitted")
        self.assertFalse(after.json()["can_submit"])
        self.assertEqual(after.json()["total_source"], "existing_claim")
        self.assertEqual(after.json()["existing_claim_id"], claim["id"])

    def test_preview_exposes_manual_review_blocker_without_mutation(self):
        pending = TravelEntry(
            therapist_id=self.therapist.id,
            travel_date=india_now(),
            from_address="Clinic",
            to_address="Manual destination",
            total_km=Decimal("3.00"),
            per_km_rate=Decimal("9.50"),
            travel_fare=Decimal("28.50"),
            patient_visited=True,
            transport_mode="vehicle",
            status="draft",
            manual_review_status="pending",
        )
        self.db.add(pending)
        self.db.commit()

        preview = self.client.get("/claims/preview")
        self.assertEqual(preview.status_code, 200, preview.text)
        data = preview.json()
        self.assertEqual(data["state"], "blocked")
        self.assertFalse(data["can_submit"])
        self.assertEqual(data["pending_review_count"], 1)
        self.assertEqual(
            data["blocking_reasons"][0]["code"],
            "MANUAL_TRAVEL_REVIEW_REQUIRED",
        )
        self.assertEqual(data["next_action"], "open_manual_travel")
        self.assertIsNone(pending.claim_id)

    def test_doctor_preview_and_submission_use_identical_snapshot(self):
        self.current_user = self.doctor_user
        first = DoctorExpense(
            doctor_id=self.doctor.id,
            expense_date=self.today,
            visit_id=201,
            from_location="Clinic",
            to_location="First visit",
            transport_mode="cab",
            fare=Decimal("125.75"),
            status="draft",
        )
        second = DoctorExpense(
            doctor_id=self.doctor.id,
            expense_date=self.today,
            visit_id=202,
            from_location="First visit",
            to_location="Second visit",
            transport_mode="auto",
            fare=Decimal("80.25"),
            status="draft",
        )
        self.db.add_all([first, second])
        self.db.commit()

        preview = self.client.get("/doctor-claims/preview")
        self.assertEqual(preview.status_code, 200, preview.text)
        data = preview.json()
        self.assertEqual(data["state"], "ready")
        self.assertTrue(data["can_submit"])
        self.assertEqual(data["eligible_record_ids"], [first.id, second.id])
        self.assertEqual(data["eligible_record_count"], 2)
        self.assertEqual(data["expense_total"], 206.0)
        self.assertEqual(data["total_amount"], 206.0)

        submitted = self.client.post("/doctor-claims/submit")
        self.assertEqual(submitted.status_code, 201, submitted.text)
        claim = submitted.json()
        self.assertEqual(claim["included_expense_ids"], data["eligible_record_ids"])
        self.assertEqual(claim["expense_count"], data["eligible_record_count"])
        self.assertEqual(claim["total_amount"], data["total_amount"])

        after = self.client.get("/doctor-claims/preview")
        self.assertEqual(after.status_code, 200, after.text)
        self.assertEqual(after.json()["state"], "already_submitted")
        self.assertEqual(after.json()["existing_claim_id"], claim["id"])


if __name__ == "__main__":
    unittest.main()

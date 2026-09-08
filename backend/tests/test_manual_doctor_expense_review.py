import unittest
from datetime import date
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.manual_doctor_expense_review_event import (
    ManualDoctorExpenseReviewEvent,
)
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.user import User
from app.routers import doctor_claim, doctor_expense
from app.utils.auth import get_current_user
from app.utils.domain_errors import DomainHTTPException, domain_exception_handler
from app.utils.uploads import delete_stored_upload
from app.utils.timezone import india_now


class ManualDoctorExpenseReviewTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.doctor_user = User(
            username="Manual Expense Doctor",
            email="manual-expense-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.admin = User(
            username="Manual Expense Reviewer",
            email="manual-expense-reviewer@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.db.add_all([
            self.doctor_user,
            self.admin,
            ReimbursementPolicy(
                version=1,
                effective_from=date(1970, 1, 1),
                per_km_rate=Decimal("8.00"),
                daily_allowance=Decimal("150.00"),
                doctor_receipt_threshold=Decimal("500.00"),
            ),
        ])
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Manual Expense Doctor",
            active=True,
        )
        self.db.add(self.doctor)
        self.db.commit()
        self.current_user = self.doctor_user

        app = FastAPI()
        app.add_exception_handler(DomainHTTPException, domain_exception_handler)
        app.include_router(doctor_expense.router)
        app.include_router(doctor_claim.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        for proof_file, in self.db.query(DoctorExpense.proof_file).all():
            delete_stored_upload(proof_file, subdirectory="doctor_expenses")
        self.db.close()
        self.engine.dispose()

    def payload(self, **overrides):
        data = {
            "expense_date": india_now().date().isoformat(),
            "from_location": "Clinic",
            "to_location": "Training venue",
            "transport_mode": "cab",
            "fare": "275.50",
            "expense_category": "authorized_other",
            "manual_reason": "The approved training trip was outside a patient visit.",
            "remarks": "Training travel",
        }
        data.update(overrides)
        return data

    @staticmethod
    def proof():
        return {
            "proof_file": (
                "receipt.pdf",
                b"%PDF-1.4 manual expense receipt",
                "application/pdf",
            )
        }

    def create_pending(self):
        response = self.client.post(
            "/doctor-expenses/",
            data=self.payload(),
            files=self.proof(),
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_manual_expense_correction_review_history_and_claim_gate(self):
        created = self.create_pending()
        self.assertEqual(created["manual_review_status"], "pending")
        self.assertEqual(created["expense_category"], "authorized_other")
        self.assertEqual(created["available_actions"], ["edit", "cancel"])
        self.assertEqual(
            self.db.query(ManualDoctorExpenseReviewEvent).count(),
            1,
        )
        verified_expense = DoctorExpense(
            doctor_id=self.doctor.id,
            expense_date=india_now().date(),
            visit_id=999,
            from_location="Clinic",
            to_location="Patient address",
            transport_mode="cab",
            fare=125,
            expense_category="public_transport",
            status="draft",
        )
        self.db.add(verified_expense)
        self.db.commit()

        blocked = self.client.post("/doctor-claims/submit")
        self.assertEqual(blocked.status_code, 409, blocked.text)
        self.assertEqual(
            blocked.json()["code"],
            "MANUAL_DOCTOR_EXPENSE_REVIEW_REQUIRED",
        )
        self.db.refresh(verified_expense)
        self.assertIsNone(verified_expense.claim_id)

        self.current_user = self.admin
        queue = self.client.get("/doctor-expenses/manual-review?status=pending")
        self.assertEqual(queue.status_code, 200, queue.text)
        self.assertEqual(queue.json()[0]["doctor_name"], self.doctor.name)
        proof = self.client.get(f"/doctor-expenses/{created['id']}/proof")
        self.assertEqual(proof.status_code, 200, proof.text)
        self.assertTrue(proof.content.startswith(b"%PDF-"))
        requested = self.client.put(
            f"/doctor-expenses/manual-review/{created['id']}/decision",
            json={
                "decision": "changes_requested",
                "reason": "Clarify why this route was not linked to a patient visit.",
                "version": created["manual_review_version"],
            },
        )
        self.assertEqual(requested.status_code, 200, requested.text)

        self.current_user = self.doctor_user
        corrected = self.client.put(
            f"/doctor-expenses/{created['id']}",
            data=self.payload(
                to_location="Approved training venue",
                fare="250.00",
                correction_reason="Added the authorization context and corrected the fare.",
                version=str(requested.json()["manual_review_version"]),
            ),
        )
        self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertEqual(corrected.json()["manual_review_status"], "pending")
        self.assertEqual(corrected.json()["manual_revision"], 2)
        self.assertEqual(corrected.json()["fare"], 250.0)

        history = self.client.get(
            f"/doctor-expenses/{created['id']}/review-history"
        )
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(
            [event["event_type"] for event in history.json()],
            [
                "submitted_for_review",
                "changes_requested",
                "corrected_and_resubmitted",
            ],
        )

        self.current_user = self.admin
        approved = self.client.put(
            f"/doctor-expenses/manual-review/{created['id']}/decision",
            json={
                "decision": "approved",
                "reason": "The receipt and authorization context are sufficient.",
                "version": corrected.json()["manual_review_version"],
                "approved_amount": 225.25,
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["fare"], 250.0)
        self.assertEqual(approved.json()["approved_amount"], 225.25)

        self.current_user = self.doctor_user
        submitted = self.client.post("/doctor-claims/submit")
        self.assertEqual(submitted.status_code, 201, submitted.text)
        self.assertEqual(submitted.json()["expense_count"], 2)
        self.assertEqual(submitted.json()["total_amount"], 350.25)
        stored = self.db.query(DoctorExpense).filter_by(id=created["id"]).one()
        self.assertEqual(stored.status, "submitted")
        self.assertIsNotNone(stored.claim_id)
        events = self.db.query(ManualDoctorExpenseReviewEvent).filter_by(
            expense_id=created["id"]
        ).all()
        self.assertEqual(events[-1].submitted_amount, 250)
        self.assertEqual(events[-1].approved_amount, 225.25)

    def test_approved_amount_cannot_exceed_submitted_fare(self):
        created = self.create_pending()
        self.current_user = self.admin
        response = self.client.put(
            f"/doctor-expenses/manual-review/{created['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Receipt was checked but the amount is invalid.",
                "version": created["manual_review_version"],
                "approved_amount": 300,
            },
        )
        self.assertEqual(response.status_code, 422, response.text)
        stored = self.db.query(DoctorExpense).filter_by(id=created["id"]).one()
        self.assertEqual(stored.manual_review_status, "pending")
        self.assertIsNone(stored.approved_amount)

    def test_required_evidence_version_guard_and_soft_cancellation(self):
        missing_reason = self.client.post(
            "/doctor-expenses/",
            data={
                key: value
                for key, value in self.payload().items()
                if key != "manual_reason"
            },
            files=self.proof(),
        )
        self.assertEqual(missing_reason.status_code, 422, missing_reason.text)
        missing_proof = self.client.post(
            "/doctor-expenses/",
            data=self.payload(),
        )
        self.assertEqual(missing_proof.status_code, 400, missing_proof.text)

        created = self.create_pending()
        stale = self.client.put(
            f"/doctor-expenses/{created['id']}",
            data=self.payload(
                correction_reason="Trying to update from an older screen.",
                version=str(created["manual_review_version"] + 1),
            ),
        )
        self.assertEqual(stale.status_code, 409, stale.text)

        cancelled = self.client.delete(f"/doctor-expenses/{created['id']}")
        self.assertEqual(cancelled.status_code, 204, cancelled.text)
        stored = self.db.query(DoctorExpense).filter_by(id=created["id"]).one()
        self.assertEqual(stored.status, "cancelled")
        self.assertEqual(stored.manual_review_status, "cancelled")
        today = self.client.get("/doctor-expenses/today")
        self.assertEqual(today.status_code, 200, today.text)
        self.assertEqual(today.json(), [])


if __name__ == "__main__":
    unittest.main()

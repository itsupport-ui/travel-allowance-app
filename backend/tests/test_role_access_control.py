import unittest
from datetime import date, datetime, timezone

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
from app.models.domain_audit_event import DomainAuditEvent
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers.admin_schedules import router as admin_schedules_router
from app.routers.claims import router as claims_router
from app.routers.doctor_claim import router as doctor_claim_router
from app.routers.doctors import router as doctors_router
from app.routers.user import router as users_router
from app.utils.auth import get_current_user


class RoleAccessControlTests(unittest.TestCase):
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
            username="Administrator",
            email="admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.telecaller = User(
            username="Telecaller One",
            email="telecaller@example.com",
            password_hash="unused",
            role="telecaller",
            is_active=True,
        )
        self.clinical_head = User(
            username="Clinical Head One",
            email="clinical-head@example.com",
            password_hash="unused",
            role="clinical_head",
            is_active=True,
        )
        self.therapist = User(
            username="Therapist One",
            email="therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.doctor_user = User(
            username="Doctor One User",
            email="doctor-one@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all(
            [
                self.admin,
                self.telecaller,
                self.clinical_head,
                self.therapist,
                self.doctor_user,
            ]
        )
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Doctor One",
            specialization="General",
            phone="1234567890",
            active=True,
        )
        self.db.add(self.doctor)
        self.db.commit()

        self.current_user = self.admin
        app = FastAPI()
        app.include_router(users_router)
        app.include_router(doctors_router)
        app.include_router(admin_schedules_router)
        app.include_router(claims_router)
        app.include_router(doctor_claim_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = (
            lambda: self.current_user
        )
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    # -- Operations-staff account management (admin only) -----------------

    def test_admin_can_create_and_manage_operations_staff(self):
        create_response = self.client.post(
            "/users/operations-staff",
            json={
                "username": "New Coordinator",
                "email": "coordinator@example.com",
                "password": "secure-pass-123",
                "role": "clinical_head",
            },
        )
        self.assertEqual(create_response.status_code, 201, create_response.text)
        new_id = create_response.json()["id"]
        self.assertEqual(create_response.json()["role"], "clinical_head")

        list_response = self.client.get("/users/operations-staff")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()), 3)

        update_response = self.client.put(
            f"/users/operations-staff/{new_id}",
            json={
                "username": "Updated Coordinator",
                "email": "coordinator@example.com",
                "role": "clinical_head",
                "is_active": False,
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertFalse(update_response.json()["is_active"])

        reset_response = self.client.post(
            f"/users/operations-staff/{new_id}/reset-password",
            json={"password": "another-secure-pass"},
        )
        self.assertEqual(reset_response.status_code, 200)

        event_actions = [
            event.action
            for event in self.db.query(DomainAuditEvent).order_by(
                DomainAuditEvent.id
            )
        ]
        self.assertEqual(
            event_actions,
            ["created", "deactivated", "password_reset"],
        )

    def test_non_admin_cannot_manage_operations_staff(self):
        self.current_user = self.clinical_head
        response = self.client.post(
            "/users/operations-staff",
            json={
                "username": "New Telecaller",
                "email": "telecaller-two@example.com",
                "password": "secure-pass-123",
                "role": "telecaller",
            },
        )
        self.assertEqual(response.status_code, 403)

    # -- Clinical head gets operational access -----------------------------

    def test_clinical_head_can_manage_clinical_staff(self):
        self.current_user = self.clinical_head
        response = self.client.get("/doctors/manage")
        self.assertEqual(response.status_code, 200)

    def test_clinical_head_can_review_schedules(self):
        self.current_user = self.clinical_head
        response = self.client.get("/admin-schedules/review")
        self.assertEqual(response.status_code, 200)

    def test_telecaller_cannot_manage_clinical_staff_or_schedules(self):
        self.current_user = self.telecaller
        staff_response = self.client.get("/doctors/manage")
        schedule_response = self.client.get("/admin-schedules/review")
        self.assertEqual(staff_response.status_code, 403)
        self.assertEqual(schedule_response.status_code, 403)

    def test_telecaller_can_view_doctor_directory(self):
        self.current_user = self.telecaller
        response = self.client.get("/doctors/")
        self.assertEqual(response.status_code, 200)

    # -- Maker-checker: a claim submitter cannot approve/reject their own --

    def test_claim_submitter_cannot_approve_own_therapist_claim(self):
        claim = Claim(
            therapist_id=self.admin.id,
            claim_date=date(2026, 1, 1),
            total_km=10,
            travel_total=80,
            daily_allowance=150,
            grand_total=230,
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()

        self.current_user = self.admin
        response = self.client.put(f"/claims/{claim.id}/approve")
        self.assertEqual(response.status_code, 403)

    def test_claim_submitter_cannot_approve_own_doctor_claim(self):
        claim = DoctorClaim(
            doctor_id=self.doctor.id,
            claim_date=date(2026, 1, 1),
            total_amount=500,
            expense_count=1,
            status="pending",
            submitted_at=datetime.now(timezone.utc),
        )
        self.db.add(claim)
        self.db.commit()

        # Promote the doctor's own login to admin to simulate a reviewer
        # account that is also the claim's submitter.
        self.doctor_user.role = "admin"
        self.db.commit()

        self.current_user = self.doctor_user
        response = self.client.put(f"/doctor-claims/{claim.id}/approve")
        self.assertEqual(response.status_code, 403)

    def test_clinical_head_cannot_approve_claims(self):
        claim = Claim(
            therapist_id=self.therapist.id,
            claim_date=date(2026, 1, 1),
            total_km=10,
            travel_total=80,
            daily_allowance=150,
            grand_total=230,
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()

        self.current_user = self.clinical_head
        response = self.client.put(f"/claims/{claim.id}/approve")
        self.assertEqual(response.status_code, 403)

    def test_admin_can_approve_others_claims(self):
        claim = Claim(
            therapist_id=self.therapist.id,
            claim_date=date(2026, 1, 1),
            total_km=10,
            travel_total=80,
            daily_allowance=150,
            grand_total=230,
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()

        self.current_user = self.admin
        response = self.client.put(f"/claims/{claim.id}/approve")
        self.assertEqual(response.status_code, 200, response.text)

    def test_claim_submitter_cannot_request_changes_on_own_claim(self):
        claim = Claim(
            therapist_id=self.admin.id,
            claim_date=date(2026, 1, 1),
            total_km=10,
            travel_total=80,
            daily_allowance=150,
            grand_total=230,
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()

        self.current_user = self.admin
        response = self.client.put(
            f"/claims/{claim.id}/request-changes",
            json={"rejection_reason": "Missing evidence"},
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_request_changes_on_others_claim(self):
        claim = Claim(
            therapist_id=self.therapist.id,
            claim_date=date(2026, 1, 1),
            total_km=10,
            travel_total=80,
            daily_allowance=150,
            grand_total=230,
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()

        self.current_user = self.admin
        response = self.client.put(
            f"/claims/{claim.id}/request-changes",
            json={"rejection_reason": "Missing evidence"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "changes_requested")

    def test_clinical_head_cannot_request_claim_changes(self):
        claim = Claim(
            therapist_id=self.therapist.id,
            claim_date=date(2026, 1, 1),
            total_km=10,
            travel_total=80,
            daily_allowance=150,
            grand_total=230,
            status="pending",
        )
        self.db.add(claim)
        self.db.commit()

        self.current_user = self.clinical_head
        response = self.client.put(
            f"/claims/{claim.id}/request-changes",
            json={"rejection_reason": "Missing evidence"},
        )
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()

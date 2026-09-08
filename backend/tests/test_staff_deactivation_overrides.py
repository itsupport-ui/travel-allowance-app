import unittest
from datetime import date, datetime, time, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_expense import DoctorExpense
from app.models.domain_audit_event import DomainAuditEvent
from app.models.staff_deactivation_override import StaffDeactivationOverride
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers.doctors import router as doctors_router
from app.routers.staff_overrides import router as staff_overrides_router
from app.routers.user import router as users_router
from app.utils.auth import get_current_user
from app.utils.domain_errors import (
    DomainHTTPException,
    domain_exception_handler,
)


class StaffDeactivationOverrideTests(unittest.TestCase):
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
            username="Override Administrator",
            email="override-admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Field Therapist",
            email="field-therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.doctor_user = User(
            username="Field Doctor",
            email="field-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all([self.admin, self.therapist, self.doctor_user])
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Field Doctor",
            active=True,
        )
        self.db.add(self.doctor)
        self.db.commit()

        self.current_user = self.admin
        app = FastAPI()
        app.add_exception_handler(
            DomainHTTPException,
            domain_exception_handler,
        )
        app.include_router(staff_overrides_router)
        app.include_router(users_router)
        app.include_router(doctors_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def _schedule(self, suffix: str = "one") -> TreatmentSchedule:
        schedule = TreatmentSchedule(
            patient_name=f"Patient {suffix}",
            patient_address="Private address",
            doctor_id=self.doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Therapy",
            schedule_type="one_time",
            treatment_date=date.today(),
            occurrence_date=date.today(),
            in_time=time(9, 0),
            status="scheduled",
            session_status="NOT_STARTED",
        )
        self.db.add(schedule)
        self.db.commit()
        return schedule

    def _request_and_approve(
        self,
        role: str,
        staff_id: int,
    ) -> dict:
        request_response = self.client.post(
            "/staff/deactivation-overrides",
            json={
                "staff_role": role,
                "staff_id": staff_id,
                "reason": "The remaining records have an assigned follow-up owner.",
                "evidence_refs": ["handover-ticket-123"],
            },
        )
        self.assertEqual(
            request_response.status_code,
            200,
            request_response.text,
        )
        request = request_response.json()
        decision_response = self.client.put(
            f"/staff/deactivation-overrides/{request['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Handover evidence reviewed and accepted.",
                "version": request["version"],
            },
        )
        self.assertEqual(
            decision_response.status_code,
            200,
            decision_response.text,
        )
        return decision_response.json()

    def test_clear_profile_requires_reason_but_not_override(self):
        readiness = self.client.get(
            f"/staff/deactivation-readiness/therapist/{self.therapist.id}"
        )
        self.assertEqual(readiness.status_code, 200)
        self.assertEqual(readiness.json()["readiness_state"], "ready")
        self.assertEqual(readiness.json()["available_actions"], ["deactivate"])

        missing_reason = self.client.put(
            f"/therapists/{self.therapist.id}",
            json={
                "username": self.therapist.username,
                "email": self.therapist.email,
                "is_active": False,
            },
        )
        self.assertEqual(missing_reason.status_code, 422)
        self.assertEqual(missing_reason.json()["code"], "DEACTIVATION_REASON_REQUIRED")

        deactivated = self.client.put(
            f"/therapists/{self.therapist.id}",
            json={
                "username": self.therapist.username,
                "email": self.therapist.email,
                "is_active": False,
                "deactivation_reason": "Staff member has left the organization.",
            },
        )
        self.assertEqual(deactivated.status_code, 200, deactivated.text)
        self.assertFalse(deactivated.json()["is_active"])

    def test_active_work_is_a_non_overridable_hard_block(self):
        workday = TherapistWorkDay(
            therapist_id=self.therapist.id,
            work_date=date.today(),
            is_active=True,
        )
        self.db.add(workday)
        self.db.commit()

        readiness = self.client.get(
            f"/staff/deactivation-readiness/therapist/{self.therapist.id}"
        )
        self.assertEqual(readiness.status_code, 200)
        body = readiness.json()
        self.assertEqual(body["readiness_state"], "hard_blocked")
        self.assertIn(
            "ACTIVE_WORKDAY",
            [item["code"] for item in body["hard_blockers"]],
        )

        request = self.client.post(
            "/staff/deactivation-overrides",
            json={
                "staff_role": "therapist",
                "staff_id": self.therapist.id,
                "reason": "Attempting a controlled operational handover.",
            },
        )
        self.assertEqual(request.status_code, 409)
        self.assertEqual(request.json()["code"], "STAFF_DEACTIVATION_HARD_BLOCKED")

    def test_soft_impacts_require_approved_single_use_override(self):
        self._schedule()

        blocked = self.client.put(
            f"/therapists/{self.therapist.id}",
            json={
                "username": self.therapist.username,
                "email": self.therapist.email,
                "is_active": False,
                "deactivation_reason": "Staff member is leaving after a documented handover.",
            },
        )
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(
            blocked.json()["code"],
            "STAFF_DEACTIVATION_OVERRIDE_REQUIRED",
        )

        approved = self._request_and_approve(
            "therapist",
            self.therapist.id,
        )
        deactivated = self.client.put(
            f"/therapists/{self.therapist.id}",
            json={
                "username": self.therapist.username,
                "email": self.therapist.email,
                "is_active": False,
                "deactivation_reason": "Staff member is leaving after a documented handover.",
                "override_request_id": approved["id"],
            },
        )
        self.assertEqual(deactivated.status_code, 200, deactivated.text)
        request = self.db.query(StaffDeactivationOverride).one()
        self.assertEqual(request.status, "consumed")
        self.assertIsNone(request.active_key)
        self.assertEqual(request.after_state["staff_status"], "inactive")

        event_actions = [
            event.action
            for event in self.db.query(DomainAuditEvent)
            .order_by(DomainAuditEvent.id)
            .all()
        ]
        self.assertEqual(
            event_actions,
            ["requested", "approved", "consumed", "deactivated"],
        )
        audit_text = " ".join(
            str(event.details)
            for event in self.db.query(DomainAuditEvent).all()
        )
        self.assertNotIn("Private address", audit_text)
        self.assertNotIn("Patient one", audit_text)

    def test_changed_conditions_make_pending_request_stale(self):
        self._schedule("one")
        request_response = self.client.post(
            "/staff/deactivation-overrides",
            json={
                "staff_role": "therapist",
                "staff_id": self.therapist.id,
                "reason": "Future assignment has a documented handover owner.",
            },
        )
        self.assertEqual(request_response.status_code, 200)
        request = request_response.json()
        self._schedule("two")

        decision = self.client.put(
            f"/staff/deactivation-overrides/{request['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Original impact reviewed.",
                "version": request["version"],
            },
        )
        self.assertEqual(decision.status_code, 409)
        self.assertEqual(
            decision.json()["code"],
            "STAFF_DEACTIVATION_CONDITIONS_CHANGED",
        )
        self.db.expire_all()
        stored = self.db.get(StaffDeactivationOverride, request["id"])
        self.assertEqual(stored.status, "stale")
        self.assertIsNone(stored.active_key)

    def test_doctor_deactivation_synchronizes_login_access(self):
        expense = DoctorExpense(
            doctor_id=self.doctor.id,
            expense_date=date.today(),
            from_location="Origin",
            to_location="Destination",
            transport_mode="taxi",
            fare=100,
            status="draft",
        )
        self.db.add(expense)
        self.db.commit()
        approved = self._request_and_approve("doctor", self.doctor.id)

        response = self.client.put(
            f"/doctors/{self.doctor.id}",
            json={
                "user_id": self.doctor_user.id,
                "name": self.doctor.name,
                "active": False,
                "deactivation_reason": "Doctor access ended after expense handover.",
                "override_request_id": approved["id"],
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.db.refresh(self.doctor_user)
        self.assertFalse(self.doctor_user.is_active)

    def test_non_admin_cannot_view_or_decide_overrides(self):
        self.current_user = self.therapist

        readiness = self.client.get(
            f"/staff/deactivation-readiness/therapist/{self.therapist.id}"
        )
        queue = self.client.get("/staff/deactivation-overrides")

        self.assertEqual(readiness.status_code, 403)
        self.assertEqual(queue.status_code, 403)


if __name__ == "__main__":
    unittest.main()

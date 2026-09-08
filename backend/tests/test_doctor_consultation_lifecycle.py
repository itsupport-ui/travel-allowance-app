import unittest
from datetime import time, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_consultation import DoctorConsultation
from app.models.doctor_consultation_event import DoctorConsultationEvent
from app.models.domain_audit_event import DomainAuditEvent
from app.models.user import User
from app.routers import doctor_consultation, domain_audit
from app.utils.auth import get_current_user
from app.utils.domain_errors import DomainHTTPException, domain_exception_handler
from app.utils.timezone import india_now


class DoctorConsultationLifecycleTests(unittest.TestCase):
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
            username="Consultation Admin",
            email="consultation-admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.doctor_user = User(
            username="Consultation Doctor",
            email="consultation-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.other_doctor_user = User(
            username="Other Consultation Doctor",
            email="other-consultation-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all(
            [self.admin, self.doctor_user, self.other_doctor_user]
        )
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Consultation Doctor",
            active=True,
        )
        self.other_doctor = Doctor(
            user_id=self.other_doctor_user.id,
            name="Other Consultation Doctor",
            active=True,
        )
        self.db.add_all([self.doctor, self.other_doctor])
        self.db.commit()

        app = FastAPI()
        app.include_router(doctor_consultation.router)
        app.include_router(domain_audit.router)
        app.add_exception_handler(
            DomainHTTPException,
            domain_exception_handler,
        )
        app.dependency_overrides[get_db] = lambda: self.db
        self.current_user = self.admin
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def use_user(self, user: User) -> None:
        self.current_user = user

    def create_consultation(self, *, doctor_id: int | None = None) -> dict:
        tomorrow = india_now().date() + timedelta(days=1)
        response = self.client.post(
            "/doctor-consultations/",
            json={
                "patient_name": "Lifecycle Patient",
                "patient_phone": "9000000000",
                "patient_address": "Lifecycle address",
                "doctor_id": doctor_id or self.doctor.id,
                "scheduled_date": tomorrow.isoformat(),
                "scheduled_time": "10:00:00",
                "purpose": "Initial consultation",
                "notes": "Audit-safe test record",
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_follow_up_creates_dated_linked_appointment_and_history(self):
        consultation = self.create_consultation()
        self.assertEqual(consultation["available_actions"], [
            "complete",
            "reschedule",
            "cancel",
        ])

        self.use_user(self.doctor_user)
        invalid = self.client.put(
            f"/doctor-consultations/{consultation['id']}/complete",
            json={
                "call_outcome": "Patient needs another conversation",
                "patient_decision": "follow_up",
                "lifecycle_version": consultation["lifecycle_version"],
            },
        )
        self.assertEqual(invalid.status_code, 422, invalid.text)

        follow_up_date = india_now().date() + timedelta(days=3)
        completed = self.client.put(
            f"/doctor-consultations/{consultation['id']}/complete",
            json={
                "call_outcome": "Patient needs another conversation",
                "patient_decision": "follow_up",
                "follow_up_date": follow_up_date.isoformat(),
                "follow_up_time": "11:30:00",
                "follow_up_reason": "Review symptoms after medication",
                "lifecycle_version": consultation["lifecycle_version"],
            },
        )
        self.assertEqual(completed.status_code, 200, completed.text)
        completed_data = completed.json()
        self.assertEqual(completed_data["follow_up_date"], follow_up_date.isoformat())
        self.assertIn("schedule_follow_up", completed_data["available_actions"])
        self.assertEqual(completed_data["lifecycle_version"], 2)

        scheduled = self.client.post(
            f"/doctor-consultations/{consultation['id']}/schedule-follow-up",
            json={"lifecycle_version": 2},
        )
        self.assertEqual(scheduled.status_code, 201, scheduled.text)
        successor = scheduled.json()
        self.assertEqual(successor["origin_consultation_id"], consultation["id"])
        self.assertEqual(successor["origin_kind"], "follow_up")
        self.assertEqual(successor["scheduled_date"], follow_up_date.isoformat())

        source = self.client.get(
            f"/doctor-consultations/{consultation['id']}"
        )
        self.assertEqual(source.status_code, 200, source.text)
        self.assertEqual(
            source.json()["successor_consultation_id"],
            successor["id"],
        )
        self.assertEqual(source.json()["available_actions"], ["view_successor"])

        history = self.client.get(
            f"/doctor-consultations/{consultation['id']}/history"
        )
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(
            [event["event_type"] for event in history.json()],
            ["created", "completed", "follow_up_scheduled"],
        )
        self.assertEqual(
            history.json()[-1]["related_consultation_id"],
            successor["id"],
        )
        self.assertEqual(
            self.db.query(DomainAuditEvent)
            .filter(
                DomainAuditEvent.entity_type == "doctor_consultation",
                DomainAuditEvent.entity_id == str(consultation["id"]),
            )
            .count(),
            3,
        )

        forbidden_audit = self.client.get("/audit-events/")
        self.assertEqual(forbidden_audit.status_code, 403, forbidden_audit.text)
        self.use_user(self.admin)
        audit_page = self.client.get(
            "/audit-events/",
            params={
                "domain": "clinical",
                "entity_type": "doctor_consultation",
                "entity_id": consultation["id"],
            },
        )
        self.assertEqual(audit_page.status_code, 200, audit_page.text)
        self.assertEqual(audit_page.json()["total"], 3)
        self.assertEqual(
            {item["action"] for item in audit_page.json()["items"]},
            {"created", "completed", "follow_up_scheduled"},
        )
        self.assertNotIn(
            "Patient needs another conversation",
            {item["reason"] for item in audit_page.json()["items"]},
        )
        doctor_events = self.client.get(
            "/audit-events/",
            params={
                "actor_name": "consultation doctor",
                "actor_role": "doctor",
                "entity_id": consultation["id"],
            },
        )
        self.assertEqual(doctor_events.status_code, 200, doctor_events.text)
        self.assertEqual(doctor_events.json()["total"], 2)

        self.use_user(self.doctor_user)

        stale_retry = self.client.post(
            f"/doctor-consultations/{consultation['id']}/schedule-follow-up",
            json={"lifecycle_version": 2},
        )
        self.assertEqual(stale_retry.status_code, 409, stale_retry.text)
        self.assertEqual(stale_retry.json()["code"], "CONSULTATION_VERSION_CONFLICT")

    def test_reschedule_and_cancel_preserve_original_records(self):
        original = self.create_consultation()
        self.use_user(self.doctor_user)
        new_date = india_now().date() + timedelta(days=4)
        rescheduled = self.client.post(
            f"/doctor-consultations/{original['id']}/reschedule",
            json={
                "scheduled_date": new_date.isoformat(),
                "scheduled_time": "15:15:00",
                "reason": "Patient requested a later appointment",
                "lifecycle_version": 1,
            },
        )
        self.assertEqual(rescheduled.status_code, 201, rescheduled.text)
        replacement = rescheduled.json()
        self.assertEqual(replacement["origin_kind"], "rescheduled")
        self.assertEqual(replacement["origin_consultation_id"], original["id"])

        cancelled_original = self.client.get(
            f"/doctor-consultations/{original['id']}"
        ).json()
        self.assertEqual(cancelled_original["status"], "cancelled")
        self.assertEqual(cancelled_original["cancellation_code"], "rescheduled")
        self.assertEqual(
            cancelled_original["successor_consultation_id"],
            replacement["id"],
        )

        cancelled = self.client.put(
            f"/doctor-consultations/{replacement['id']}/cancel",
            json={
                "cancellation_code": "patient_cancelled",
                "reason": "Patient no longer requires the appointment",
                "lifecycle_version": replacement["lifecycle_version"],
            },
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")
        self.assertEqual(cancelled.json()["available_actions"], [])
        self.assertEqual(
            self.db.query(DoctorConsultation).count(),
            2,
        )
        self.assertEqual(
            self.db.query(DoctorConsultationEvent)
            .filter(DoctorConsultationEvent.event_type == "rescheduled")
            .count(),
            1,
        )

    def test_doctor_cannot_manage_another_doctors_consultation(self):
        consultation = self.create_consultation(doctor_id=self.other_doctor.id)
        self.use_user(self.doctor_user)
        response = self.client.put(
            f"/doctor-consultations/{consultation['id']}/cancel",
            json={
                "cancellation_code": "other",
                "reason": "Should not be authorized",
                "lifecycle_version": 1,
            },
        )
        self.assertEqual(response.status_code, 403, response.text)

    def test_inactive_doctor_cannot_receive_a_new_consultation(self):
        self.other_doctor.active = False
        self.db.commit()
        tomorrow = india_now().date() + timedelta(days=1)
        response = self.client.post(
            "/doctor-consultations/",
            json={
                "patient_name": "Lifecycle Patient",
                "patient_phone": "9000000000",
                "patient_address": "Lifecycle address",
                "doctor_id": self.other_doctor.id,
                "scheduled_date": tomorrow.isoformat(),
                "scheduled_time": "10:00:00",
                "purpose": "Initial consultation",
            },
        )
        self.assertEqual(response.status_code, 400, response.text)
        self.assertEqual(response.json()["code"], "DOCTOR_INACTIVE")


if __name__ == "__main__":
    unittest.main()

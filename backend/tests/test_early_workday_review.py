import unittest
from datetime import datetime, timedelta, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_workday import DoctorWorkDay
from app.models.domain_audit_event import DomainAuditEvent
from app.models.operational_follow_up import OperationalFollowUp
from app.models.therapist_workday import TherapistWorkDay
from app.models.user import User
from app.routers import workday_exceptions
from app.utils.auth import get_current_user
from app.utils.domain_errors import DomainHTTPException, domain_exception_handler
from app.utils.timezone import india_now


class EarlyWorkdayReviewTests(unittest.TestCase):
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
            username="Attendance Reviewer",
            email="attendance-reviewer@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Field Therapist",
            email="early-therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.doctor_user = User(
            username="Field Doctor",
            email="early-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all([self.admin, self.therapist, self.doctor_user])
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Dr Field",
            specialization="General",
        )
        self.db.add(self.doctor)
        self.db.flush()
        now = datetime.now(timezone.utc)
        today = india_now().date()
        self.therapist_day = TherapistWorkDay(
            therapist_id=self.therapist.id,
            work_date=today,
            start_latitude=13.0,
            start_longitude=77.0,
            started_at=now - timedelta(hours=4),
            ended_at=now,
            is_active=False,
            ended_early=True,
            end_reason="Family emergency required an early departure",
            early_end_review_status="pending",
            total_work_minutes=240,
            completed_schedules_count=2,
            pending_schedules_count=1,
            missed_schedules_count=0,
        )
        self.doctor_day = DoctorWorkDay(
            doctor_id=self.doctor.id,
            work_date=today,
            start_address="Clinic",
            start_latitude=13.0,
            start_longitude=77.0,
            started_at=now - timedelta(hours=5),
            ended_at=now - timedelta(minutes=10),
            is_active=False,
            ended_early=True,
            end_reason="All assigned visits were completed",
            early_end_review_status="pending",
            total_work_minutes=290,
            completed_visits_count=3,
            pending_visits_count=0,
        )
        self.db.add_all([self.therapist_day, self.doctor_day])
        self.db.commit()
        self.db.refresh(self.therapist_day)
        self.db.refresh(self.doctor_day)

        self.current_user = self.admin
        app = FastAPI()
        app.add_exception_handler(DomainHTTPException, domain_exception_handler)
        app.include_router(workday_exceptions.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_admin_lists_both_roles_and_records_reasoned_decisions(self):
        response = self.client.get("/workday-exceptions/early-closures")
        self.assertEqual(response.status_code, 200, response.text)
        rows = response.json()
        self.assertEqual({row["staff_role"] for row in rows}, {"doctor", "therapist"})
        therapist_row = next(row for row in rows if row["staff_role"] == "therapist")
        self.assertEqual(therapist_row["pending_activities"], 1)
        self.assertEqual(
            therapist_row["available_actions"],
            ["acknowledge", "require_follow_up"],
        )

        decided = self.client.put(
            f"/workday-exceptions/early-closures/therapist/{self.therapist_day.id}/decision",
            json={
                "decision": "follow_up_required",
                "reason": "Supervisor should confirm the remaining schedule reassignment.",
                "version": therapist_row["version"],
            },
        )
        self.assertEqual(decided.status_code, 200, decided.text)
        self.assertEqual(decided.json()["review_status"], "follow_up_required")
        self.assertEqual(decided.json()["reviewer_name"], self.admin.username)
        self.assertEqual(decided.json()["available_actions"], [])
        self.db.refresh(self.therapist_day)
        self.assertEqual(self.therapist_day.early_end_reviewed_by, self.admin.id)
        self.assertIsNotNone(self.therapist_day.early_end_reviewed_at)
        audit_event = self.db.query(DomainAuditEvent).filter(
            DomainAuditEvent.action == "early_closure_reviewed"
        ).one()
        self.assertEqual(audit_event.domain, "attendance")
        self.assertEqual(audit_event.action, "early_closure_reviewed")
        self.assertEqual(audit_event.to_state, "follow_up_required")
        follow_up = self.db.query(OperationalFollowUp).one()
        self.assertEqual(follow_up.source_entity_id, str(self.therapist_day.id))
        self.assertEqual(follow_up.status, "in_progress")
        self.assertEqual(follow_up.assignee_id, self.admin.id)
        self.assertEqual(follow_up.priority, "high")

        pending = self.client.get("/workday-exceptions/early-closures?status=pending")
        self.assertEqual(len(pending.json()), 1)
        follow_up = self.client.get(
            "/workday-exceptions/early-closures?status=follow_up_required"
        )
        self.assertEqual(len(follow_up.json()), 1)
        self.assertEqual(follow_up.json()[0]["staff_role"], "therapist")

    def test_role_filter_authorization_and_conflict_guards(self):
        doctors = self.client.get(
            "/workday-exceptions/early-closures?role=doctor"
        )
        self.assertEqual(doctors.status_code, 200, doctors.text)
        self.assertEqual(len(doctors.json()), 1)
        row = doctors.json()[0]
        self.assertEqual(row["staff_name"], "Dr Field")

        stale = self.client.put(
            f"/workday-exceptions/early-closures/doctor/{self.doctor_day.id}/decision",
            json={
                "decision": "acknowledged",
                "reason": "The completed assignments support this closure.",
                "version": row["version"] + 1,
            },
        )
        self.assertEqual(stale.status_code, 409, stale.text)
        self.assertEqual(stale.json()["code"], "EARLY_CLOSURE_VERSION_CONFLICT")

        decided = self.client.put(
            f"/workday-exceptions/early-closures/doctor/{self.doctor_day.id}/decision",
            json={
                "decision": "acknowledged",
                "reason": "The completed assignments support this closure.",
                "version": row["version"],
            },
        )
        self.assertEqual(decided.status_code, 200, decided.text)
        second = self.client.put(
            f"/workday-exceptions/early-closures/doctor/{self.doctor_day.id}/decision",
            json={
                "decision": "follow_up_required",
                "reason": "A second reviewer attempted to change the result.",
                "version": decided.json()["version"],
            },
        )
        self.assertEqual(second.status_code, 409, second.text)
        self.assertEqual(second.json()["code"], "EARLY_CLOSURE_ALREADY_REVIEWED")

        self.current_user = self.therapist
        forbidden = self.client.get("/workday-exceptions/early-closures")
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

    def test_follow_up_decision_reuses_an_existing_active_source_record(self):
        existing = OperationalFollowUp(
            source_domain="attendance",
            source_entity_type="therapist_workday",
            source_entity_id=str(self.therapist_day.id),
            title="Existing attendance investigation",
            priority="medium",
            status="open",
            created_by=self.admin.id,
            created_reason="Created while reviewing the exception queue.",
        )
        self.db.add(existing)
        self.db.commit()
        self.db.refresh(existing)

        response = self.client.put(
            f"/workday-exceptions/early-closures/therapist/{self.therapist_day.id}/decision",
            json={
                "decision": "follow_up_required",
                "reason": "The existing investigation should own this review.",
                "version": self.therapist_day.early_end_review_version,
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        rows = self.db.query(OperationalFollowUp).all()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].id, existing.id)
        self.assertEqual(rows[0].status, "in_progress")
        self.assertEqual(rows[0].assignee_id, self.admin.id)
        self.assertIsNotNone(rows[0].due_date)
        linked_event = self.db.query(DomainAuditEvent).filter(
            DomainAuditEvent.action == "follow_up_linked"
        ).one()
        self.assertEqual(linked_event.entity_id, str(existing.id))


if __name__ == "__main__":
    unittest.main()

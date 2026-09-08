import unittest
from datetime import date, datetime, time
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.settings import Settings
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import (
    therapist_workday,
    treatment_schedule,
    treatment_sessions,
)
from app.utils.auth import get_current_user

IST = ZoneInfo("Asia/Kolkata")


class TreatmentSessionAndWorkdayEndTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        self.therapist = User(
            username="Therapist",
            email="therapist-session@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
            base_location="Therapist base",
        )
        self.other_therapist = User(
            username="Other Therapist",
            email="other-session@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.doctor_user = User(
            username="Session Doctor User",
            email="doctor-session@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add_all(
            [self.therapist, self.other_therapist, self.doctor_user]
        )
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Session Doctor",
            specialization="General",
            phone="9999999999",
        )
        self.settings = Settings(per_km_rate=8, daily_allowance=150)
        self.policy = ReimbursementPolicy(
            version=1,
            effective_from=date(1970, 1, 1),
            per_km_rate=8,
            daily_allowance=150,
        )
        self.db.add_all(
            [
                self.doctor,
                self.settings,
                self.policy,
            ]
        )
        self.db.commit()

        app = FastAPI()
        app.include_router(therapist_workday.router)
        app.include_router(treatment_sessions.router)
        app.include_router(treatment_schedule.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.therapist
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_workday(self, *, active=True, started_at=None):
        workday = TherapistWorkDay(
            therapist_id=self.therapist.id,
            work_date=date.today(),
            start_address="Therapist base",
            start_latitude=13.0,
            start_longitude=77.0,
            started_at=started_at or datetime(2026, 7, 28, 9, 0),
            is_active=active,
        )
        self.db.add(workday)
        self.db.commit()
        self.db.refresh(workday)
        return workday

    def test_start_workday_retry_returns_existing_active_day(self):
        workday = self.create_workday()

        response = self.client.post(
            "/therapist/workday/start",
            json={
                "start_address": "Retry location",
                "start_latitude": 13.1,
                "start_longitude": 77.1,
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["workday_id"], workday.id)
        self.assertEqual(self.db.query(TherapistWorkDay).count(), 1)

    def create_schedule(
        self,
        *,
        status="scheduled",
        latitude=13.0,
        longitude=77.0,
        session_status="NOT_STARTED",
        punch_in_time=None,
    ):
        schedule = TreatmentSchedule(
            patient_name=f"Patient {status}",
            doctor_id=self.doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Physiotherapy",
            patient_address="Patient destination",
            patient_latitude=latitude,
            patient_longitude=longitude,
            schedule_type="one_time",
            treatment_date=date.today(),
            in_time=time(9, 0),
            out_time=time(10, 0),
            instructions="Instructions",
            priority="normal",
            status=status,
            session_status=session_status,
            punch_in_time=punch_in_time,
        )
        self.db.add(schedule)
        self.db.commit()
        self.db.refresh(schedule)
        return schedule

    def test_punch_in_requires_active_workday(self):
        schedule = self.create_schedule()

        response = self.client.post(
            f"/treatment-sessions/{schedule.id}/punch-in",
            json={"latitude": 13.0, "longitude": 77.0},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Start your workday", response.json()["detail"])

    def test_location_check_hides_punch_in_outside_radius(self):
        self.create_workday()
        schedule = self.create_schedule()

        response = self.client.get(
            f"/treatment-sessions/{schedule.id}",
            params={"latitude": 13.01, "longitude": 77.0},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["can_punch_in"])
        self.assertFalse(response.json()["location_verified"])
        self.assertIn("Please reach", response.json()["eligibility_message"])

    def test_punch_in_starts_once_inside_existing_radius(self):
        self.create_workday()
        schedule = self.create_schedule()

        response = self.client.post(
            f"/treatment-sessions/{schedule.id}/punch-in",
            json={
                "latitude": 13.001,
                "longitude": 77.0,
                "device_timestamp": datetime.now(IST).isoformat(),
            },
        )
        duplicate = self.client.post(
            f"/treatment-sessions/{schedule.id}/punch-in",
            json={"latitude": 13.001, "longitude": 77.0},
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["session_status"], "IN_PROGRESS")
        self.assertTrue(response.json()["can_punch_out"])
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.json()["session_status"], "IN_PROGRESS")
        self.db.expire_all()
        stored = self.db.get(TreatmentSchedule, schedule.id)
        self.assertIsNotNone(stored.punch_in_time)
        self.assertEqual(stored.punch_in_latitude, 13.001)

    def test_punch_in_rejects_a_second_active_treatment(self):
        self.create_workday()
        active_schedule = self.create_schedule(
            session_status="IN_PROGRESS",
            punch_in_time=datetime.now(),
        )
        next_schedule = self.create_schedule()

        response = self.client.post(
            f"/treatment-sessions/{next_schedule.id}/punch-in",
            json={"latitude": 13.0, "longitude": 77.0},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("active treatment", response.json()["detail"])
        self.db.refresh(active_schedule)
        self.db.refresh(next_schedule)
        self.assertEqual(active_schedule.session_status, "IN_PROGRESS")
        self.assertEqual(next_schedule.session_status, "NOT_STARTED")

    def test_punch_out_requires_punch_in(self):
        self.create_workday()
        schedule = self.create_schedule()

        response = self.client.post(
            f"/treatment-sessions/{schedule.id}/punch-out",
            data={
                "completion_notes": "Completed",
                "transport_mode": "vehicle",
                "latitude": "13.001",
                "longitude": "77.0",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Punch In is required", response.json()["detail"])

    @patch(
        "app.services.claim_service.calculate_distance_km",
        return_value=2.5,
    )
    def test_punch_out_reuses_completion_and_creates_travel(self, _distance):
        self.create_workday()
        schedule = self.create_schedule(
            session_status="IN_PROGRESS",
            punch_in_time=datetime.now(),
        )

        response = self.client.post(
            f"/treatment-sessions/{schedule.id}/punch-out",
            data={
                "completion_notes": "Patient responded well",
                "transport_mode": "vehicle",
                "latitude": "13.001",
                "longitude": "77.0",
                "device_timestamp": datetime.now(IST).isoformat(),
            },
        )
        duplicate = self.client.post(
            f"/treatment-sessions/{schedule.id}/punch-out",
            data={
                "completion_notes": "Duplicate",
                "transport_mode": "vehicle",
                "latitude": "13.001",
                "longitude": "77.0",
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "completed")
        self.assertEqual(response.json()["session_status"], "COMPLETED")
        self.assertIsNotNone(response.json()["punch_out_time"])
        self.assertGreaterEqual(response.json()["treatment_duration"], 0)
        self.assertEqual(self.db.query(TravelEntry).count(), 1)
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.json()["status"], "completed")
        self.assertEqual(self.db.query(TravelEntry).count(), 1)

    def test_missed_schedule_never_enables_session_actions(self):
        self.create_workday()
        schedule = self.create_schedule(status="missed")

        response = self.client.get(
            f"/treatment-sessions/{schedule.id}",
            params={"latitude": 13.0, "longitude": 77.0},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["can_punch_in"])
        self.assertFalse(response.json()["can_punch_out"])

    def test_end_workday_captures_summary_and_closes_attendance(self):
        workday = self.create_workday()
        self.create_schedule(status="scheduled")
        self.create_schedule(status="completed")
        self.create_schedule(status="missed")
        end_time = datetime(2026, 7, 28, 18, 5, tzinfo=IST)

        with patch(
            "app.routers.therapist_workday.india_now",
            return_value=end_time,
        ):
            response = self.client.post(
                "/therapist/workday/end",
                json={
                    "end_latitude": 13.2,
                    "end_longitude": 77.2,
                    "device_timestamp": end_time.isoformat(),
                },
            )
            duplicate = self.client.post(
                "/therapist/workday/end",
                json={"end_latitude": 13.2, "end_longitude": 77.2},
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        self.assertEqual(
            duplicate.json()["workday_id"],
            response.json()["workday_id"],
        )
        self.assertEqual(response.json()["pending_schedules_count"], 1)
        self.assertEqual(response.json()["completed_schedules_count"], 1)
        self.assertEqual(response.json()["missed_schedules_count"], 1)
        self.db.expire_all()
        stored = self.db.get(TherapistWorkDay, workday.id)
        self.assertFalse(stored.is_active)
        self.assertEqual(stored.end_latitude, 13.2)

    def test_end_workday_rejects_before_configured_time(self):
        self.create_workday()

        with patch(
            "app.routers.therapist_workday.india_now",
            return_value=datetime(2026, 7, 28, 17, 59, tzinfo=IST),
        ):
            response = self.client.post(
                "/therapist/workday/end",
                json={"end_latitude": 13.2, "end_longitude": 77.2},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("06:00 PM", response.json()["detail"])
        self.assertEqual(
            response.headers["X-Error-Code"],
            "EARLY_END_REASON_REQUIRED",
        )

    def test_end_workday_allows_audited_early_closure_reason(self):
        workday = self.create_workday()

        with patch(
            "app.routers.therapist_workday.india_now",
            return_value=datetime(2026, 7, 28, 16, 30, tzinfo=IST),
        ):
            response = self.client.post(
                "/therapist/workday/end",
                json={
                    "end_latitude": 13.2,
                    "end_longitude": 77.2,
                    "early_end_reason": "Assigned visits completed early",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(response.json()["ended_early"])
        self.assertEqual(
            response.json()["end_reason"],
            "Assigned visits completed early",
        )
        self.db.refresh(workday)
        self.assertTrue(workday.ended_early)
        self.assertEqual(
            workday.end_reason,
            "Assigned visits completed early",
        )

    def test_end_workday_rejects_active_treatment(self):
        self.create_workday()
        self.create_schedule(
            session_status="IN_PROGRESS",
            punch_in_time=datetime.now(),
        )

        with patch(
            "app.routers.therapist_workday.india_now",
            return_value=datetime(2026, 7, 28, 18, 5, tzinfo=IST),
        ):
            response = self.client.post(
                "/therapist/workday/end",
                json={"end_latitude": 13.2, "end_longitude": 77.2},
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Punch out", response.json()["detail"])


if __name__ == "__main__":
    unittest.main()

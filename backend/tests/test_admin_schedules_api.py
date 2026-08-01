import unittest
from datetime import date, time, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers.admin_schedules import router
from app.utils.auth import get_current_user


class AdminSchedulesApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        self.admin = self.create_user(
            "Administrator",
            "admin@example.com",
            "admin",
        )
        self.therapist = self.create_user(
            "Therapist One",
            "therapist@example.com",
            "therapist",
        )
        doctor_user = self.create_user(
            "Doctor Login",
            "doctor@example.com",
            "doctor",
        )
        self.doctor = Doctor(
            user_id=doctor_user.id,
            name="Dr. Meera",
            specialization="Physiotherapy",
            active=True,
        )
        self.db.add(self.doctor)
        self.db.commit()
        self.db.refresh(self.doctor)

        self.schedule = self.create_schedule(
            patient_name="Patient Alpha",
            treatment_date=date.today(),
            start=time(9, 0),
            end=time(10, 0),
            priority="high",
        )

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

    def create_user(self, username, email, role):
        user = User(
            username=username,
            email=email,
            password_hash="unused",
            role=role,
            is_active=True,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def create_schedule(
        self,
        *,
        patient_name,
        treatment_date,
        start,
        end,
        priority="normal",
    ):
        schedule = TreatmentSchedule(
            patient_name=patient_name,
            patient_reference_id="P-100",
            patient_phone="9000000000",
            doctor_id=self.doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Home physiotherapy",
            visit_type="home_visit",
            patient_address="Anna Nagar, Chennai",
            schedule_type="one_time",
            treatment_date=treatment_date,
            in_time=start,
            out_time=end,
            instructions="Follow treatment plan",
            clinical_notes="Mobility assessment",
            precautions="Fall risk",
            priority=priority,
            status="scheduled",
        )
        self.db.add(schedule)
        self.db.commit()
        self.db.refresh(schedule)
        return schedule

    def test_review_returns_operational_data_and_summary(self):
        response = self.client.get("/admin-schedules/review")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["summary"]["today"], 1)
        self.assertEqual(body["summary"]["high_priority_today"], 1)
        self.assertEqual(body["items"][0]["patient_name"], "Patient Alpha")
        self.assertEqual(body["items"][0]["duration_minutes"], 60)
        self.assertEqual(body["items"][0]["area"], "Anna Nagar")
        self.assertNotIn("transport_mode", body["items"][0])

    def test_availability_detects_overlap(self):
        response = self.client.get(
            "/admin-schedules/therapist-availability",
            params={
                "therapist_id": self.therapist.id,
                "schedule_type": "one_time",
                "treatment_date": date.today().isoformat(),
                "start_time": "09:30:00",
                "expected_end_time": "10:30:00",
            },
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertFalse(body["available"])
        self.assertEqual(body["conflicts"][0]["id"], self.schedule.id)

    def test_review_marks_conflicting_schedules(self):
        second = self.create_schedule(
            patient_name="Patient Beta",
            treatment_date=date.today(),
            start=time(9, 30),
            end=time(10, 30),
        )

        response = self.client.get("/admin-schedules/review")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["summary"]["conflicts"], 2)
        conflict_ids = {
            item["id"]
            for item in body["items"]
            if item["has_conflict"]
        }
        self.assertEqual(conflict_ids, {self.schedule.id, second.id})

    def test_form_options_are_aggregated(self):
        response = self.client.get("/admin-schedules/form-options")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["patients"][0]["name"], "Patient Alpha")
        self.assertEqual(body["doctors"][0]["name"], "Dr. Meera")
        self.assertEqual(
            body["therapists"][0]["today_appointments"],
            1,
        )

    def test_cancel_updates_schedule_status(self):
        response = self.client.put(
            f"/admin-schedules/{self.schedule.id}/cancel"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "cancelled")

    def test_upcoming_view_is_paginated(self):
        self.create_schedule(
            patient_name="Future Patient",
            treatment_date=date.today() + timedelta(days=2),
            start=time(11, 0),
            end=time(12, 0),
        )

        response = self.client.get(
            "/admin-schedules/review",
            params={"view": "upcoming", "page_size": 1},
        )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["page_size"], 1)

    def test_review_query_count_does_not_grow_per_schedule(self):
        for index in range(5):
            self.create_schedule(
                patient_name=f"Patient {index}",
                treatment_date=date.today(),
                start=time(11 + index, 0),
                end=time(12 + index, 0),
            )

        statements = []

        def record_statement(
            _connection,
            _cursor,
            statement,
            _parameters,
            _context,
            _executemany,
        ):
            statements.append(statement)

        event.listen(
            self.engine,
            "before_cursor_execute",
            record_statement,
        )
        try:
            response = self.client.get("/admin-schedules/review")
        finally:
            event.remove(
                self.engine,
                "before_cursor_execute",
                record_statement,
            )

        self.assertEqual(response.status_code, 200)
        selects = [
            statement
            for statement in statements
            if statement.lstrip().upper().startswith("SELECT")
        ]
        self.assertLessEqual(len(selects), 5)

    def test_therapist_cannot_access_admin_schedule_review(self):
        self.current_user = self.therapist

        response = self.client.get("/admin-schedules/review")

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()

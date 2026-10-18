import unittest
from datetime import date, time, timedelta
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.treatment_schedule import TreatmentSchedule
from app.models.user import User
from app.routers.doctor_schedules import router
from app.utils.auth import get_current_user


class DoctorSchedulesApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        self.therapist = self.create_user("Therapist", "t@example.com", "therapist")
        self.doctor_user = self.create_user("Doctor", "d@example.com", "doctor")
        other_user = self.create_user("Other Doctor", "o@example.com", "doctor")
        self.doctor = self.create_doctor(self.doctor_user, "Dr. Meera")
        self.other_doctor = self.create_doctor(other_user, "Dr. Other")

        self.current_user = self.doctor_user
        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
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

    def create_doctor(self, user, name):
        doctor = Doctor(
            user_id=user.id,
            name=name,
            specialization="Physiotherapy",
            active=True,
        )
        self.db.add(doctor)
        self.db.commit()
        self.db.refresh(doctor)
        return doctor

    def payload(self, **overrides):
        body = {
            "patient_name": "Patient Alpha",
            "doctor_id": self.other_doctor.id,
            "therapist_id": self.therapist.id,
            "treatment_name": "Home physiotherapy",
            "patient_address": "Anna Nagar, Chennai",
            "schedule_type": "one_time",
            "treatment_date": (date.today() + timedelta(days=1)).isoformat(),
            "in_time": time(9, 0).isoformat(),
            "out_time": time(10, 0).isoformat(),
        }
        body.update(overrides)
        return body

    def create(self, **overrides):
        with patch(
            "app.routers.treatment_schedule.resolve_patient_coordinates",
            return_value=(None, None),
        ), patch("app.routers.treatment_schedule.notify_schedule_assigned"):
            return self.client.post(
                "/doctor-schedules/create", json=self.payload(**overrides)
            )

    def test_doctor_schedule_is_forced_to_own_doctor_and_stamped(self):
        response = self.create()

        self.assertEqual(response.status_code, 200, response.text)
        schedule = self.db.query(TreatmentSchedule).one()
        self.assertEqual(schedule.doctor_id, self.doctor.id)
        self.assertEqual(schedule.created_by_id, self.doctor_user.id)
        self.assertEqual(schedule.source, "direct")
        self.assertIsNone(schedule.treatment_plan_id)

    def test_recurring_schedule_stamps_every_occurrence(self):
        start = date.today() + timedelta(days=1)
        response = self.create(
            schedule_type="recurring",
            treatment_date=None,
            start_date=start.isoformat(),
            end_date=(start + timedelta(days=2)).isoformat(),
            cadence_days=1,
        )

        self.assertEqual(response.status_code, 200, response.text)
        rows = self.db.query(TreatmentSchedule).all()
        self.assertEqual(len(rows), 3)
        self.assertTrue(all(row.source == "direct" for row in rows))
        self.assertTrue(all(row.doctor_id == self.doctor.id for row in rows))

    def test_form_options_only_lists_the_calling_doctor(self):
        response = self.client.get("/doctor-schedules/form-options")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(
            [doctor["id"] for doctor in response.json()["doctors"]],
            [self.doctor.id],
        )

    def test_other_roles_cannot_use_doctor_endpoint(self):
        self.current_user = self.therapist

        response = self.create()

        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()

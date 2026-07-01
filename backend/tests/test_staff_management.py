import unittest

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
from app.routers.doctors import router as doctors_router
from app.routers.user import router as users_router
from app.utils.auth import get_current_user


class StaffManagementTests(unittest.TestCase):
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
        self.therapist = User(
            username="Therapist One",
            email="therapist@example.com",
            password_hash="existing-hash",
            role="therapist",
            is_active=True,
        )
        self.inactive_therapist = User(
            username="Therapist Two",
            email="inactive@example.com",
            password_hash="existing-hash",
            role="therapist",
            is_active=False,
        )
        self.doctor = Doctor(
            name="Doctor One",
            specialization="General",
            phone="1234567890",
            active=True,
        )
        self.db.add_all(
            [
                self.admin,
                self.therapist,
                self.inactive_therapist,
                self.doctor,
            ]
        )
        self.db.commit()

        self.current_user = self.admin
        app = FastAPI()
        app.include_router(users_router)
        app.include_router(doctors_router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = (
            lambda: self.current_user
        )
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_management_list_includes_inactive_therapists(self):
        response = self.client.get("/therapists/manage")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 2)
        self.assertFalse(
            next(
                item
                for item in response.json()
                if item["id"] == self.inactive_therapist.id
            )["is_active"]
        )

    def test_doctor_management_list_includes_inactive_doctors(self):
        self.doctor.active = False
        self.db.commit()

        management_response = self.client.get("/doctors/manage")
        scheduling_response = self.client.get("/doctors/")

        self.assertEqual(management_response.status_code, 200)
        self.assertEqual(len(management_response.json()), 1)
        self.assertEqual(scheduling_response.json(), [])

    def test_admin_updates_therapist_profile_without_password_reset(self):
        response = self.client.put(
            f"/therapists/{self.therapist.id}",
            json={
                "username": "Updated Therapist",
                "email": "updated@example.com",
                "is_active": False,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "Updated Therapist")
        self.assertFalse(response.json()["is_active"])
        self.assertEqual(self.therapist.password_hash, "existing-hash")

    def test_admin_updates_doctor_profile(self):
        response = self.client.put(
            f"/doctors/{self.doctor.id}",
            json={
                "name": "Updated Doctor",
                "specialization": "Orthopedics",
                "phone": "9876543210",
                "active": False,
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["name"], "Updated Doctor")
        self.assertFalse(response.json()["active"])

    def test_therapist_cannot_manage_staff_profiles(self):
        self.current_user = self.therapist

        therapist_response = self.client.put(
            f"/therapists/{self.inactive_therapist.id}",
            json={
                "username": "Unauthorized",
                "email": "unauthorized@example.com",
                "is_active": True,
            },
        )
        doctor_response = self.client.put(
            f"/doctors/{self.doctor.id}",
            json={
                "name": "Unauthorized",
                "specialization": None,
                "phone": None,
                "active": True,
            },
        )

        self.assertEqual(therapist_response.status_code, 403)
        self.assertEqual(doctor_response.status_code, 403)

    def test_duplicate_email_and_doctor_name_are_rejected(self):
        duplicate_email = self.client.put(
            f"/therapists/{self.therapist.id}",
            json={
                "username": "Therapist One",
                "email": self.inactive_therapist.email,
                "is_active": True,
            },
        )
        second_doctor = Doctor(name="Doctor Two", active=True)
        self.db.add(second_doctor)
        self.db.commit()
        duplicate_name = self.client.put(
            f"/doctors/{second_doctor.id}",
            json={
                "name": self.doctor.name.lower(),
                "specialization": None,
                "phone": None,
                "active": True,
            },
        )

        self.assertEqual(duplicate_email.status_code, 400)
        self.assertEqual(duplicate_name.status_code, 400)


if __name__ == "__main__":
    unittest.main()

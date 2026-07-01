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
from app.routers.settings import router
from app.utils.auth import get_current_user


class SettingsApiTests(unittest.TestCase):
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
            username="Admin",
            email="admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Therapist",
            email="therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.db.add_all([self.admin, self.therapist])
        self.db.commit()

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

    def test_admin_can_update_settings(self):
        response = self.client.put(
            "/settings/",
            json={"per_km_rate": 8.25, "daily_allowance": 175},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["per_km_rate"], 8.25)

    def test_therapist_cannot_update_settings(self):
        self.current_user = self.therapist

        response = self.client.put(
            "/settings/",
            json={"per_km_rate": 8, "daily_allowance": 150},
        )

        self.assertEqual(response.status_code, 403)

    def test_rejects_negative_and_excess_precision(self):
        negative = self.client.put(
            "/settings/",
            json={"per_km_rate": -1, "daily_allowance": 150},
        )
        excess_precision = self.client.put(
            "/settings/",
            json={"per_km_rate": 8.125, "daily_allowance": 150},
        )

        self.assertEqual(negative.status_code, 422)
        self.assertEqual(excess_precision.status_code, 422)

    def test_authenticated_therapist_can_read_settings(self):
        self.current_user = self.therapist

        response = self.client.get("/settings/")

        self.assertEqual(response.status_code, 200)


if __name__ == "__main__":
    unittest.main()

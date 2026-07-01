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
from app.routers.notifications import router
from app.utils.auth import get_current_user


class PushTokenRegistrationTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()
        self.user = User(
            username="Therapist",
            email="therapist@example.com",
            password_hash="not-used",
            role="therapist",
            is_active=True,
        )
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        app = FastAPI()
        app.include_router(router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_register_and_refresh_push_token_for_installation(self):
        response = self.client.post(
            "/notifications/push-token",
            json={
                "push_token": "ExpoPushToken[first-device-token]",
                "installation_id": "installation-id-0001",
                "platform": "android",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_id"], self.user.id)

        refreshed_response = self.client.post(
            "/notifications/push-token",
            json={
                "push_token": "ExpoPushToken[refreshed-device-token]",
                "installation_id": "installation-id-0001",
                "platform": "android",
            },
        )

        self.assertEqual(refreshed_response.status_code, 200)
        records = self.db.query(PushToken).all()
        self.assertEqual(len(records), 1)
        self.assertEqual(
            records[0].expo_push_token,
            "ExpoPushToken[refreshed-device-token]",
        )

    def test_deactivate_push_token_for_current_user(self):
        self.client.post(
            "/notifications/push-token",
            json={
                "push_token": "ExpoPushToken[first-device-token]",
                "installation_id": "installation-id-0001",
                "platform": "android",
            },
        )

        response = self.client.request(
            "DELETE",
            "/notifications/push-token",
            json={"installation_id": "installation-id-0001"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["deactivated"])
        record = self.db.query(PushToken).one()
        self.assertFalse(record.is_active)

    def test_registration_reassigns_installation_to_signed_in_user(self):
        self.client.post(
            "/notifications/push-token",
            json={
                "push_token": "ExpoPushToken[first-device-token]",
                "installation_id": "installation-id-0001",
                "platform": "android",
            },
        )
        second_user = User(
            username="Second Therapist",
            email="second@example.com",
            password_hash="not-used",
            role="therapist",
            is_active=True,
        )
        self.db.add(second_user)
        self.db.commit()
        self.db.refresh(second_user)
        self.user = second_user

        response = self.client.post(
            "/notifications/push-token",
            json={
                "push_token": "ExpoPushToken[first-device-token]",
                "installation_id": "installation-id-0001",
                "platform": "android",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user_id"], second_user.id)
        self.assertEqual(self.db.query(PushToken).count(), 1)


if __name__ == "__main__":
    unittest.main()

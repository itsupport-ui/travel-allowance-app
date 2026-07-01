import unittest
from unittest.mock import patch

import requests
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models.claim import Claim
from app.models.doctor import Doctor
from app.models.push_token import PushToken
from app.models.settings import Settings
from app.models.therapist_workday import TherapistWorkDay
from app.models.treatment_schedule import TreatmentSchedule
from app.models.travel import TravelEntry
from app.models.user import User
from app.services.push_notification_service import send_user_notification


class FakeResponse:
    def __init__(self, tickets, status_code=200):
        self._tickets = tickets
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f"HTTP {self.status_code}")

    def json(self):
        return {"data": self._tickets}


class FakeHttpSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []
        self.closed = False

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        response = self.responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def close(self):
        self.closed = True


class PushNotificationServiceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        db = self.session_factory()
        user = User(
            username="Therapist",
            email="push@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        db.add(user)
        db.flush()
        self.user_id = user.id
        db.add(
            PushToken(
                user_id=user.id,
                installation_id="installation-id-0001",
                expo_push_token="ExpoPushToken[test-token-0001]",
                platform="android",
                is_active=True,
            )
        )
        db.commit()
        db.close()

    def tearDown(self):
        self.engine.dispose()

    def test_sends_typed_payload_to_active_token(self):
        http = FakeHttpSession([FakeResponse([{"status": "ok"}])])

        sent = send_user_notification(
            self.user_id,
            title="Schedule Assigned",
            body="Open the schedule.",
            data={"type": "schedule_assigned", "schedule_id": 42},
            session_factory=self.session_factory,
            http_session=http,
        )

        self.assertEqual(sent, 1)
        self.assertEqual(len(http.calls), 1)
        messages = http.calls[0][1]["json"]
        self.assertEqual(messages[0]["data"]["schedule_id"], 42)
        self.assertEqual(messages[0]["channelId"], "general")

    def test_deactivates_device_not_registered_token(self):
        http = FakeHttpSession(
            [
                FakeResponse(
                    [
                        {
                            "status": "error",
                            "details": {
                                "error": "DeviceNotRegistered",
                            },
                        }
                    ]
                )
            ]
        )

        sent = send_user_notification(
            self.user_id,
            title="Claim Approved",
            body="Your claim was approved.",
            data={"type": "claim_approved", "claim_id": 7},
            session_factory=self.session_factory,
            http_session=http,
        )

        self.assertEqual(sent, 0)
        db = self.session_factory()
        token = db.query(PushToken).one()
        self.assertFalse(token.is_active)
        db.close()

    @patch("app.services.push_notification_service.time.sleep")
    def test_retries_timeout(self, sleep_mock):
        http = FakeHttpSession(
            [
                requests.Timeout("timeout"),
                FakeResponse([{"status": "ok"}]),
            ]
        )

        sent = send_user_notification(
            self.user_id,
            title="Schedule Updated",
            body="A schedule changed.",
            data={"type": "schedule_updated", "schedule_id": 5},
            session_factory=self.session_factory,
            http_session=http,
        )

        self.assertEqual(sent, 1)
        self.assertEqual(len(http.calls), 2)
        sleep_mock.assert_called_once()

    def test_inactive_tokens_are_not_sent(self):
        db = self.session_factory()
        token = db.query(PushToken).one()
        token.is_active = False
        db.commit()
        db.close()
        http = FakeHttpSession([])

        sent = send_user_notification(
            self.user_id,
            title="Ignored",
            body="Ignored",
            data={"type": "schedule_updated", "schedule_id": 1},
            session_factory=self.session_factory,
            http_session=http,
        )

        self.assertEqual(sent, 0)
        self.assertEqual(http.calls, [])

    def test_batches_at_most_one_hundred_messages(self):
        db = self.session_factory()
        db.add_all(
            [
                PushToken(
                    user_id=self.user_id,
                    installation_id=f"installation-id-{index:04d}",
                    expo_push_token=f"ExpoPushToken[test-token-{index:04d}]",
                    platform="android",
                    is_active=True,
                )
                for index in range(2, 102)
            ]
        )
        db.commit()
        db.close()
        http = FakeHttpSession(
            [
                FakeResponse([{"status": "ok"}] * 100),
                FakeResponse([{"status": "ok"}]),
            ]
        )

        sent = send_user_notification(
            self.user_id,
            title="Schedule Updated",
            body="A schedule changed.",
            data={"type": "schedule_updated", "schedule_id": 5},
            session_factory=self.session_factory,
            http_session=http,
        )

        self.assertEqual(sent, 101)
        self.assertEqual(
            [len(call[1]["json"]) for call in http.calls],
            [100, 1],
        )

    @patch("app.services.push_notification_service.time.sleep")
    def test_network_failure_is_contained(self, _sleep_mock):
        http = FakeHttpSession(
            [
                requests.ConnectionError("offline"),
                requests.ConnectionError("offline"),
                requests.ConnectionError("offline"),
            ]
        )

        sent = send_user_notification(
            self.user_id,
            title="Claim Approved",
            body="Your claim was approved.",
            data={"type": "claim_approved", "claim_id": 9},
            session_factory=self.session_factory,
            http_session=http,
        )

        self.assertEqual(sent, 0)


if __name__ == "__main__":
    unittest.main()

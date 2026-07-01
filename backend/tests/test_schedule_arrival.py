import tempfile
import unittest
from datetime import date, time
from pathlib import Path
from unittest.mock import patch

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
from app.routers import treatment_schedule
from app.services import claim_service
from app.services.schedule_location_service import GEOCODING_FAILURE_MESSAGE
from app.utils.auth import get_current_user
from backfill_schedule_coordinates import backfill_schedule_coordinates


class ScheduleArrivalApiTests(unittest.TestCase):
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
            password_hash="not-used",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Therapist",
            email="therapist@example.com",
            password_hash="not-used",
            role="therapist",
            is_active=True,
            base_location="Therapist origin",
        )
        self.doctor = Doctor(
            name="Doctor",
            specialization="General",
            phone="1234567890",
        )
        self.settings = Settings(per_km_rate=8, daily_allowance=150)
        self.db.add_all(
            [self.admin, self.therapist, self.doctor, self.settings]
        )
        self.db.commit()

        app = FastAPI()
        app.include_router(treatment_schedule.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.admin
        self.app = app
        self.client = TestClient(app)
        self.temporary_uploads = tempfile.TemporaryDirectory()
        self.original_upload_root = claim_service.UPLOAD_ROOT
        claim_service.UPLOAD_ROOT = Path(self.temporary_uploads.name)

    def tearDown(self):
        claim_service.UPLOAD_ROOT = self.original_upload_root
        self.temporary_uploads.cleanup()
        self.db.close()
        self.engine.dispose()

    def use_user(self, user):
        self.app.dependency_overrides[get_current_user] = lambda: user

    def schedule_payload(self, address="Patient destination"):
        return {
            "patient_name": "Patient",
            "doctor_id": self.doctor.id,
            "therapist_id": self.therapist.id,
            "treatment_name": "Physiotherapy",
            "medicines": None,
            "patient_address": address,
            "schedule_type": "one_time",
            "treatment_date": date.today().isoformat(),
            "start_date": None,
            "end_date": None,
            "in_time": "09:00:00",
            "out_time": "10:00:00",
            "instructions": "Instructions",
            "priority": "normal",
            "transport_mode": "vehicle",
        }

    def create_schedule(
        self,
        *,
        latitude=13.0,
        longitude=77.0,
        status="scheduled",
    ):
        schedule = TreatmentSchedule(
            patient_name="Patient",
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
            transport_mode="vehicle",
        )
        self.db.add(schedule)
        self.db.commit()
        return schedule

    @patch(
        "app.routers.treatment_schedule.resolve_patient_coordinates",
        return_value=(13.0, 77.0),
    )
    def test_create_schedule_stores_geocoded_coordinates(self, geocode):
        response = self.client.post(
            "/schedule/create",
            json=self.schedule_payload(),
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["patient_latitude"], 13.0)
        self.assertEqual(response.json()["patient_longitude"], 77.0)
        geocode.assert_called_once_with("Patient destination")

    @patch(
        "app.routers.treatment_schedule.resolve_patient_coordinates",
        side_effect=ValueError(GEOCODING_FAILURE_MESSAGE),
    )
    def test_create_schedule_rejects_unresolved_address(self, geocode):
        response = self.client.post(
            "/schedule/create",
            json=self.schedule_payload(),
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], GEOCODING_FAILURE_MESSAGE)
        self.assertEqual(self.db.query(TreatmentSchedule).count(), 0)

    @patch(
        "app.routers.treatment_schedule.resolve_patient_coordinates"
    )
    def test_update_unchanged_address_reuses_coordinates(self, geocode):
        schedule = self.create_schedule()

        response = self.client.put(
            f"/schedule/{schedule.id}",
            json=self.schedule_payload(),
        )

        self.assertEqual(response.status_code, 200, response.text)
        geocode.assert_not_called()
        self.assertEqual(response.json()["patient_latitude"], 13.0)

    @patch(
        "app.routers.treatment_schedule.resolve_patient_coordinates",
        side_effect=ValueError(GEOCODING_FAILURE_MESSAGE),
    )
    def test_failed_address_update_preserves_schedule(self, geocode):
        schedule = self.create_schedule()

        response = self.client.put(
            f"/schedule/{schedule.id}",
            json=self.schedule_payload("Unresolvable address"),
        )

        self.assertEqual(response.status_code, 400)
        self.db.expire_all()
        stored = self.db.get(TreatmentSchedule, schedule.id)
        self.assertEqual(stored.patient_address, "Patient destination")
        self.assertEqual(stored.patient_latitude, 13.0)

    @patch("app.services.claim_service.calculate_distance_km")
    def test_far_arrival_is_rejected_before_routes(self, calculate_distance):
        schedule = self.create_schedule()
        self.use_user(self.therapist)

        response = self.client.put(
            f"/schedule/{schedule.id}/complete",
            data={
                "completion_notes": "Completed",
                "transport_mode": "vehicle",
                "arrival_latitude": "13.01",
                "arrival_longitude": "77.0",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Please reach", response.json()["detail"])
        calculate_distance.assert_not_called()
        self.db.expire_all()
        self.assertEqual(self.db.get(TreatmentSchedule, schedule.id).status, "scheduled")
        self.assertEqual(self.db.query(TravelEntry).count(), 0)

    @patch(
        "app.services.claim_service.calculate_distance_km",
        return_value=2.5,
    )
    def test_near_arrival_completes_once(self, calculate_distance):
        schedule = self.create_schedule()
        self.use_user(self.therapist)

        with patch.object(self.db, "commit", wraps=self.db.commit) as commit:
            response = self.client.put(
                f"/schedule/{schedule.id}/complete",
                data={
                    "completion_notes": "Completed",
                    "transport_mode": "vehicle",
                    "arrival_latitude": "13.001",
                    "arrival_longitude": "77.0",
                },
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "completed")
        self.assertEqual(self.db.query(TravelEntry).count(), 1)
        self.assertEqual(commit.call_count, 1)
        calculate_distance.assert_called_once()

    @patch("app.services.claim_service.calculate_distance_km")
    def test_missing_stored_coordinates_block_completion(
        self,
        calculate_distance,
    ):
        schedule = self.create_schedule(latitude=None, longitude=None)
        self.use_user(self.therapist)

        response = self.client.put(
            f"/schedule/{schedule.id}/complete",
            data={
                "completion_notes": "Completed",
                "transport_mode": "vehicle",
                "arrival_latitude": "13.0",
                "arrival_longitude": "77.0",
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("has not been configured", response.json()["detail"])
        calculate_distance.assert_not_called()

    @patch(
        "app.services.claim_service.calculate_distance_km",
        return_value=2.5,
    )
    def test_commit_failure_rolls_back_and_removes_invoice(
        self,
        calculate_distance,
    ):
        schedule = self.create_schedule()
        self.use_user(self.therapist)

        with patch.object(
            self.db,
            "commit",
            side_effect=RuntimeError("commit failed"),
        ):
            response = self.client.put(
                f"/schedule/{schedule.id}/complete",
                data={
                    "completion_notes": "Completed",
                    "transport_mode": "cab",
                    "bill_amount": "100",
                    "arrival_latitude": "13.001",
                    "arrival_longitude": "77.0",
                },
                files={
                    "invoice_file": (
                        "invoice.pdf",
                        b"invoice",
                        "application/pdf",
                    )
                },
            )

        self.assertEqual(response.status_code, 500)
        self.db.expire_all()
        self.assertEqual(self.db.get(TreatmentSchedule, schedule.id).status, "scheduled")
        self.assertEqual(self.db.query(TravelEntry).count(), 0)
        self.assertEqual(list(Path(self.temporary_uploads.name).iterdir()), [])

    @patch(
        "backfill_schedule_coordinates.resolve_patient_coordinates",
        return_value=(13.0, 77.0),
    )
    def test_coordinate_backfill_is_idempotent(self, geocode):
        schedule = self.create_schedule(latitude=None, longitude=None)

        self.assertEqual(backfill_schedule_coordinates(self.db), 1)
        self.assertEqual(backfill_schedule_coordinates(self.db), 0)
        self.db.refresh(schedule)
        self.assertEqual(schedule.patient_latitude, 13.0)
        self.assertEqual(schedule.patient_longitude, 77.0)
        geocode.assert_called_once_with("Patient destination")

    @patch(
        "backfill_schedule_coordinates.resolve_patient_coordinates",
        side_effect=[
            (13.0, 77.0),
            ValueError(GEOCODING_FAILURE_MESSAGE),
        ],
    )
    def test_coordinate_backfill_aborts_without_partial_updates(self, geocode):
        first = self.create_schedule(latitude=None, longitude=None)
        second = self.create_schedule(latitude=None, longitude=None)
        second.patient_address = "Unresolvable address"
        self.db.commit()

        with self.assertRaisesRegex(RuntimeError, "backfill aborted"):
            backfill_schedule_coordinates(self.db)

        self.db.expire_all()
        self.assertIsNone(self.db.get(TreatmentSchedule, first.id).patient_latitude)
        self.assertIsNone(self.db.get(TreatmentSchedule, second.id).patient_latitude)


if __name__ == "__main__":
    unittest.main()

import io
import tempfile
import unittest
from datetime import date, time
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

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
from app.services import claim_service
from app.services.claim_service import create_auto_travel_entry


class AutoTravelEntryTests(unittest.TestCase):
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
            email="therapist@example.com",
            password_hash="not-used",
            role="therapist",
            is_active=True,
            base_location="Fallback origin",
        )
        self.doctor = Doctor(
            name="Doctor",
            specialization="General",
            phone="1234567890",
        )
        self.settings = Settings(per_km_rate=8, daily_allowance=150)
        self.db.add_all([self.therapist, self.doctor, self.settings])
        self.db.commit()

        self.workday = TherapistWorkDay(
            therapist_id=self.therapist.id,
            work_date=date.today(),
            start_address="Workday origin",
            start_latitude=13.0,
            start_longitude=77.0,
            is_active=True,
        )
        self.schedule = TreatmentSchedule(
            patient_name="Patient",
            doctor_id=self.doctor.id,
            therapist_id=self.therapist.id,
            treatment_name="Physiotherapy",
            patient_address="Patient destination",
            patient_latitude=13.0,
            patient_longitude=77.0,
            schedule_type="one_time",
            treatment_date=date.today(),
            in_time=time(9, 0),
            out_time=time(10, 0),
            status="scheduled",
        )
        self.db.add_all([self.workday, self.schedule])
        self.db.commit()

        self.temporary_uploads = tempfile.TemporaryDirectory()
        self.original_upload_root = claim_service.UPLOAD_ROOT
        claim_service.UPLOAD_ROOT = Path(self.temporary_uploads.name)

    def tearDown(self):
        claim_service.UPLOAD_ROOT = self.original_upload_root
        self.temporary_uploads.cleanup()
        self.db.close()
        self.engine.dispose()

    @patch("app.services.claim_service.calculate_distance_km", return_value=0.0)
    def test_zero_distance_creates_zero_fare_entry(self, calculate_distance):
        travel_entry = create_auto_travel_entry(
            db=self.db,
            schedule=self.schedule,
            therapist=self.therapist,
            arrival_latitude=13.0,
            arrival_longitude=77.0,
        )

        self.assertEqual(travel_entry.total_km, 0.0)
        self.assertEqual(travel_entry.travel_fare, 0.0)
        self.assertEqual(travel_entry.schedule_id, self.schedule.id)
        calculate_distance.assert_called_once_with(
            from_address="Workday origin",
            to_address="Patient destination",
            from_latitude=13.0,
            from_longitude=77.0,
            to_latitude=13.0,
            to_longitude=77.0,
        )

    @patch("app.services.claim_service.calculate_distance_km")
    def test_missing_patient_coordinates_stop_before_routes(self, calculate_distance):
        self.schedule.patient_latitude = None
        self.schedule.patient_longitude = None

        with self.assertRaisesRegex(
            ValueError,
            "Patient location has not been configured",
        ):
            create_auto_travel_entry(
                db=self.db,
                schedule=self.schedule,
                therapist=self.therapist,
                arrival_latitude=13.0,
                arrival_longitude=77.0,
            )

        calculate_distance.assert_not_called()
        self.assertEqual(self.db.query(TravelEntry).count(), 0)

    @patch("app.services.claim_service.calculate_distance_km")
    def test_arrival_beyond_250_metres_stops_before_routes(
        self,
        calculate_distance,
    ):
        with self.assertRaisesRegex(ValueError, "Please reach"):
            create_auto_travel_entry(
                db=self.db,
                schedule=self.schedule,
                therapist=self.therapist,
                arrival_latitude=13.01,
                arrival_longitude=77.0,
            )

        calculate_distance.assert_not_called()
        self.assertEqual(self.db.query(TravelEntry).count(), 0)

    @patch("app.services.claim_service.calculate_distance_km", return_value=1.5)
    def test_arrival_within_250_metres_is_allowed(self, calculate_distance):
        travel_entry = create_auto_travel_entry(
            db=self.db,
            schedule=self.schedule,
            therapist=self.therapist,
            arrival_latitude=13.001,
            arrival_longitude=77.0,
        )

        self.assertEqual(travel_entry.total_km, 1.5)
        calculate_distance.assert_called_once()

    @patch("app.services.claim_service.calculate_distance_km", return_value=1.0)
    def test_duplicate_schedule_travel_is_rejected(self, calculate_distance):
        create_auto_travel_entry(
            db=self.db,
            schedule=self.schedule,
            therapist=self.therapist,
            arrival_latitude=13.0,
            arrival_longitude=77.0,
        )

        with self.assertRaisesRegex(ValueError, "already exists"):
            create_auto_travel_entry(
                db=self.db,
                schedule=self.schedule,
                therapist=self.therapist,
                arrival_latitude=13.0,
                arrival_longitude=77.0,
            )

        self.assertEqual(self.db.query(TravelEntry).count(), 1)

    @patch("app.services.claim_service.calculate_distance_km", return_value=1.0)
    def test_invoice_is_removed_when_flush_fails(self, calculate_distance):
        invoice = SimpleNamespace(
            filename="invoice.pdf",
            file=io.BytesIO(b"invoice"),
        )

        with patch.object(
            self.db,
            "flush",
            side_effect=RuntimeError("flush failed"),
        ):
            with self.assertRaisesRegex(RuntimeError, "flush failed"):
                create_auto_travel_entry(
                    db=self.db,
                    schedule=self.schedule,
                    therapist=self.therapist,
                    arrival_latitude=13.0,
                    arrival_longitude=77.0,
                    transport_mode="cab",
                    bill_amount=100,
                    invoice_file=invoice,
                )

        self.assertEqual(list(Path(self.temporary_uploads.name).iterdir()), [])


if __name__ == "__main__":
    unittest.main()

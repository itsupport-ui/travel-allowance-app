import unittest
from datetime import date
from unittest.mock import call, patch

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
from app.routers import claims, therapist_workday, treatment_schedule, travel
from app.utils.auth import get_current_user


class ThreePatientDayFlowTests(unittest.TestCase):
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
            base_location="Fallback origin",
        )
        self.doctor = Doctor(
            name="Doctor",
            specialization="General",
            phone="1234567890",
        )
        self.settings = Settings(per_km_rate=8.0, daily_allowance=150.0)
        self.db.add_all(
            [self.admin, self.therapist, self.doctor, self.settings]
        )
        self.db.commit()

        app = FastAPI()
        app.include_router(therapist_workday.router)
        app.include_router(treatment_schedule.router)
        app.include_router(travel.router)
        app.include_router(claims.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.admin
        self.app = app
        self.client = TestClient(app)

        self.start_address = "Workday Start"
        self.start_coordinates = (13.0000, 77.0000)
        self.patient_addresses = [
            "Patient Address 1",
            "Patient Address 2",
            "Patient Address 3",
        ]
        self.patient_coordinates = [
            (13.0100, 77.0100),
            (13.0200, 77.0200),
            (13.0300, 77.0300),
        ]
        self.route_distances = [4.25, 3.50, 5.75]

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def use_user(self, user):
        self.app.dependency_overrides[get_current_user] = lambda: user

    def schedule_payload(self, index):
        return {
            "patient_name": f"Patient {index + 1}",
            "doctor_id": self.doctor.id,
            "therapist_id": self.therapist.id,
            "treatment_name": "Physiotherapy",
            "medicines": None,
            "patient_address": self.patient_addresses[index],
            "schedule_type": "one_time",
            "treatment_date": date.today().isoformat(),
            "start_date": None,
            "end_date": None,
            "in_time": f"{9 + index:02d}:00:00",
            "out_time": f"{10 + index:02d}:00:00",
            "instructions": "Test treatment",
            "priority": "normal",
            "transport_mode": "vehicle",
        }

    @patch(
        "app.services.claim_service.calculate_distance_km",
        side_effect=[4.25, 3.50, 5.75],
    )
    def test_complete_three_patients_and_submit_claim(self, calculate_distance):
        coordinate_lookup = dict(
            zip(self.patient_addresses, self.patient_coordinates)
        )

        with patch(
            "app.routers.treatment_schedule.resolve_patient_coordinates",
            side_effect=lambda address: coordinate_lookup[address],
        ):
            schedules = []
            for index in range(3):
                response = self.client.post(
                    "/schedule/create",
                    json=self.schedule_payload(index),
                )
                self.assertEqual(response.status_code, 200, response.text)
                schedules.append(response.json())

        self.use_user(self.therapist)
        workday_response = self.client.post(
            "/therapist/workday/start",
            json={
                "start_address": self.start_address,
                "start_latitude": self.start_coordinates[0],
                "start_longitude": self.start_coordinates[1],
            },
        )
        self.assertEqual(workday_response.status_code, 200)

        for index, schedule in enumerate(schedules):
            latitude, longitude = self.patient_coordinates[index]
            completion_response = self.client.put(
                f"/schedule/{schedule['id']}/complete",
                data={
                    "completion_notes": f"Completed patient {index + 1}",
                    "transport_mode": "vehicle",
                    "arrival_latitude": str(latitude),
                    "arrival_longitude": str(longitude),
                },
            )
            self.assertEqual(
                completion_response.status_code,
                200,
                completion_response.text,
            )
            self.assertEqual(completion_response.json()["status"], "completed")

            today_response = self.client.get("/travel/today")
            self.assertEqual(today_response.status_code, 200)
            self.assertEqual(len(today_response.json()), index + 1)

        travels = sorted(
            self.client.get("/travel/today").json(),
            key=lambda item: item["id"],
        )
        expected_from_addresses = [
            self.start_address,
            self.patient_addresses[0],
            self.patient_addresses[1],
        ]
        expected_fares = [34.0, 28.0, 46.0]

        self.assertEqual(len(travels), 3)
        for index, item in enumerate(travels):
            self.assertEqual(item["schedule_id"], schedules[index]["id"])
            self.assertEqual(item["patient_name"], f"Patient {index + 1}")
            self.assertEqual(item["from_address"], expected_from_addresses[index])
            self.assertEqual(item["to_address"], self.patient_addresses[index])
            self.assertEqual(item["total_km"], self.route_distances[index])
            self.assertEqual(item["per_km_rate"], 8.0)
            self.assertEqual(item["travel_fare"], expected_fares[index])
            self.assertEqual(item["arrival_latitude"], self.patient_coordinates[index][0])
            self.assertEqual(item["arrival_longitude"], self.patient_coordinates[index][1])
            self.assertTrue(item["patient_visited"])

        calculate_distance.assert_has_calls(
            [
                call(
                    from_address=self.start_address,
                    to_address=self.patient_addresses[0],
                    from_latitude=self.start_coordinates[0],
                    from_longitude=self.start_coordinates[1],
                    to_latitude=self.patient_coordinates[0][0],
                    to_longitude=self.patient_coordinates[0][1],
                ),
                call(
                    from_address=self.patient_addresses[0],
                    to_address=self.patient_addresses[1],
                    from_latitude=self.patient_coordinates[0][0],
                    from_longitude=self.patient_coordinates[0][1],
                    to_latitude=self.patient_coordinates[1][0],
                    to_longitude=self.patient_coordinates[1][1],
                ),
                call(
                    from_address=self.patient_addresses[1],
                    to_address=self.patient_addresses[2],
                    from_latitude=self.patient_coordinates[1][0],
                    from_longitude=self.patient_coordinates[1][1],
                    to_latitude=self.patient_coordinates[2][0],
                    to_longitude=self.patient_coordinates[2][1],
                ),
            ]
        )

        with patch.object(self.db, "commit", wraps=self.db.commit) as commit:
            claim_response = self.client.post("/claims/submit")

        self.assertEqual(claim_response.status_code, 200, claim_response.text)
        self.assertEqual(commit.call_count, 1)
        claim = claim_response.json()
        self.assertEqual(claim["total_km"], 13.5)
        self.assertEqual(claim["per_km_rate"], 8.0)
        self.assertEqual(claim["travel_total"], 108.0)
        self.assertEqual(claim["daily_allowance"], 150.0)
        self.assertEqual(claim["grand_total"], 258.0)
        self.assertEqual(claim["status"], "pending")

        self.settings.per_km_rate = 99.0
        self.db.commit()

        my_claims = self.client.get("/claims/my").json()
        self.assertEqual(len(my_claims), 1)
        self.assertEqual(my_claims[0]["per_km_rate"], 8.0)
        self.assertEqual(my_claims[0]["patient_count"], 3)

        details = self.client.get(
            f"/claims/{claim['id']}/details"
        ).json()
        self.assertEqual(details["claim"]["grand_total"], 258.0)
        self.assertEqual(len(details["travels"]), 3)
        self.assertTrue(
            all(
                item.claim_id == claim["id"]
                for item in self.db.query(TravelEntry).all()
            )
        )

        self.use_user(self.admin)
        self.assertEqual(
            self.client.get("/claims/pending").json()[0]["per_km_rate"],
            8.0,
        )
        self.assertEqual(
            self.client.get("/claims/all").json()[0]["per_km_rate"],
            8.0,
        )

        self.use_user(self.therapist)
        duplicate_response = self.client.post("/claims/submit")
        self.assertEqual(duplicate_response.status_code, 400)
        self.assertEqual(
            duplicate_response.json()["detail"],
            "Claim for today already submitted",
        )

    def test_claim_commit_failure_does_not_leave_partial_links(self):
        travel_entry = TravelEntry(
            therapist_id=self.therapist.id,
            travel_date=date.today(),
            from_address="Origin",
            to_address="Destination",
            total_km=2.5,
            per_km_rate=8.0,
            travel_fare=20.0,
            patient_visited=True,
            patient_name="Patient",
            transport_mode="vehicle",
            status="draft",
        )
        self.db.add(travel_entry)
        self.db.commit()
        self.use_user(self.therapist)

        with patch.object(
            self.db,
            "commit",
            side_effect=RuntimeError("commit failed"),
        ):
            response = self.client.post("/claims/submit")

        self.assertEqual(response.status_code, 500)
        self.db.expire_all()
        self.assertEqual(self.db.query(Claim).count(), 0)
        self.assertIsNone(self.db.get(TravelEntry, travel_entry.id).claim_id)


if __name__ == "__main__":
    unittest.main()

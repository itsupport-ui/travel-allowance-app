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
from app.models.doctor_expense import DoctorExpense
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.user import User
from app.routers import (
    doctor_expense,
    doctor_visit_sessions,
    doctor_workday,
)
from app.utils.auth import get_current_user


IST = ZoneInfo("Asia/Kolkata")


class DoctorAttendanceTravelExpenseTests(unittest.TestCase):
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
            username="Doctor",
            email="doctor-attendance@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.db.add(self.user)
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.user.id,
            name="Doctor Attendance",
            specialization="General",
            phone="9999999999",
        )
        self.db.add(self.doctor)
        self.db.commit()

        app = FastAPI()
        app.include_router(doctor_workday.router)
        app.include_router(doctor_visit_sessions.router)
        app.include_router(doctor_expense.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_visit(self, **values):
        visit = DoctorVisit(
            patient_name="Patient One",
            patient_phone="9999999998",
            patient_address="Patient destination",
            patient_latitude=13.0,
            patient_longitude=77.0,
            doctor_id=self.doctor.id,
            visit_date=date.today(),
            visit_time=time(9, 30),
            status="scheduled",
            session_status="NOT_STARTED",
            created_by=self.user.id,
            **values,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def start_workday(self):
        response = self.client.post(
            "/doctor/workday/start",
            json={
                "start_address": "Doctor starting location",
                "start_latitude": 12.99,
                "start_longitude": 77.0,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response

    def test_start_workday_creates_first_waypoint_once(self):
        first = self.start_workday()
        duplicate = self.client.post(
            "/doctor/workday/start",
            json={
                "start_address": "Another location",
                "start_latitude": 12.99,
                "start_longitude": 77.0,
            },
        )

        self.assertGreater(first.json()["workday_id"], 0)
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(self.db.query(DoctorWorkDay).count(), 1)
        waypoint = self.db.query(DoctorTravelWaypoint).one()
        self.assertEqual(waypoint.waypoint_type, "START")

    def test_punch_in_requires_workday_and_geofence(self):
        visit = self.create_visit()
        no_workday = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={"latitude": 13.0, "longitude": 77.0},
        )
        self.start_workday()
        outside = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={"latitude": 13.01, "longitude": 77.0},
        )

        self.assertEqual(no_workday.status_code, 400)
        self.assertEqual(outside.status_code, 400)
        self.assertIn("away", outside.json()["detail"])

    @patch(
        "app.services.doctor_attendance_service.calculate_distance_km",
        return_value=4.2,
    )
    def test_punch_in_and_out_build_visit_waypoint(self, _distance):
        self.start_workday()
        visit = self.create_visit()

        punched_in = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={"latitude": 13.001, "longitude": 77.0},
        )
        duplicate = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={"latitude": 13.001, "longitude": 77.0},
        )
        punched_out = self.client.post(
            f"/doctor-visits/{visit.id}/punch-out",
            json={
                "latitude": 13.001,
                "longitude": 77.0,
                "remarks": "Consultation completed",
            },
        )
        duplicate_out = self.client.post(
            f"/doctor-visits/{visit.id}/punch-out",
            json={"latitude": 13.001, "longitude": 77.0},
        )

        self.assertEqual(punched_in.status_code, 200, punched_in.text)
        self.assertEqual(punched_in.json()["session_status"], "IN_PROGRESS")
        self.assertEqual(duplicate.status_code, 400)
        self.assertEqual(punched_out.status_code, 200, punched_out.text)
        self.assertEqual(punched_out.json()["session_status"], "COMPLETED")
        self.assertEqual(punched_out.json()["visit_status"], "visited")
        self.assertEqual(duplicate_out.status_code, 400)
        self.assertEqual(self.db.query(DoctorTravelWaypoint).count(), 2)

    def test_punch_out_requires_punch_in(self):
        self.start_workday()
        visit = self.create_visit()

        response = self.client.post(
            f"/doctor-visits/{visit.id}/punch-out",
            json={"latitude": 13.0, "longitude": 77.0},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Punch In", response.json()["detail"])

    @patch(
        "app.services.doctor_attendance_service.calculate_distance_km",
        return_value=4.2,
    )
    def test_completed_visit_prefills_and_links_expense(self, _distance):
        self.start_workday()
        visit = self.create_visit()
        self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={"latitude": 13.001, "longitude": 77.0},
        )
        self.client.post(
            f"/doctor-visits/{visit.id}/punch-out",
            json={"latitude": 13.001, "longitude": 77.0},
        )

        options = self.client.get("/doctor-visits/today/completed")
        expense = self.client.post(
            "/doctor-expenses/",
            data={
                "expense_date": date.today().isoformat(),
                "visit_id": str(visit.id),
                "transport_mode": "car",
                "fare": "150",
                "remarks": "Parking included",
            },
        )
        duplicate = self.client.post(
            "/doctor-expenses/",
            data={
                "expense_date": date.today().isoformat(),
                "visit_id": str(visit.id),
                "transport_mode": "car",
                "fare": "150",
            },
        )

        self.assertEqual(options.status_code, 200, options.text)
        self.assertEqual(len(options.json()), 1)
        self.assertEqual(options.json()[0]["distance_km"], 4.2)
        self.assertEqual(expense.status_code, 201, expense.text)
        self.assertEqual(expense.json()["visit_id"], visit.id)
        self.assertEqual(expense.json()["distance_km"], 4.2)
        self.assertEqual(duplicate.status_code, 400)
        stored = self.db.query(DoctorExpense).one()
        self.assertIsNotNone(stored.workday_id)
        self.assertIsNotNone(stored.from_waypoint_id)
        self.assertIsNotNone(stored.to_waypoint_id)

    @patch(
        "app.routers.doctor_workday.india_now",
        return_value=datetime(2026, 7, 28, 18, 5, tzinfo=IST),
    )
    def test_end_workday_appends_final_waypoint_and_counts_visits(
        self,
        _now,
    ):
        workday = DoctorWorkDay(
            doctor_id=self.doctor.id,
            work_date=date(2026, 7, 28),
            start_address="Start",
            start_latitude=13.0,
            start_longitude=77.0,
            started_at=datetime(2026, 7, 28, 3, 30),
            is_active=True,
        )
        self.db.add(workday)
        self.db.flush()
        self.db.add(
            DoctorTravelWaypoint(
                doctor_id=self.doctor.id,
                workday_id=workday.id,
                waypoint_type="START",
                sequence_number=1,
                address="Start",
                latitude=13.0,
                longitude=77.0,
                recorded_at=datetime(2026, 7, 28, 3, 30),
            )
        )
        self.db.add_all(
            [
                DoctorVisit(
                    patient_name="Completed",
                    patient_phone="1",
                    patient_address="A",
                    doctor_id=self.doctor.id,
                    visit_date=date(2026, 7, 28),
                    visit_time=time(9),
                    status="visited",
                    session_status="COMPLETED",
                    created_by=self.user.id,
                ),
                DoctorVisit(
                    patient_name="Pending",
                    patient_phone="2",
                    patient_address="B",
                    doctor_id=self.doctor.id,
                    visit_date=date(2026, 7, 28),
                    visit_time=time(11),
                    status="scheduled",
                    session_status="NOT_STARTED",
                    created_by=self.user.id,
                ),
            ]
        )
        self.db.commit()

        response = self.client.post(
            "/doctor/workday/end",
            json={
                "end_address": "End",
                "end_latitude": 13.02,
                "end_longitude": 77.0,
            },
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["total_visits_count"], 2)
        self.assertEqual(response.json()["completed_visits_count"], 1)
        self.assertEqual(response.json()["pending_visits_count"], 1)
        self.assertEqual(self.db.query(DoctorTravelWaypoint).count(), 2)

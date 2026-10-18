import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_task import DoctorTask
from app.models.doctor_travel_waypoint import DoctorTravelWaypoint
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.location_exception_request import LocationExceptionRequest
from app.models.user import User
from app.routers import (
    doctor_tasks,
    doctor_workday,
    location_exceptions,
    places,
)
from app.utils import uploads
from app.utils.auth import get_current_user
from app.utils.timezone import india_now

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
PLACE_LAT, PLACE_LNG = 13.0, 80.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class TaskApiFixture(unittest.TestCase):
    """Shared setup and helpers for the doctor task API tests."""

    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()

        self.temporary_uploads = tempfile.TemporaryDirectory()
        self.original_upload_root = uploads.UPLOAD_ROOT
        uploads.UPLOAD_ROOT = Path(self.temporary_uploads.name).resolve()

        self.head = self.create_user("Head", "head@example.com", "clinical_head")
        self.admin = self.create_user("Admin", "admin@example.com", "admin")
        self.therapist = self.create_user("T", "t@example.com", "therapist")
        doctor_user = self.create_user("Doctor", "d@example.com", "doctor")
        self.doctor = self.create_doctor(doctor_user, "Dr. Meera")
        other_user = self.create_user("Other", "o@example.com", "doctor")
        self.other_doctor = self.create_doctor(other_user, "Dr. Other")
        self.doctor_user = doctor_user
        self.other_user = other_user

        self.current_user = self.head
        app = FastAPI()
        for module in (doctor_tasks, places, doctor_workday, location_exceptions):
            app.include_router(module.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

        self.place_id = self.create_place()

    def tearDown(self):
        uploads.UPLOAD_ROOT = self.original_upload_root
        self.temporary_uploads.cleanup()
        self.db.close()
        self.engine.dispose()

    # ------------------------------------------------------------ fixtures
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

    def create_place(self, radius_m=200):
        response = self.client.post(
            "/places",
            json={
                "name": "City Clinic",
                "place_type": "clinic",
                "address": "1 Clinic Road, Chennai",
                "latitude": PLACE_LAT,
                "longitude": PLACE_LNG,
                "radius_m": radius_m,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def start_workday(self, doctor=None):
        doctor = doctor or self.doctor
        workday = DoctorWorkDay(
            doctor_id=doctor.id,
            work_date=india_now().date(),
            start_address="Start",
            start_latitude=12.9,
            start_longitude=79.9,
            started_at=datetime.now(timezone.utc),
            is_active=True,
        )
        self.db.add(workday)
        self.db.commit()
        return workday

    def assign(self, **overrides):
        body = {
            "doctor_id": self.doctor.id,
            "task_type": "clinic_training",
            "title": "Train clinic doctors",
            "scheduled_date": india_now().date().isoformat(),
            "place_id": self.place_id,
        }
        body.update(overrides)
        previous = self.current_user
        self.current_user = self.head
        try:
            return self.client.post("/doctor-tasks", json=body)
        finally:
            self.current_user = previous

    def as_doctor(self):
        self.current_user = self.doctor_user

    def punch_body(self, latitude=PLACE_LAT, longitude=PLACE_LNG, **extra):
        body = {
            "latitude": latitude,
            "longitude": longitude,
            "gps_accuracy_m": 10,
            "device_timestamp": _now_iso(),
        }
        body.update(extra)
        return body

    def punch_out(self, task_id, latitude=PLACE_LAT, longitude=PLACE_LNG, **extra):
        data = {
            "latitude": str(latitude),
            "longitude": str(longitude),
            "gps_accuracy_m": "10",
            "device_timestamp": _now_iso(),
        }
        data.update({key: str(value) for key, value in extra.items()})
        return self.client.post(
            f"/doctor-tasks/{task_id}/punch-out",
            data=data,
            files={"photo": ("proof.png", PNG, "image/png")},
        )


class DoctorTasksApiTests(TaskApiFixture):
    def test_assign_validates_type_specific_fields_and_permissions(self):
        missing_place = self.assign(place_id=None)
        self.assertEqual(missing_place.status_code, 422)

        missing_patient = self.assign(task_type="patient_visit", place_id=None)
        self.assertEqual(missing_patient.status_code, 422)

        yesterday = self.assign(
            scheduled_date=(india_now().date() - timedelta(days=1)).isoformat()
        )
        self.assertEqual(yesterday.status_code, 400)

        self.current_user = self.doctor_user
        forbidden = self.client.post("/doctor-tasks", json={})
        self.assertEqual(forbidden.status_code, 403)
        self.current_user = self.therapist
        self.assertEqual(self.client.get("/doctor-tasks").status_code, 403)

    def test_patient_visit_task_creates_a_visit_and_mirrors_its_state(self):
        response = self.assign(
            task_type="patient_visit",
            place_id=None,
            title="See patient before therapist",
            patient_name="Patient Alpha",
            patient_phone="9000000000",
            patient_address="Anna Nagar, Chennai",
            visit_time="10:00:00",
        )

        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertTrue(body["punch_via_visit"])
        self.assertFalse(body["can_punch_in"])
        self.assertEqual(body["status"], "assigned")
        visit = self.db.query(DoctorVisit).one()
        self.assertEqual(visit.doctor_id, self.doctor.id)
        self.assertEqual(body["doctor_visit_id"], visit.id)

        visit.session_status = "IN_PROGRESS"
        self.db.commit()
        self.as_doctor()
        mine = self.client.get("/doctor-tasks/my").json()
        self.assertEqual(mine[0]["status"], "in_progress")

        self.start_workday()
        blocked = self.client.post(
            f"/doctor-tasks/{body['id']}/punch-in",
            json=self.punch_body(),
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.headers["X-Error-Code"], "USE_VISIT_PUNCH")

    def test_punch_in_inside_radius_records_task_waypoint(self):
        self.start_workday()
        task_id = self.assign().json()["id"]
        self.as_doctor()

        response = self.client.post(
            f"/doctor-tasks/{task_id}/punch-in",
            json=self.punch_body(),
        )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "in_progress")
        self.assertTrue(response.json()["can_punch_out"])
        waypoint = self.db.query(DoctorTravelWaypoint).one()
        self.assertEqual(waypoint.waypoint_type, "TASK")
        self.assertEqual(waypoint.task_id, task_id)

        repeated = self.client.post(
            f"/doctor-tasks/{task_id}/punch-in",
            json=self.punch_body(),
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(self.db.query(DoctorTravelWaypoint).count(), 1)

    def test_punch_in_requires_workday_and_location(self):
        task_id = self.assign().json()["id"]
        self.as_doctor()

        no_workday = self.client.post(
            f"/doctor-tasks/{task_id}/punch-in",
            json=self.punch_body(),
        )
        self.assertEqual(no_workday.status_code, 400)
        self.assertEqual(no_workday.headers["X-Error-Code"], "WORKDAY_NOT_ACTIVE")

        self.start_workday()
        too_far = self.client.post(
            f"/doctor-tasks/{task_id}/punch-in",
            json=self.punch_body(latitude=PLACE_LAT + 0.1),
        )
        self.assertEqual(too_far.status_code, 400)
        self.assertEqual(
            too_far.headers["X-Error-Code"],
            "LOCATION_VERIFICATION_FAILED",
        )
        self.assertEqual(self.db.get(DoctorTask, task_id).status, "assigned")

    def test_only_one_task_can_be_active_and_it_blocks_workday_end(self):
        self.start_workday()
        first = self.assign().json()["id"]
        second = self.assign(title="Second session").json()["id"]
        self.as_doctor()
        self.client.post(f"/doctor-tasks/{first}/punch-in", json=self.punch_body())

        blocked = self.client.post(
            f"/doctor-tasks/{second}/punch-in",
            json=self.punch_body(),
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.headers["X-Error-Code"], "ANOTHER_WORK_IS_ACTIVE")

        today = self.client.get("/doctor/workday/today")
        self.assertEqual(today.status_code, 200, today.text)
        self.assertIn(
            "ACTIVE_TASK_BLOCKS_WORKDAY_END",
            today.json()["blocking_reasons"],
        )

        self.assertEqual(self.punch_out(first).status_code, 200)
        second_in = self.client.post(
            f"/doctor-tasks/{second}/punch-in",
            json=self.punch_body(),
        )
        self.assertEqual(second_in.status_code, 200, second_in.text)

    def test_punch_out_requires_photo_and_stores_proof(self):
        self.start_workday()
        task_id = self.assign().json()["id"]
        self.as_doctor()
        self.client.post(f"/doctor-tasks/{task_id}/punch-in", json=self.punch_body())

        no_photo = self.client.post(
            f"/doctor-tasks/{task_id}/punch-out",
            data={"latitude": "13.0", "longitude": "80.0"},
        )
        self.assertEqual(no_photo.status_code, 422)

        bad_file = self.client.post(
            f"/doctor-tasks/{task_id}/punch-out",
            data={
                "latitude": "13.0",
                "longitude": "80.0",
                "gps_accuracy_m": "10",
                "device_timestamp": _now_iso(),
            },
            files={"photo": ("proof.png", b"not an image", "image/png")},
        )
        self.assertEqual(bad_file.status_code, 400)
        self.assertEqual(self.db.get(DoctorTask, task_id).status, "in_progress")

        done = self.punch_out(task_id, notes="Trained four doctors")
        self.assertEqual(done.status_code, 200, done.text)
        body = done.json()
        self.assertEqual(body["status"], "completed")
        self.assertTrue(body["has_proof"])
        self.assertEqual(body["completion_notes"], "Trained four doctors")

        proof = self.client.get(f"/doctor-tasks/{task_id}/proof")
        self.assertEqual(proof.status_code, 200)
        self.assertEqual(proof.content, PNG)

        self.current_user = self.other_user
        self.assertEqual(
            self.client.get(f"/doctor-tasks/{task_id}/proof").status_code,
            404,
        )
        self.current_user = self.head
        reviewed = self.client.get(f"/doctor-tasks/{task_id}/review-proof")
        self.assertEqual(reviewed.status_code, 200)

    def test_doctor_cannot_use_another_doctors_task(self):
        self.start_workday(self.other_doctor)
        task_id = self.assign(doctor_id=self.other_doctor.id).json()["id"]
        self.as_doctor()

        response = self.client.post(
            f"/doctor-tasks/{task_id}/punch-in",
            json=self.punch_body(),
        )

        self.assertEqual(response.status_code, 404)

    def test_cancel_only_before_start(self):
        task_id = self.assign().json()["id"]
        cancelled = self.client.post(
            f"/doctor-tasks/{task_id}/cancel",
            json={"reason": "Clinic closed that day"},
        )
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        self.assertEqual(cancelled.json()["status"], "cancelled")

        started = self.assign().json()["id"]
        self.start_workday()
        self.as_doctor()
        self.client.post(f"/doctor-tasks/{started}/punch-in", json=self.punch_body())
        self.current_user = self.head
        late = self.client.post(
            f"/doctor-tasks/{started}/cancel",
            json={"reason": "Too late to cancel"},
        )
        self.assertEqual(late.status_code, 409)

    def test_location_exception_covers_a_task_and_is_consumed_once(self):
        self.start_workday()
        task_id = self.assign().json()["id"]
        self.as_doctor()
        far = {"latitude": PLACE_LAT + 0.1, "longitude": PLACE_LNG}

        requested = self.client.post(
            "/location-exceptions",
            json={
                "target_type": "doctor_task",
                "target_id": task_id,
                "action": "punch_in",
                "reason": "GPS drifts inside the basement clinic",
                "gps_accuracy_m": 20,
                "device_timestamp": _now_iso(),
                **far,
            },
        )
        self.assertEqual(requested.status_code, 200, requested.text)
        self.assertEqual(requested.json()["target_type"], "doctor_task")
        stored = self.db.query(LocationExceptionRequest).one()
        self.assertEqual(stored.doctor_task_id, task_id)
        self.assertEqual(stored.geofence_radius_m, 200)

        self.current_user = self.admin
        approved = self.client.put(
            f"/location-exceptions/{requested.json()['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Verified with the clinic",
                "version": requested.json()["version"],
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)

        self.as_doctor()
        punched = self.client.post(
            f"/doctor-tasks/{task_id}/punch-in",
            json=self.punch_body(
                location_exception_id=approved.json()["id"],
                **far,
            ),
        )
        self.assertEqual(punched.status_code, 200, punched.text)
        self.assertEqual(self.db.query(LocationExceptionRequest).one().status, "used")


if __name__ == "__main__":
    unittest.main()

import unittest
from datetime import datetime, timedelta, time, timezone

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.doctor import Doctor
from app.models.doctor_visit import DoctorVisit
from app.models.doctor_workday import DoctorWorkDay
from app.models.location_exception_request import LocationExceptionRequest
from app.models.domain_audit_event import DomainAuditEvent
from app.models.user import User
from app.routers import doctor_visit_sessions, location_exceptions, settings
from app.utils.auth import get_current_user
from app.utils.timezone import india_now


class LocationExceptionLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(bind=self.engine)
        self.db = self.session_factory()

        self.doctor_user = User(
            username="Exception Doctor",
            email="exception-doctor@example.com",
            password_hash="unused",
            role="doctor",
            is_active=True,
        )
        self.admin = User(
            username="Exception Admin",
            email="exception-admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.db.add_all([self.doctor_user, self.admin])
        self.db.flush()
        self.doctor = Doctor(
            user_id=self.doctor_user.id,
            name="Exception Doctor",
            specialization="General",
            phone="9999999999",
        )
        self.db.add(self.doctor)
        self.db.flush()
        self.db.add(
            DoctorWorkDay(
                doctor_id=self.doctor.id,
                work_date=india_now().date(),
                start_address="Doctor base",
                start_latitude=13.0,
                start_longitude=77.0,
                started_at=datetime.now(timezone.utc),
                is_active=True,
            )
        )
        self.db.commit()

        self.current_user = self.doctor_user
        app = FastAPI()
        app.include_router(location_exceptions.router)
        app.include_router(doctor_visit_sessions.router)
        app.include_router(settings.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def create_visit(self, *, patient_name="Patient"):
        visit = DoctorVisit(
            patient_name=patient_name,
            patient_phone="9999999998",
            patient_address="Patient destination",
            patient_latitude=13.0,
            patient_longitude=77.0,
            doctor_id=self.doctor.id,
            visit_date=india_now().date(),
            visit_time=time(9, 30),
            status="scheduled",
            session_status="NOT_STARTED",
            created_by=self.admin.id,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def request_payload(self, visit_id, **overrides):
        payload = {
            "target_type": "doctor_visit",
            "target_id": visit_id,
            "action": "punch_in",
            "reason": "GPS is inaccurate at the patient apartment.",
            "latitude": 13.01,
            "longitude": 77.0,
            "gps_accuracy_m": 85,
            "device_timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload.update(overrides)
        return payload

    def test_request_review_and_atomic_one_time_consumption(self):
        visit = self.create_visit()

        created = self.client.post(
            "/location-exceptions",
            json=self.request_payload(visit.id),
        )
        duplicate = self.client.post(
            "/location-exceptions",
            json=self.request_payload(visit.id),
        )

        self.assertEqual(created.status_code, 200, created.text)
        self.assertEqual(duplicate.status_code, 200, duplicate.text)
        self.assertEqual(created.json()["id"], duplicate.json()["id"])
        self.assertEqual(created.json()["status"], "pending")
        self.assertEqual(self.db.query(LocationExceptionRequest).count(), 1)

        self.current_user = self.admin
        pending = self.client.get("/location-exceptions?status=pending")
        self.assertEqual(pending.status_code, 200, pending.text)
        self.assertEqual(len(pending.json()), 1)
        approved = self.client.put(
            f"/location-exceptions/{created.json()['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Verified visit and GPS obstruction.",
                "version": created.json()["version"],
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["status"], "approved")

        self.current_user = self.doctor_user
        punched_in = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={
                "latitude": 13.01,
                "longitude": 77.0,
                "gps_accuracy_m": 85,
                "device_timestamp": datetime.now(timezone.utc).isoformat(),
                "location_exception_id": approved.json()["id"],
            },
        )
        self.assertEqual(punched_in.status_code, 200, punched_in.text)
        self.assertEqual(punched_in.json()["session_status"], "IN_PROGRESS")
        stored = self.db.query(LocationExceptionRequest).one()
        self.assertEqual(stored.status, "used")
        self.assertIsNotNone(stored.used_at)
        self.assertIsNone(stored.active_key)

        punch_out_check = self.client.get(
            f"/doctor-visits/{visit.id}/session",
            params={"latitude": 13.01, "longitude": 77.0},
        )
        self.assertEqual(punch_out_check.status_code, 200, punch_out_check.text)
        self.assertFalse(punch_out_check.json()["can_punch_out"])
        self.assertTrue(
            punch_out_check.json()["can_request_location_exception"]
        )
        punch_out_request = self.client.post(
            "/location-exceptions",
            json=self.request_payload(visit.id, action="punch_out"),
        )
        self.assertEqual(punch_out_request.status_code, 200, punch_out_request.text)
        self.current_user = self.admin
        punch_out_approval = self.client.put(
            f"/location-exceptions/{punch_out_request.json()['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Verified the same indoor GPS obstruction.",
                "version": punch_out_request.json()["version"],
            },
        )
        self.assertEqual(punch_out_approval.status_code, 200, punch_out_approval.text)
        self.current_user = self.doctor_user
        punched_out = self.client.post(
            f"/doctor-visits/{visit.id}/punch-out",
            json={
                "latitude": 13.01,
                "longitude": 77.0,
                "location_exception_id": punch_out_approval.json()["id"],
            },
        )
        self.assertEqual(punched_out.status_code, 200, punched_out.text)
        self.assertEqual(punched_out.json()["session_status"], "COMPLETED")
        self.assertEqual(
            self.db.query(LocationExceptionRequest)
            .filter(LocationExceptionRequest.id == punch_out_approval.json()["id"])
            .one()
            .status,
            "used",
        )
        for exception_id in [approved.json()["id"], punch_out_approval.json()["id"]]:
            self.assertEqual(
                [
                    event.action
                    for event in self.db.query(DomainAuditEvent)
                    .filter(
                        DomainAuditEvent.entity_type == "location_exception",
                        DomainAuditEvent.entity_id == str(exception_id),
                    )
                    .order_by(DomainAuditEvent.id)
                    .all()
                ],
                ["requested", "approved", "used"],
            )

        second_visit = self.create_visit(patient_name="Patient Two")
        replay = self.client.post(
            f"/doctor-visits/{second_visit.id}/punch-in",
            json={
                "latitude": 13.01,
                "longitude": 77.0,
                "location_exception_id": approved.json()["id"],
            },
        )
        self.assertEqual(replay.status_code, 403, replay.text)

    def test_rejection_allows_a_corrected_request(self):
        visit = self.create_visit()
        created = self.client.post(
            "/location-exceptions",
            json=self.request_payload(visit.id),
        )

        self.current_user = self.admin
        rejected = self.client.put(
            f"/location-exceptions/{created.json()['id']}/decision",
            json={
                "decision": "rejected",
                "reason": "Please recapture a more accurate position.",
                "version": created.json()["version"],
            },
        )
        self.assertEqual(rejected.status_code, 200, rejected.text)
        self.assertEqual(rejected.json()["status"], "rejected")

        self.current_user = self.doctor_user
        replacement = self.client.post(
            "/location-exceptions",
            json=self.request_payload(
                visit.id,
                reason="GPS was recaptured but remains blocked indoors.",
                gps_accuracy_m=45,
            ),
        )
        self.assertEqual(replacement.status_code, 200, replacement.text)
        self.assertNotEqual(replacement.json()["id"], created.json()["id"])
        self.assertEqual(replacement.json()["status"], "pending")

    def test_fresh_evidence_and_role_target_are_enforced(self):
        visit = self.create_visit()
        stale = self.client.post(
            "/location-exceptions",
            json=self.request_payload(
                visit.id,
                device_timestamp=(
                    datetime.now(timezone.utc) - timedelta(minutes=20)
                ).isoformat(),
            ),
        )
        wrong_target = self.client.post(
            "/location-exceptions",
            json=self.request_payload(
                visit.id,
                target_type="therapist_schedule",
            ),
        )
        unnecessary = self.client.post(
            "/location-exceptions",
            json=self.request_payload(
                visit.id,
                latitude=13.0,
                longitude=77.0,
            ),
        )

        self.assertEqual(stale.status_code, 422, stale.text)
        self.assertEqual(wrong_target.status_code, 403, wrong_target.text)
        self.assertEqual(unnecessary.status_code, 409, unnecessary.text)

    def test_non_admin_cannot_review_requests(self):
        visit = self.create_visit()
        created = self.client.post(
            "/location-exceptions",
            json=self.request_payload(visit.id),
        )

        listing = self.client.get("/location-exceptions?status=pending")
        decision = self.client.put(
            f"/location-exceptions/{created.json()['id']}/decision",
            json={
                "decision": "approved",
                "reason": "This should not be authorized.",
                "version": created.json()["version"],
            },
        )
        policy_update = self.client.put(
            "/settings/location-policy",
            json={
                "geofence_radius_m": 500,
                "gps_accuracy_threshold_m": 200,
                "evidence_max_age_minutes": 15,
                "approval_valid_hours": 8,
                "max_evidence_movement_m": 200,
            },
        )

        self.assertEqual(listing.status_code, 403, listing.text)
        self.assertEqual(decision.status_code, 403, decision.text)
        self.assertEqual(policy_update.status_code, 403, policy_update.text)

    def test_effective_policy_controls_geofence_and_is_snapshotted(self):
        visit = self.create_visit()
        self.current_user = self.admin
        updated = self.client.put(
            "/settings/location-policy",
            json={
                "geofence_radius_m": 500,
                "gps_accuracy_threshold_m": 200,
                "evidence_max_age_minutes": 10,
                "approval_valid_hours": 6,
                "max_evidence_movement_m": 150,
                "effective_from": india_now().date().isoformat(),
            },
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["version"], 2)
        policy_event = (
            self.db.query(DomainAuditEvent)
            .filter(DomainAuditEvent.entity_type == "location_policy")
            .one()
        )
        self.assertEqual(policy_event.domain, "configuration")
        self.assertEqual(policy_event.action, "version_created")
        self.assertEqual(policy_event.details["geofence_radius_m"], 500)

        self.current_user = self.doctor_user
        inside_configured_radius = self.client.get(
            f"/doctor-visits/{visit.id}/session",
            params={"latitude": 13.003, "longitude": 77.0},
        )
        self.assertEqual(
            inside_configured_radius.status_code,
            200,
            inside_configured_radius.text,
        )
        self.assertTrue(inside_configured_radius.json()["can_punch_in"])
        self.assertEqual(
            inside_configured_radius.json()["geofence_radius_m"],
            500,
        )

        exception = self.client.post(
            "/location-exceptions",
            json=self.request_payload(visit.id, latitude=13.01),
        )
        self.assertEqual(exception.status_code, 200, exception.text)
        self.assertEqual(exception.json()["location_policy_version"], 2)
        self.assertEqual(exception.json()["geofence_radius_m"], 500)
        self.assertEqual(exception.json()["approval_valid_hours"], 6)

        self.current_user = self.admin
        replacement = self.client.put(
            "/settings/location-policy",
            json={
                "geofence_radius_m": 750,
                "gps_accuracy_threshold_m": 250,
                "evidence_max_age_minutes": 20,
                "approval_valid_hours": 12,
                "max_evidence_movement_m": 300,
                "effective_from": india_now().date().isoformat(),
            },
        )
        history = self.client.get("/settings/location-policy/history")
        self.assertEqual(replacement.status_code, 200, replacement.text)
        self.assertEqual(replacement.json()["version"], 3)
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual([item["version"] for item in history.json()[:3]], [3, 2, 1])

        stored = (
            self.db.query(LocationExceptionRequest)
            .filter(LocationExceptionRequest.id == exception.json()["id"])
            .one()
        )
        self.assertEqual(stored.location_policy_version, 2)
        self.assertEqual(stored.geofence_radius_m, 500)
        self.assertEqual(stored.approval_valid_hours, 6)

    def test_location_policy_rejects_past_and_incoherent_thresholds(self):
        self.current_user = self.admin
        payload = {
            "geofence_radius_m": 100,
            "gps_accuracy_threshold_m": 100,
            "evidence_max_age_minutes": 15,
            "approval_valid_hours": 8,
            "max_evidence_movement_m": 100,
        }
        past = self.client.put(
            "/settings/location-policy",
            json={
                **payload,
                "effective_from": "2020-01-01",
            },
        )
        incoherent = self.client.put(
            "/settings/location-policy",
            json={
                **payload,
                "gps_accuracy_threshold_m": 250,
            },
        )

        self.assertEqual(past.status_code, 422, past.text)
        self.assertEqual(incoherent.status_code, 422, incoherent.text)

    def test_future_location_policy_does_not_change_today(self):
        self.current_user = self.admin
        tomorrow = india_now().date() + timedelta(days=1)
        scheduled = self.client.put(
            "/settings/location-policy",
            json={
                "geofence_radius_m": 600,
                "gps_accuracy_threshold_m": 200,
                "evidence_max_age_minutes": 20,
                "approval_valid_hours": 10,
                "max_evidence_movement_m": 200,
                "effective_from": tomorrow.isoformat(),
            },
        )
        current = self.client.get("/settings/location-policy")

        self.assertEqual(scheduled.status_code, 200, scheduled.text)
        self.assertEqual(scheduled.json()["version"], 2)
        self.assertEqual(current.status_code, 200, current.text)
        self.assertEqual(current.json()["version"], 1)
        self.assertEqual(current.json()["geofence_radius_m"], 250)

    def test_poor_accuracy_requires_and_consumes_exception_inside_radius(self):
        visit = self.create_visit()
        self.current_user = self.admin
        policy = self.client.put(
            "/settings/location-policy",
            json={
                "geofence_radius_m": 500,
                "gps_accuracy_threshold_m": 50,
                "evidence_max_age_minutes": 15,
                "approval_valid_hours": 8,
                "max_evidence_movement_m": 250,
            },
        )
        self.assertEqual(policy.status_code, 200, policy.text)

        self.current_user = self.doctor_user
        evidence_time = datetime.now(timezone.utc).isoformat()
        eligibility = self.client.get(
            f"/doctor-visits/{visit.id}/session",
            params={
                "latitude": 13.0,
                "longitude": 77.0,
                "gps_accuracy_m": 100,
                "device_timestamp": evidence_time,
            },
        )
        blocked = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={
                "latitude": 13.0,
                "longitude": 77.0,
                "gps_accuracy_m": 100,
                "device_timestamp": evidence_time,
            },
        )
        self.assertEqual(eligibility.status_code, 200, eligibility.text)
        self.assertFalse(eligibility.json()["can_punch_in"])
        self.assertTrue(eligibility.json()["can_request_location_exception"])
        self.assertEqual(blocked.status_code, 400, blocked.text)
        self.assertIn("configured limit", blocked.json()["detail"])

        requested = self.client.post(
            "/location-exceptions",
            json=self.request_payload(
                visit.id,
                latitude=13.0,
                longitude=77.0,
                gps_accuracy_m=100,
            ),
        )
        self.assertEqual(requested.status_code, 200, requested.text)
        self.assertEqual(requested.json()["evidence_quality"], "poor")

        self.current_user = self.admin
        approved = self.client.put(
            f"/location-exceptions/{requested.json()['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Verified indoor GPS accuracy limitation.",
                "version": requested.json()["version"],
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)

        self.current_user = self.doctor_user
        punched_in = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={
                "latitude": 13.0,
                "longitude": 77.0,
                "gps_accuracy_m": 100,
                "device_timestamp": datetime.now(timezone.utc).isoformat(),
                "location_exception_id": requested.json()["id"],
            },
        )
        self.assertEqual(punched_in.status_code, 200, punched_in.text)
        self.assertEqual(
            self.db.query(LocationExceptionRequest)
            .filter(LocationExceptionRequest.id == requested.json()["id"])
            .one()
            .status,
            "used",
        )

    def test_direct_punch_rejects_stale_or_incomplete_gps_evidence(self):
        visit = self.create_visit()
        stale = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={
                "latitude": 13.0,
                "longitude": 77.0,
                "gps_accuracy_m": 25,
                "device_timestamp": (
                    datetime.now(timezone.utc) - timedelta(minutes=20)
                ).isoformat(),
            },
        )
        incomplete = self.client.post(
            f"/doctor-visits/{visit.id}/punch-in",
            json={
                "latitude": 13.0,
                "longitude": 77.0,
                "gps_accuracy_m": 25,
            },
        )

        self.assertEqual(stale.status_code, 422, stale.text)
        self.assertIn("fresh GPS", stale.json()["detail"])
        self.assertEqual(incomplete.status_code, 422, incomplete.text)
        self.assertIn("complete GPS", incomplete.json()["detail"])


if __name__ == "__main__":
    unittest.main()

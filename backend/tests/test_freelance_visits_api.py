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
from app.models.freelance_visit import FreelanceVisit
from app.models.user import User
from app.routers import freelance_visits, freelancers, public_visits
from app.services.freelance_link_service import hash_token, normalize_phone
from app.utils import uploads
from app.utils.auth import get_current_user
from app.utils.domain_errors import DomainHTTPException, domain_exception_handler
from app.utils.timezone import india_now

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 32
PATIENT_LAT, PATIENT_LNG = 13.0, 80.0


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FreelanceFixture(unittest.TestCase):
    def setUp(self):
        public_visits._limiter.reset()
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
        self.doctor = self.create_user("Doc", "doc@example.com", "doctor")
        self.current_user = self.head

        app = FastAPI()
        app.add_exception_handler(DomainHTTPException, domain_exception_handler)
        for module in (freelancers, freelance_visits, public_visits):
            app.include_router(module.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

        self.freelancer = self.create_freelancer("Asha", "98765 43210")

    def tearDown(self):
        uploads.UPLOAD_ROOT = self.original_upload_root
        self.temporary_uploads.cleanup()
        self.db.close()
        self.engine.dispose()

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

    def as_user(self, user):
        self.current_user = user

    def create_freelancer(self, name, phone):
        response = self.client.post(
            "/freelancers", json={"name": name, "phone": phone}
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def assign(self, **overrides):
        body = {
            "freelancer_id": self.freelancer["id"],
            "patient_name": "Ravi Kumar",
            "patient_phone": "9000000001",
            "patient_address": "12 Anna Nagar, Chennai",
            "patient_latitude": PATIENT_LAT,
            "patient_longitude": PATIENT_LNG,
            "treatment_name": "Home physiotherapy",
            "visit_date": india_now().date().isoformat(),
            "fee_amount": "800",
        }
        body.update(overrides)
        return self.client.post("/freelance-visits", json=body)

    def token_of(self, created):
        return created["link"].rsplit("/", 1)[1]

    def start(self, token, **fields):
        data = {
            "latitude": PATIENT_LAT,
            "longitude": PATIENT_LNG,
            "gps_accuracy_m": 15,
            "device_timestamp": _now_iso(),
        }
        data.update(fields)
        data = {k: v for k, v in data.items() if v is not None}
        return self.client.post(f"/public/visits/{token}/start", data=data)

    def finish(self, token, photo=PNG, **fields):
        data = {
            "latitude": PATIENT_LAT,
            "longitude": PATIENT_LNG,
            "gps_accuracy_m": 15,
            "device_timestamp": _now_iso(),
        }
        data.update(fields)
        data = {k: v for k, v in data.items() if v is not None}
        files = {"photo": ("proof.png", photo, "image/png")} if photo else None
        return self.client.post(
            f"/public/visits/{token}/finish", data=data, files=files
        )


class DirectoryTests(FreelanceFixture):
    def test_phone_is_normalised_and_unique(self):
        self.assertEqual(self.freelancer["phone"], "9876543210")
        self.assertEqual(normalize_phone("+91 98765-43210"), "9876543210")
        duplicate = self.client.post(
            "/freelancers", json={"name": "Other", "phone": "09876543210"}
        )
        self.assertEqual(duplicate.status_code, 409)
        bad = self.client.post(
            "/freelancers", json={"name": "Bad", "phone": "12345"}
        )
        self.assertEqual(bad.status_code, 422)

    def test_lookup_search_and_deactivate(self):
        found = self.client.get("/freelancers/lookup", params={"phone": "9876543210"})
        self.assertEqual(found.json()["name"], "Asha")
        missing = self.client.get("/freelancers/lookup", params={"phone": "9123456780"})
        self.assertIsNone(missing.json())
        listing = self.client.get("/freelancers", params={"q": "ash"})
        self.assertEqual(len(listing.json()), 1)
        self.client.put(f"/freelancers/{self.freelancer['id']}", json={"active": False})
        self.assertEqual(self.client.get("/freelancers").json(), [])
        self.assertEqual(self.assign().status_code, 400)

    def test_doctor_cannot_manage_directory_or_assign(self):
        self.as_user(self.doctor)
        self.assertEqual(self.client.get("/freelancers").status_code, 403)
        self.assertEqual(self.assign().status_code, 403)


class AssignAndLinkTests(FreelanceFixture):
    def test_assign_returns_link_and_whatsapp_text_once(self):
        created = self.assign().json()
        self.assertIn("/v/", created["link"])
        self.assertTrue(created["whatsapp_url"].startswith("https://wa.me/919876543210"))
        self.assertIn("Rs 800", created["message"])
        self.assertTrue(created["visit"]["link_active"])
        row = self.db.query(FreelanceVisit).one()
        token = self.token_of(created)
        self.assertNotEqual(row.token_hash, token)
        self.assertEqual(row.token_hash, hash_token(token))
        self.assertNotIn("link", self.client.get("/freelance-visits").json()[0])

    def test_rejects_past_date_and_bad_times(self):
        yesterday = (india_now().date() - timedelta(days=1)).isoformat()
        self.assertEqual(self.assign(visit_date=yesterday).status_code, 400)
        self.assertEqual(
            self.assign(start_time="11:00:00", end_time="10:00:00").status_code,
            400,
        )

    def test_public_view_hides_internal_fields(self):
        token = self.token_of(self.assign(instructions="Ring the bell").json())
        view = self.client.get(f"/public/visits/{token}")
        self.assertEqual(view.status_code, 200)
        body = view.json()
        self.assertEqual(body["patient_name"], "Ravi Kumar")
        self.assertEqual(body["instructions"], "Ring the bell")
        self.assertIn("google.com/maps", body["maps_url"])
        for hidden in ("id", "token_hash", "doctor_id", "freelancer_id", "proof_file"):
            self.assertNotIn(hidden, body)

    def test_unknown_expired_and_cancelled_links_look_identical(self):
        unknown = self.client.get("/public/visits/not-a-real-token")
        created = self.assign().json()
        token = self.token_of(created)
        row = self.db.query(FreelanceVisit).one()
        row.token_expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.db.commit()
        expired = self.client.get(f"/public/visits/{token}")

        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(expired.status_code, 404)
        self.assertEqual(unknown.json(), expired.json())

        other = self.assign().json()
        self.client.post(
            f"/freelance-visits/{other['visit']['id']}/cancel",
            json={"reason": "Patient postponed"},
        )
        cancelled = self.client.get(f"/public/visits/{self.token_of(other)}")
        self.assertEqual(cancelled.json(), unknown.json())

    def test_new_link_and_reassign_revoke_the_old_link(self):
        created = self.assign().json()
        old = self.token_of(created)
        reissued = self.client.post(
            f"/freelance-visits/{created['visit']['id']}/new-link"
        ).json()
        self.assertEqual(self.client.get(f"/public/visits/{old}").status_code, 404)
        self.assertEqual(
            self.client.get(f"/public/visits/{self.token_of(reissued)}").status_code,
            200,
        )

        second = self.create_freelancer("Bala", "9123456780")
        reassigned = self.client.post(
            f"/freelance-visits/{created['visit']['id']}/reassign",
            json={"freelancer_id": second["id"], "fee_amount": "900"},
        ).json()
        self.assertEqual(
            self.client.get(f"/public/visits/{self.token_of(reissued)}").status_code,
            404,
        )
        view = self.client.get(f"/public/visits/{self.token_of(reassigned)}").json()
        self.assertEqual(view["freelancer_name"], "Bala")
        self.assertEqual(float(view["fee_amount"]), 900.0)

    def test_public_endpoints_are_rate_limited(self):
        limiter = public_visits._limiter
        original = limiter.max_calls
        limiter.max_calls = 3
        try:
            codes = [
                self.client.get("/public/visits/nope").status_code
                for _ in range(5)
            ]
        finally:
            limiter.max_calls = original
        self.assertEqual(codes, [404, 404, 404, 429, 429])


class PunchTests(FreelanceFixture):
    def setUp(self):
        super().setUp()
        self.created = self.assign().json()
        self.token = self.token_of(self.created)

    def row(self):
        self.db.expire_all()
        return self.db.query(FreelanceVisit).filter_by(
            id=self.created["visit"]["id"]
        ).one()

    def test_full_verified_flow(self):
        started = self.start(self.token)
        self.assertEqual(started.status_code, 200, started.text)
        self.assertEqual(started.json()["status"], "in_progress")
        finished = self.finish(self.token, notes="Done, patient comfortable")
        self.assertEqual(finished.status_code, 200, finished.text)
        row = self.row()
        self.assertEqual(row.status, "completed")
        self.assertFalse(row.location_unverified)
        self.assertTrue(row.proof_file)
        self.assertIsNotNone(row.duration_seconds)
        # Repeats are harmless.
        self.assertEqual(self.start(self.token).status_code, 200)
        self.assertEqual(self.finish(self.token).json()["status"], "completed")

    def test_far_away_needs_a_reason_then_is_flagged(self):
        far = {"latitude": 13.5, "longitude": 80.5}
        blocked = self.start(self.token, **far)
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.json()["code"], "LOCATION_REASON_REQUIRED")
        self.assertEqual(self.row().status, "assigned")

        allowed = self.start(self.token, reason="Gate was on another street", **far)
        self.assertEqual(allowed.status_code, 200, allowed.text)
        row = self.row()
        self.assertTrue(row.location_unverified)
        self.assertIn("Gate was on another street", row.unverified_reason)

    def test_missing_gps_needs_a_reason(self):
        no_gps = {"latitude": None, "longitude": None, "gps_accuracy_m": None}
        self.assertEqual(self.start(self.token, **no_gps).status_code, 400)
        ok = self.start(self.token, reason="Phone GPS is off", **no_gps)
        self.assertEqual(ok.status_code, 200, ok.text)
        self.assertTrue(self.row().location_unverified)

    def test_visit_without_patient_coordinates_is_always_unverified(self):
        row = self.row()
        row.patient_latitude = row.patient_longitude = None
        self.db.commit()
        self.assertEqual(self.start(self.token).status_code, 400)
        self.assertEqual(
            self.start(self.token, reason="Address not on map").status_code, 200
        )

    def test_start_only_on_the_visit_date(self):
        future = (india_now().date() + timedelta(days=2)).isoformat()
        later = self.assign(visit_date=future).json()
        response = self.start(self.token_of(later))
        self.assertEqual(response.status_code, 400)
        self.assertIn("visit date", response.json()["detail"])

    def test_finish_needs_start_and_photo(self):
        early = self.finish(self.token)
        self.assertEqual(early.status_code, 400)
        self.assertEqual(early.json()["code"], "VISIT_NOT_STARTED")

        self.start(self.token)
        no_photo = self.finish(self.token, photo=None)
        self.assertEqual(no_photo.status_code, 422)
        bad_photo = self.finish(self.token, photo=b"not an image")
        self.assertEqual(bad_photo.status_code, 400)
        self.assertEqual(self.row().status, "in_progress")

    def test_one_active_visit_per_freelancer(self):
        second = self.assign(patient_name="Second Patient").json()
        self.start(self.token)
        blocked = self.start(self.token_of(second))
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.json()["code"], "ANOTHER_VISIT_IS_ACTIVE")
        self.finish(self.token)
        self.assertEqual(self.start(self.token_of(second)).status_code, 200)

    def test_cancelled_visit_cannot_be_punched(self):
        self.client.post(
            f"/freelance-visits/{self.created['visit']['id']}/cancel",
            json={"reason": "Patient postponed"},
        )
        self.assertEqual(self.start(self.token).status_code, 404)


class PayoutTests(FreelanceFixture):
    def complete_one(self, **assign_overrides):
        created = self.assign(**assign_overrides).json()
        token = self.token_of(created)
        self.start(token)
        self.finish(token)
        return created["visit"]["id"]

    def test_state_machine_and_roles(self):
        visit_id = self.complete_one()

        # clinical_head assigns but cannot approve or pay
        self.assertEqual(
            self.client.post(f"/freelance-visits/{visit_id}/approve").status_code,
            403,
        )
        self.as_user(self.admin)
        self.assertEqual(
            self.client.post(
                f"/freelance-visits/{visit_id}/mark-paid",
                json={"payment_reference": "UTR123456"},
            ).status_code,
            400,
        )
        approved = self.client.post(f"/freelance-visits/{visit_id}/approve")
        self.assertEqual(approved.json()["status"], "approved")
        self.assertEqual(
            self.client.post(f"/freelance-visits/{visit_id}/approve").status_code,
            400,
        )
        paid = self.client.post(
            f"/freelance-visits/{visit_id}/mark-paid",
            json={"payment_reference": "UTR123456"},
        )
        self.assertEqual(paid.json()["status"], "paid")
        self.assertEqual(paid.json()["payment_reference"], "UTR123456")
        self.assertEqual(
            self.client.post(
                f"/freelance-visits/{visit_id}/cancel",
                json={"reason": "Too late now"},
            ).status_code,
            400,
        )

    def test_cannot_approve_an_unfinished_visit(self):
        created = self.assign().json()
        self.as_user(self.admin)
        response = self.client.post(
            f"/freelance-visits/{created['visit']['id']}/approve"
        )
        self.assertEqual(response.status_code, 400)

    def test_csv_export_is_admin_only_and_escapes_formulas(self):
        self.complete_one(patient_name="=HYPERLINK(\"http://x\")")
        self.assertEqual(self.client.get("/freelance-visits/export").status_code, 403)
        self.as_user(self.admin)
        response = self.client.get("/freelance-visits/export")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/csv", response.headers["content-type"])
        self.assertIn("Asha", response.text)
        self.assertIn("800.00", response.text)
        self.assertIn("'=HYPERLINK", response.text)
        self.assertNotIn(",=HYPERLINK", response.text)

    def test_proof_is_downloadable_by_staff_only(self):
        visit_id = self.complete_one()
        proof = self.client.get(f"/freelance-visits/{visit_id}/proof")
        self.assertEqual(proof.status_code, 200)
        self.assertEqual(proof.content, PNG)
        self.as_user(self.doctor)
        self.assertEqual(
            self.client.get(f"/freelance-visits/{visit_id}/proof").status_code, 403
        )


if __name__ == "__main__":
    unittest.main()

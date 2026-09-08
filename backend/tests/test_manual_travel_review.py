import unittest

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.manual_travel_review_event import ManualTravelReviewEvent
from app.models.domain_audit_event import DomainAuditEvent
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import claims, travel
from app.utils.auth import get_current_user
from app.utils.domain_errors import DomainHTTPException, domain_exception_handler
from app.utils.timezone import india_now


class ManualTravelReviewTests(unittest.TestCase):
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
            username="Manual Travel Therapist",
            email="manual-travel-therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.admin = User(
            username="Manual Travel Reviewer",
            email="manual-travel-reviewer@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.db.add_all([self.therapist, self.admin])
        self.db.add(
            ReimbursementPolicy(
                version=1,
                effective_from=india_now().date(),
                per_km_rate=8,
                daily_allowance=150,
            )
        )
        self.db.commit()
        self.current_user = self.therapist

        app = FastAPI()
        app.add_exception_handler(DomainHTTPException, domain_exception_handler)
        app.include_router(travel.router)
        app.include_router(claims.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def payload(self, **overrides):
        data = {
            "patient_name": "Patient Visit",
            "travel_date": india_now().date().isoformat(),
            "from_address": "Clinic",
            "to_address": "Patient area",
            "total_km": "8.5",
            "patient_visited": "true",
            "transport_mode": "vehicle",
            "manual_reason": "Automatic travel was unavailable after a device outage.",
        }
        data.update(overrides)
        return data

    def create_pending(self):
        response = self.client.post("/travel/", data=self.payload())
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()

    def test_correction_review_history_and_claim_eligibility(self):
        created = self.create_pending()
        self.assertEqual(created["manual_review_status"], "pending")
        self.assertEqual(created["manual_revision"], 1)
        self.assertEqual(created["available_actions"], ["edit", "cancel"])
        self.assertEqual(self.db.query(ManualTravelReviewEvent).count(), 1)
        automatic_travel = TravelEntry(
            therapist_id=self.therapist.id,
            travel_date=india_now(),
            from_address="Clinic",
            to_address="Patient address",
            total_km=4,
            per_km_rate=8,
            travel_fare=32,
            patient_visited=True,
            transport_mode="vehicle",
            schedule_id=999,
            status="draft",
        )
        self.db.add(automatic_travel)
        self.db.commit()

        blocked_claim = self.client.post("/claims/submit")
        self.assertEqual(blocked_claim.status_code, 409, blocked_claim.text)
        self.assertEqual(
            blocked_claim.json()["code"],
            "MANUAL_TRAVEL_REVIEW_REQUIRED",
        )
        self.db.refresh(automatic_travel)
        self.assertIsNone(automatic_travel.claim_id)

        self.current_user = self.admin
        pending = self.client.get("/travel/manual-review?status=pending")
        self.assertEqual(pending.status_code, 200, pending.text)
        self.assertEqual(len(pending.json()), 1)
        requested = self.client.put(
            f"/travel/manual-review/{created['id']}/decision",
            json={
                "decision": "changes_requested",
                "reason": "Clarify the destination and recalculate the route distance.",
                "version": created["manual_review_version"],
            },
        )
        self.assertEqual(requested.status_code, 200, requested.text)
        self.assertEqual(
            requested.json()["manual_review_status"],
            "changes_requested",
        )

        self.current_user = self.therapist
        corrected = self.client.put(
            f"/travel/{created['id']}",
            data=self.payload(
                to_address="Corrected patient area",
                total_km="9.25",
                correction_reason="Corrected the destination and recalculated distance.",
                version=str(requested.json()["manual_review_version"]),
            ),
        )
        self.assertEqual(corrected.status_code, 200, corrected.text)
        self.assertEqual(corrected.json()["manual_review_status"], "pending")
        self.assertEqual(corrected.json()["manual_revision"], 2)
        self.assertEqual(corrected.json()["total_km"], 9.25)

        history = self.client.get(f"/travel/{created['id']}/review-history")
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual(
            [event["event_type"] for event in history.json()],
            [
                "submitted_for_review",
                "changes_requested",
                "corrected_and_resubmitted",
            ],
        )
        self.assertEqual(history.json()[-1]["revision"], 2)

        self.current_user = self.admin
        approved = self.client.put(
            f"/travel/manual-review/{created['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Corrected route and distance are supported.",
                "version": corrected.json()["manual_review_version"],
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)
        self.assertEqual(approved.json()["manual_review_status"], "approved")

        self.current_user = self.therapist
        submitted = self.client.post("/claims/submit")
        self.assertEqual(submitted.status_code, 200, submitted.text)
        self.assertEqual(len(submitted.json()["included_travel_ids"]), 2)
        stored = self.db.query(TravelEntry).filter_by(id=created["id"]).one()
        self.assertEqual(stored.status, "submitted")
        self.assertIsNotNone(stored.claim_id)
        claim_event = (
            self.db.query(DomainAuditEvent)
            .filter(DomainAuditEvent.entity_type == "therapist_claim")
            .one()
        )
        self.assertEqual(claim_event.action, "submitted")
        self.assertEqual(claim_event.details["record_count"], 2)

    def test_version_guards_required_reason_and_soft_cancellation(self):
        missing_reason = self.client.post(
            "/travel/",
            data={key: value for key, value in self.payload().items() if key != "manual_reason"},
        )
        self.assertEqual(missing_reason.status_code, 422, missing_reason.text)
        created = self.create_pending()

        self.current_user = self.admin
        stale = self.client.put(
            f"/travel/manual-review/{created['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Attempted with a stale screen version.",
                "version": created["manual_review_version"] + 1,
            },
        )
        self.assertEqual(stale.status_code, 409, stale.text)

        self.current_user = self.therapist
        cancelled = self.client.delete(f"/travel/{created['id']}")
        self.assertEqual(cancelled.status_code, 200, cancelled.text)
        stored = self.db.query(TravelEntry).filter_by(id=created["id"]).one()
        self.assertEqual(stored.status, "cancelled")
        self.assertEqual(stored.manual_review_status, "cancelled")
        today = self.client.get("/travel/today")
        self.assertEqual(today.status_code, 200, today.text)
        self.assertEqual(today.json(), [])


if __name__ == "__main__":
    unittest.main()

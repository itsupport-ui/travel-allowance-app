import unittest
from datetime import date
from decimal import Decimal

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models.claim import Claim
from app.models.domain_audit_event import DomainAuditEvent
from app.models.reimbursement_policy import ReimbursementPolicy
from app.models.travel import TravelEntry
from app.models.user import User
from app.routers import claims, settings, travel
from app.services.reimbursement_policy_service import (
    doctor_receipt_is_required,
    money,
)
from app.utils.auth import get_current_user
from app.utils.timezone import india_now


class ReimbursementPolicyTests(unittest.TestCase):
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
            email="policy-admin@example.com",
            password_hash="unused",
            role="admin",
            is_active=True,
        )
        self.therapist = User(
            username="Therapist",
            email="policy-therapist@example.com",
            password_hash="unused",
            role="therapist",
            is_active=True,
        )
        self.initial_policy = ReimbursementPolicy(
            version=1,
            effective_from=date(1970, 1, 1),
            per_km_rate=Decimal("8.00"),
            daily_allowance=Decimal("150.00"),
        )
        self.db.add_all(
            [self.admin, self.therapist, self.initial_policy]
        )
        self.db.commit()

        app = FastAPI()
        app.include_router(settings.router)
        app.include_router(travel.router)
        app.include_router(claims.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.admin
        self.app = app
        self.client = TestClient(app)

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def use_user(self, user):
        self.app.dependency_overrides[get_current_user] = lambda: user

    def test_money_uses_explicit_half_up_rounding(self):
        self.assertEqual(money(Decimal("2.675")), Decimal("2.68"))

    def test_doctor_receipt_rule_is_explicit_and_boundary_safe(self):
        common = {"threshold": 500, "expense_category": "public_transport"}
        self.assertFalse(
            doctor_receipt_is_required(amount=499.99, is_manual=False, **common)
        )
        self.assertTrue(
            doctor_receipt_is_required(amount=500, is_manual=False, **common)
        )
        self.assertTrue(
            doctor_receipt_is_required(amount=10, threshold=500,
                expense_category="toll_parking", is_manual=False)
        )
        self.assertTrue(
            doctor_receipt_is_required(amount=10, threshold=500,
                expense_category="public_transport", is_manual=True)
        )
        self.assertFalse(
            doctor_receipt_is_required(amount=5000, threshold=500,
                expense_category="mileage", is_manual=False)
        )

    def test_reimbursement_policy_history_is_admin_only_and_ordered(self):
        today = india_now().date()
        created = self.client.put(
            "/settings/",
            json={
                "per_km_rate": 9,
                "daily_allowance": 160,
                "doctor_receipt_threshold": 450,
                "effective_from": today.isoformat(),
            },
        )
        self.assertEqual(created.status_code, 200, created.text)
        history = self.client.get("/settings/reimbursement-policy/history")
        self.assertEqual(history.status_code, 200, history.text)
        self.assertEqual([item["version"] for item in history.json()], [2, 1])
        self.assertEqual(history.json()[0]["doctor_receipt_threshold"], 450)

        self.use_user(self.therapist)
        forbidden = self.client.get("/settings/reimbursement-policy/history")
        self.assertEqual(forbidden.status_code, 403, forbidden.text)

    def test_rate_changes_create_versions_and_preserve_snapshots(self):
        today = india_now().date()

        response = self.client.put(
            "/settings/",
            json={
                "per_km_rate": 9.25,
                "daily_allowance": 175.55,
                "doctor_receipt_threshold": 425.50,
                "effective_from": today.isoformat(),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["version"], 2)
        self.assertEqual(response.json()["doctor_receipt_threshold"], 425.5)
        policy_event = (
            self.db.query(DomainAuditEvent)
            .filter(DomainAuditEvent.entity_type == "reimbursement_policy")
            .one()
        )
        self.assertEqual(policy_event.domain, "configuration")
        self.assertEqual(policy_event.action, "version_created")
        self.assertEqual(policy_event.to_state, "version_2")
        self.assertEqual(policy_event.details["per_km_rate"], "9.25")
        self.assertEqual(
            policy_event.details["doctor_receipt_threshold"], "425.50"
        )
        self.db.refresh(self.initial_policy)
        self.assertEqual(self.initial_policy.effective_to, today)
        self.assertEqual(
            self.initial_policy.per_km_rate,
            Decimal("8.00"),
        )

        self.use_user(self.therapist)
        response = self.client.post(
            "/travel/",
            data={
                "patient_name": "Test patient",
                "travel_date": today.isoformat(),
                "from_address": "Origin",
                "to_address": "Destination",
                "total_km": "2.15",
                "patient_visited": "true",
                "transport_mode": "vehicle",
                "manual_reason": (
                    "Automatic travel was unavailable during the field visit."
                ),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        travel_data = response.json()
        self.assertEqual(travel_data["policy_id"], 2)
        self.assertEqual(travel_data["per_km_rate"], 9.25)
        self.assertEqual(travel_data["travel_fare"], 19.89)

        self.use_user(self.admin)
        response = self.client.put(
            "/settings/",
            json={
                "per_km_rate": 10,
                "daily_allowance": 180,
                "doctor_receipt_threshold": 500,
                "effective_from": today.isoformat(),
            },
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["version"], 3)
        self.assertEqual(response.json()["doctor_receipt_threshold"], 500)

        inherited = self.client.put(
            "/settings/",
            json={
                "per_km_rate": 10.5,
                "daily_allowance": 181,
                "effective_from": today.isoformat(),
            },
        )
        self.assertEqual(inherited.status_code, 200, inherited.text)
        self.assertEqual(inherited.json()["doctor_receipt_threshold"], 500)
        approved = self.client.put(
            f"/travel/manual-review/{travel_data['id']}/decision",
            json={
                "decision": "approved",
                "reason": "Manual route evidence is sufficient for reimbursement.",
                "version": travel_data["manual_review_version"],
            },
        )
        self.assertEqual(approved.status_code, 200, approved.text)

        stored_travel = self.db.query(TravelEntry).one()
        self.assertEqual(stored_travel.policy_id, 2)
        self.assertEqual(stored_travel.per_km_rate, Decimal("9.25"))
        self.assertEqual(stored_travel.travel_fare, Decimal("19.89"))

        self.use_user(self.therapist)
        response = self.client.post("/claims/submit")
        self.assertEqual(response.status_code, 200, response.text)
        claim_data = response.json()
        self.assertEqual(claim_data["policy_id"], 4)
        self.assertEqual(claim_data["per_km_rate"], 10.5)
        self.assertEqual(claim_data["travel_total"], 19.89)
        self.assertEqual(claim_data["daily_allowance"], 181)
        self.assertEqual(claim_data["grand_total"], 200.89)
        self.assertEqual(claim_data["included_travel_ids"], [stored_travel.id])

        stored_claim = self.db.query(Claim).one()
        self.assertEqual(stored_claim.grand_total, Decimal("200.89"))
        self.assertEqual(stored_claim.calculation_version, "decimal-v1")
        self.assertEqual(stored_claim.rounding_mode, "ROUND_HALF_UP")


if __name__ == "__main__":
    unittest.main()
